import { db } from "../connection.js";
import type { ClaudeSession } from "./claude-sessions.js";
import type { HookEvent } from "./hook-events.js";
import type { RalphSession } from "./ralph-sessions.js";

export type { TerminalSession, TerminalSessionStatus } from "@polygousse/types";

import type { TerminalSession } from "@polygousse/types";

export const createTerminalSession = db.prepare<TerminalSession, [string, number | null, string]>(
	"INSERT INTO terminal_sessions (id, workspace_id, cwd) VALUES (?, ?, ?) RETURNING *",
);

export const getTerminalSessionById = db.prepare<TerminalSession, [string]>(
	"SELECT * FROM terminal_sessions WHERE id = ?",
);

export const getActiveTerminalSessions = db.prepare<TerminalSession, []>(
	"SELECT * FROM terminal_sessions WHERE status = 'active' ORDER BY started_at DESC",
);

export const getUnusedActiveTerminalSessions = db.prepare<TerminalSession, []>(
	`SELECT ts.* FROM terminal_sessions ts
   LEFT JOIN tasks t ON t.session_id = ts.id
   WHERE ts.status = 'active' AND t.id IS NULL
   ORDER BY ts.started_at DESC`,
);

export const getCompletedTerminalSessions = db.prepare<TerminalSession, []>(
	"SELECT * FROM terminal_sessions WHERE status = 'completed' ORDER BY ended_at DESC LIMIT 20",
);

export const completeTerminalSession = db.prepare<TerminalSession, [string]>(
	"UPDATE terminal_sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ? RETURNING *",
);

export const getClaudeSessionsByTerminalId = db.prepare<ClaudeSession, [string]>(
	"SELECT * FROM claude_sessions WHERE terminal_session_id = ? ORDER BY started_at DESC",
);

export const getHookEventsBySessionId = db.prepare<HookEvent, [string]>(
	"SELECT * FROM hook_events WHERE session_id = ? ORDER BY id DESC LIMIT 100",
);

// Prepared statements used internally by teardownSessionDb
const _completeClaudeSession = db.prepare<ClaudeSession, [string]>(
	`UPDATE claude_sessions
   SET status = 'completed', last_event_at = datetime('now'), ended_at = datetime('now')
   WHERE id = ?
   RETURNING *`,
);

const _completeRalphSession = db.prepare<RalphSession, [string, string]>(
	"UPDATE ralph_sessions SET status = ?, completed_at = datetime('now') WHERE id = ? RETURNING *",
);

const _getRalphSessionByTerminalId = db.prepare<RalphSession, [string]>(
	"SELECT * FROM ralph_sessions WHERE terminal_session_id = ?",
);

const _deleteSessionEventsByTerminalId = db.prepare<null, [string]>(
	"DELETE FROM session_events WHERE terminal_session_id = ?",
);

export interface TeardownResult {
	terminalSession: TerminalSession | null;
	completedClaudeSessions: ClaudeSession[];
	completedRalphSession: RalphSession | null;
}

/**
 * Atomically completes all DB state for a terminal session teardown:
 * - Completes the terminal session
 * - Completes all linked claude sessions that aren't already completed
 * - Completes the ralph session if one exists and is still running
 * - Deletes persisted session events
 *
 * External side effects (tmux kill, worktree removal) must be handled separately.
 */
export const teardownSessionDb = db.transaction((terminalSessionId: string): TeardownResult => {
	// Complete the terminal session
	const terminalSession = completeTerminalSession.get(terminalSessionId);

	// Complete all linked claude sessions
	const completedClaudeSessions: ClaudeSession[] = [];
	const agentSessions = getClaudeSessionsByTerminalId.all(terminalSessionId);
	for (const agentSession of agentSessions) {
		if (agentSession.status !== "completed") {
			const completed = _completeClaudeSession.get(agentSession.id);
			if (completed) {
				completedClaudeSessions.push(completed);
			}
		}
	}

	// Complete ralph session if one exists and is still running
	let completedRalphSession: RalphSession | null = null;
	const ralphSession = _getRalphSessionByTerminalId.get(terminalSessionId);
	if (ralphSession && ralphSession.status === "running") {
		completedRalphSession = _completeRalphSession.get("completed", ralphSession.id);
	}

	// Clean up persisted session events
	_deleteSessionEventsByTerminalId.run(terminalSessionId);

	return { terminalSession, completedClaudeSessions, completedRalphSession };
});
