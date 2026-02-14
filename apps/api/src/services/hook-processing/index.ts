import {
	db,
	endClaudeSession,
	getTaskByClaudeSessionId,
	getWorkspaceByFolderPath,
	insertHookEvent,
	pruneEndedSessionEvents,
	pruneOldHookEvents,
	stripOldHookEventBodies,
	upsertClaudeSession,
} from "@polygousse/database";
import type { FastifyBaseLogger } from "fastify";
import { orchestratorBus } from "../../orchestrator.js";
import { broadcast } from "../../ws/index.js";
import { tryLinkNewSession } from "./plan-handoff.js";
import { processRalphSessionStart, processRalphStop } from "./ralph-events.js";
import { type HookEventBody, resolveStatus } from "./resolve-status.js";
import { debugHooks, isHooksDebugEnabled } from "../../debug.js";
import { fileLog } from "../../file-logger.js";
import { prettyHookEvent, prettyLog } from "../../pretty-log.js";

export type { HookEventBody, HookEventName } from "./resolve-status.js";

/** Max hook events to retain in the database */
const HOOK_EVENTS_MAX_ROWS = 2_000;
/** Prune old events every N inserts to amortize the DELETE cost */
const PRUNE_INTERVAL = 50;
let insertCount = 0;

/**
 * Process a hook event from the CLI: store it, handle plan-handoff linking,
 * ralph loop events, and session status updates.
 *
 * Returns the upserted session (if status changed) or null for 204 responses.
 */
export async function processHookEvent(body: HookEventBody, log: FastifyBaseLogger) {
	if (isHooksDebugEnabled) prettyHookEvent(body);
	const { session_id, hook_event_name, cwd, notification_type, message } = body;
	debugHooks(`Event: ${hook_event_name}`, session_id);

	// Store raw event and broadcast for debug view
	const rawBody = JSON.stringify(body);
	const hookEvent = insertHookEvent.get(
		session_id,
		hook_event_name,
		cwd,
		notification_type ?? null,
		message ?? null,
		rawBody,
	);
	if (hookEvent) {
		broadcast({ type: "hook-event:raw", event: hookEvent });
	}

	// Periodically prune old hook events to prevent unbounded table growth
	insertCount++;
	if (insertCount >= PRUNE_INTERVAL) {
		insertCount = 0;
		const pruned = pruneOldHookEvents.run(HOOK_EVENTS_MAX_ROWS);
		const stripped = stripOldHookEventBodies.run();
		if (pruned.changes || stripped.changes) {
			prettyLog("db-cleanup", `Periodic: pruned ${pruned.changes} rows, stripped ${stripped.changes} bodies`);
		}
	}

	// Notify the orchestrator bus (used by plan+ralph background flow)
	debugHooks("Emitting to orchestrator bus", session_id);
	orchestratorBus.emit("hook:received", body);

	// Look up task via join through terminal_session_id
	let task = getTaskByClaudeSessionId.get(session_id);
	fileLog({
		level: "info", cat: "hook", event: hook_event_name, sid: session_id,
		taskId: task?.id, msg: `Hook processed: ${hook_event_name}`,
		data: { cwd, notification_type, has_task: !!task },
	});

	// Plan mode handoff: new session spawned after exiting plan mode
	if (!task && hook_event_name === "SessionStart") {
		debugHooks("Attempting plan-handoff link", session_id);
		task = await tryLinkNewSession(session_id, cwd, body, log);
	}

	// Process ralph loop fields on SessionStart
	if (hook_event_name === "SessionStart") {
		debugHooks("Processing ralph SessionStart", session_id);
		processRalphSessionStart(session_id, body);
	}

	// Mark ralph session as completed when Stop arrives with <ralph:done/> or limit hit
	let limitHit = false;
	if (hook_event_name === "Stop") {
		debugHooks("Processing ralph Stop", session_id);
		({ limitHit } = processRalphStop(body));
	}

	if (!task) {
		return null;
	}

	// Only update session status for events that affect it
	const lastAssistantMessage = body.last_assistant_message as string | undefined;
	let status = resolveStatus(hook_event_name, notification_type, lastAssistantMessage);
	if (status === null) {
		return null;
	}

	// Override idle → limit_hit when Claude hit its usage limit
	if (status === "idle" && limitHit) {
		status = "limit_hit";
	}

	// Resolve workspace from cwd
	const workspace = getWorkspaceByFolderPath.get(cwd, cwd);
	const workspaceId = workspace?.id ?? null;

	let session: ReturnType<typeof upsertClaudeSession.get>;

	if (hook_event_name === "SessionEnd") {
		session = endClaudeSession.get(session_id);
	} else {
		session = upsertClaudeSession.get(
			session_id,
			workspaceId,
			status,
			cwd,
			message ?? null,
			notification_type ?? null,
			hook_event_name,
		);
	}

	if (session) {
		debugHooks(`Resolved status: ${status}`, session_id);
		fileLog({ level: "info", cat: "hook", event: "status-resolved", sid: session_id, taskId: task.id, msg: `Status resolved: ${status}` });
		broadcast({ type: "claude-session:updated", session });
	}

	return session;
}

/**
 * One-time cleanup on API boot: prune + strip old hook events,
 * clean up session_events for ended sessions, and VACUUM to reclaim disk space.
 */
export function initHookEventCleanup() {
	const pruned = pruneOldHookEvents.run(HOOK_EVENTS_MAX_ROWS);
	const stripped = stripOldHookEventBodies.run();
	const sessionEvents = pruneEndedSessionEvents.run();
	db.exec("VACUUM");
	prettyLog(
		"db-cleanup",
		`Boot cleanup: pruned ${pruned.changes} hook events, stripped ${stripped.changes} bodies, removed ${sessionEvents.changes} session events, VACUUM done`,
	);
}
