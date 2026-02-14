/**
 * Granular debug logging — env-var-gated per category.
 *
 * Each debug function is resolved at import time: if the corresponding
 * env var is unset, it returns a no-op (zero overhead). If set, it
 * delegates to `prettyLog()` with a `dbg:` prefixed subsystem label.
 *
 * ## Environment variables
 *
 * Set any of these to a truthy value (e.g. `=1`) to enable the category.
 *
 * | Variable                          | Category       | What it logs                                                      |
 * | --------------------------------- | -------------- | ----------------------------------------------------------------- |
 * | `POLYGOUSSE_DEBUG_ORCHESTRATOR`   | orchestrator   | State machine transitions, hook wait/match/timeout, session end   |
 * | `POLYGOUSSE_DEBUG_SETTINGS`       | settings       | Setting reads, upserts, and deletes                               |
 * | `POLYGOUSSE_DEBUG_TASK_LIFECYCLE` | task-lifecycle | Task creation, status transitions, start routing, tmux commands,  |
 * |                                   |                | session teardown (tmux kill, worktree removal, DB completion)     |
 * | `POLYGOUSSE_DEBUG_HOOKS`          | hooks          | Hook event processing pipeline: event entry, orchestrator bus     |
 * |                                   |                | emit, plan-handoff, ralph start/stop, resolved session status     |
 * | `POLYGOUSSE_DEBUG_WS`             | ws             | WebSocket dispatch (action name, success/error), broadcast        |
 * |                                   |                | (event type + client count)                                       |
 * | `POLYGOUSSE_DEBUG_ALL`            | *all*          | Enables every category above                                      |
 *
 * ## Usage
 *
 * Enable a single category:
 *
 *   POLYGOUSSE_DEBUG_ORCHESTRATOR=1 bun run dev
 *
 * Combine multiple categories:
 *
 *   POLYGOUSSE_DEBUG_ORCHESTRATOR=1 POLYGOUSSE_DEBUG_HOOKS=1 bun run dev
 *
 * Enable everything:
 *
 *   POLYGOUSSE_DEBUG_ALL=1 bun run dev
 *
 * With no variables set, all debug functions are no-ops (zero runtime cost).
 *
 * ## Output format
 *
 * Debug lines are printed via `prettyLog` with a `dbg:<category>` subsystem
 * label and a distinct ANSI color per category. When a session ID is
 * available, it is included as a colored `[shortId]` prefix:
 *
 *   10:18:23 [3ec34bf3] dbg:orchestrator    Entering state "waitForPlan" (step: plan)
 *   10:18:24              dbg:ws              Broadcast: task:updated -> 2 client(s)
 */

import { fileLog } from "./file-logger.js";
import { prettyLog } from "./pretty-log.js";

type DebugCategory = "orchestrator" | "settings" | "task-lifecycle" | "hooks" | "ws";

const ENV_MAP: Record<DebugCategory, string> = {
	orchestrator: "POLYGOUSSE_DEBUG_ORCHESTRATOR",
	settings: "POLYGOUSSE_DEBUG_SETTINGS",
	"task-lifecycle": "POLYGOUSSE_DEBUG_TASK_LIFECYCLE",
	hooks: "POLYGOUSSE_DEBUG_HOOKS",
	ws: "POLYGOUSSE_DEBUG_WS",
};

type DebugFn = (message: string, sessionId?: string) => void;

function isTruthy(value: string | undefined): boolean {
	return !!value && value !== "0" && value.toLowerCase() !== "false";
}

function makeDebugFn(category: DebugCategory): DebugFn {
	const allEnabled = isTruthy(process.env.POLYGOUSSE_DEBUG_ALL);
	const categoryEnabled = isTruthy(process.env[ENV_MAP[category]]);
	const subsystem = `dbg:${category}`;

	if (allEnabled || categoryEnabled) {
		// Console + file (prettyLog already calls fileLog)
		return (message: string, sessionId?: string) => {
			prettyLog(subsystem, message, sessionId);
		};
	}

	// File only — no console output
	return (message: string, sessionId?: string) => {
		fileLog({ level: "debug", cat: subsystem, msg: message, sid: sessionId });
	};
}

export const debugOrchestrator = makeDebugFn("orchestrator");
export const debugSettings = makeDebugFn("settings");
export const debugTaskLifecycle = makeDebugFn("task-lifecycle");
export const debugHooks = makeDebugFn("hooks");
export const isHooksDebugEnabled =
	isTruthy(process.env.POLYGOUSSE_DEBUG_ALL) || isTruthy(process.env[ENV_MAP.hooks]);
export const debugWs = makeDebugFn("ws");
