import { readFile } from "node:fs/promises";
import {
	createClaudeSessionPreparing,
	getClaudeSessionById,
	getRecentlyEndedSessionByCwd,
	getTaskByClaudeSessionId,
	getWorkspaceByFolderPath,
} from "@polygousse/database";
import type { FastifyBaseLogger } from "fastify";
import { debugHooks } from "../../debug.js";
import { broadcast } from "../../ws/index.js";
import type { HookEventBody } from "./resolve-status.js";

/**
 * When Claude exits plan mode, it spawns a new session with a new ID.
 * The new session's first user message contains a back-reference like:
 *   "read the full transcript at: /path/to/{previous-session-id}.jsonl"
 * We parse this to link the new session to the same terminal session.
 */
export async function extractPreviousSessionId(transcriptPath: string): Promise<string | null> {
	try {
		const content = await readFile(transcriptPath, "utf-8");
		const lines = content.split("\n");

		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const entry = JSON.parse(line);
				if (entry.type !== "user" || !entry.message?.content) continue;

				const text =
					typeof entry.message.content === "string"
						? entry.message.content
						: JSON.stringify(entry.message.content);

				const match = text.match(
					/read the full transcript at:\s*\S+\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl/i,
				);
				if (match) {
					return match[1];
				}
			} catch {
				// Skip unparseable lines
			}
		}
	} catch {
		// Transcript file not found or unreadable
	}
	return null;
}

/**
 * On SessionStart, try to link a new Claude session to an existing terminal session.
 * Returns the updated task lookup result (or null if linking failed).
 */
export async function tryLinkNewSession(
	sessionId: string,
	cwd: string,
	body: HookEventBody,
	log: FastifyBaseLogger,
) {
	const envTerminalSessionId = body.terminal_session_id as string | undefined;
	let linked = false;

	// Strategy 0: Use terminal_session_id from env var (injected by CLI from tmux shell)
	if (envTerminalSessionId) {
		const workspace = getWorkspaceByFolderPath.get(cwd, cwd);
		const workspaceId = workspace?.id ?? null;
		const created = createClaudeSessionPreparing.get(
			sessionId,
			workspaceId,
			cwd,
			envTerminalSessionId,
		);
		debugHooks(`env-var linked to terminal ${envTerminalSessionId.slice(0, 8)}`, sessionId);
		if (created) {
			broadcast({ type: "claude-session:created", session: created });
			linked = true;
		}
		const task = getTaskByClaudeSessionId.get(sessionId);
		if (linked) return task;
	}

	// Strategy 1 & 2: Fallback heuristics (transcript parsing + CWD lookup)
	const transcriptPath = body.transcript_path as string | undefined;
	let previousSession = null as Awaited<ReturnType<typeof getClaudeSessionById.get>> | null;

	// Strategy 1: Parse the transcript for a back-reference to the previous session
	if (transcriptPath) {
		const previousSessionId = await extractPreviousSessionId(transcriptPath);
		debugHooks(`transcript ref → ${previousSessionId?.slice(0, 8) ?? "none"}`, sessionId);
		if (previousSessionId) {
			previousSession = getClaudeSessionById.get(previousSessionId) ?? null;
		}
	}

	// Strategy 2: Fallback — find the most recently completed session in the same cwd
	if (!previousSession?.terminal_session_id) {
		const fallback = getRecentlyEndedSessionByCwd.get(cwd);
		debugHooks(`cwd fallback → ${fallback?.id?.slice(0, 8) ?? "none"}`, sessionId);
		if (fallback?.terminal_session_id) {
			previousSession = fallback;
		}
	}

	if (previousSession?.terminal_session_id) {
		const created = createClaudeSessionPreparing.get(
			sessionId,
			previousSession.workspace_id,
			cwd,
			previousSession.terminal_session_id,
		);
		debugHooks(`linked → terminal ${created?.terminal_session_id?.slice(0, 8) ?? "?"}`, sessionId);
		if (created) {
			broadcast({ type: "claude-session:created", session: created });
		}
		const task = getTaskByClaudeSessionId.get(sessionId);
		debugHooks(task ? `task re-check → found #${task.id}` : "task re-check → not found", sessionId);
		return task;
	}

	return null;
}
