import {
	type ClaudeSession,
	db,
	type HookEvent,
	type RalphClaudeSession,
	type RalphSession,
	type Task,
	type TerminalSession,
} from "@polygousse/database";
import { getOrchestratorState } from "../orchestrator.js";

/**
 * Enrich a single terminal session (used for single-session lookups).
 * Kept for the `/sessions/debug/:terminalSessionId` route.
 */
export const enrichTerminal = (ts: TerminalSession) => {
	return enrichTerminals([ts])[0]!;
};

/**
 * Batch-enrich multiple terminal sessions with a fixed number of queries
 * instead of M × (3 + 2N) queries (N+1 pattern).
 *
 * Runs 5 queries total regardless of how many terminal/claude sessions exist:
 *   1. Tasks by session_id IN (...)
 *   2. Ralph sessions by terminal_session_id IN (...)
 *   3. Claude sessions by terminal_session_id IN (...)
 *   4. Ralph-claude links by claude_session_id IN (...)
 *   5. Hook events by session_id IN (...)
 */
export function enrichTerminals(sessions: TerminalSession[]) {
	if (sessions.length === 0) return [];

	const terminalIds = sessions.map((s) => s.id);

	// 1. Batch-fetch tasks by session_id
	const tasksBySessionId = new Map<string, Task>();
	if (terminalIds.length > 0) {
		const placeholders = terminalIds.map(() => "?").join(",");
		const tasks = db
			.query<Task, string[]>(`SELECT * FROM tasks WHERE session_id IN (${placeholders})`)
			.all(...terminalIds);
		for (const t of tasks) {
			if (t.session_id) tasksBySessionId.set(t.session_id, t);
		}
	}

	// 2. Batch-fetch ralph sessions by terminal_session_id
	const ralphByTerminalId = new Map<string, RalphSession>();
	{
		const placeholders = terminalIds.map(() => "?").join(",");
		const ralphs = db
			.query<RalphSession, string[]>(
				`SELECT * FROM ralph_sessions WHERE terminal_session_id IN (${placeholders})`,
			)
			.all(...terminalIds);
		for (const r of ralphs) {
			ralphByTerminalId.set(r.terminal_session_id, r);
		}
	}

	// 3. Batch-fetch claude sessions by terminal_session_id
	const claudeByTerminalId = new Map<string, ClaudeSession[]>();
	{
		const placeholders = terminalIds.map(() => "?").join(",");
		const claudeSessions = db
			.query<ClaudeSession, string[]>(
				`SELECT * FROM claude_sessions WHERE terminal_session_id IN (${placeholders}) ORDER BY started_at DESC`,
			)
			.all(...terminalIds);
		for (const cs of claudeSessions) {
			if (!cs.terminal_session_id) continue;
			const list = claudeByTerminalId.get(cs.terminal_session_id);
			if (list) {
				list.push(cs);
			} else {
				claudeByTerminalId.set(cs.terminal_session_id, [cs]);
			}
		}
	}

	// Collect all claude session IDs for sub-queries
	const allClaudeIds: string[] = [];
	for (const list of claudeByTerminalId.values()) {
		for (const cs of list) {
			allClaudeIds.push(cs.id);
		}
	}

	// 4. Batch-fetch ralph-claude links by claude_session_id
	const ralphLinkByClaudeId = new Map<string, RalphClaudeSession>();
	if (allClaudeIds.length > 0) {
		const placeholders = allClaudeIds.map(() => "?").join(",");
		const links = db
			.query<RalphClaudeSession, string[]>(
				`SELECT * FROM ralph_claude_sessions WHERE claude_session_id IN (${placeholders})`,
			)
			.all(...allClaudeIds);
		for (const link of links) {
			ralphLinkByClaudeId.set(link.claude_session_id, link);
		}
	}

	// 5. Batch-fetch hook events by session_id (limited to 100 per session via window function)
	const hookEventsBySessionId = new Map<string, HookEvent[]>();
	if (allClaudeIds.length > 0) {
		const placeholders = allClaudeIds.map(() => "?").join(",");
		const events = db
			.query<HookEvent, string[]>(
				`SELECT * FROM (
					SELECT *, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY id DESC) AS rn
					FROM hook_events
					WHERE session_id IN (${placeholders})
				) WHERE rn <= 100`,
			)
			.all(...allClaudeIds);
		for (const ev of events) {
			if (!ev.session_id) continue;
			const list = hookEventsBySessionId.get(ev.session_id);
			if (list) {
				list.push(ev);
			} else {
				hookEventsBySessionId.set(ev.session_id, [ev]);
			}
		}
	}

	// Assemble enriched results
	return sessions.map((ts) => {
		const task = tasksBySessionId.get(ts.id);
		const ralphSession = ralphByTerminalId.get(ts.id);
		const orchestrator = getOrchestratorState(ts.id);
		const claudeSessions = claudeByTerminalId.get(ts.id) ?? [];

		return {
			...ts,
			taskTitle: task?.title ?? null,
			orchestrator: orchestrator ?? null,
			ralphSession: ralphSession
				? {
						id: ralphSession.id,
						max_iterations: ralphSession.max_iterations,
						current_iteration: ralphSession.current_iteration,
						status: ralphSession.status,
					}
				: null,
			agentSessions: claudeSessions.map((as) => {
				const ralphLink = ralphLinkByClaudeId.get(as.id);
				return {
					...as,
					ralphIteration: ralphLink?.iteration ?? null,
					hookEvents: hookEventsBySessionId.get(as.id) ?? [],
				};
			}),
		};
	});
}
