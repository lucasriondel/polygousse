import { db } from "../connection.js";

export type { RalphSession, RalphSessionStatus } from "@polygousse/types";

import type { RalphSession } from "@polygousse/types";

export interface RalphClaudeSession {
	id: number;
	ralph_session_id: string;
	claude_session_id: string;
	iteration: number;
	created_at: string;
}

export const createRalphSession = db.prepare<RalphSession, [string, string, number, number]>(
	"INSERT INTO ralph_sessions (id, terminal_session_id, task_id, max_iterations) VALUES (?, ?, ?, ?) RETURNING *",
);

export const getRalphSessionById = db.prepare<RalphSession, [string]>(
	"SELECT * FROM ralph_sessions WHERE id = ?",
);

export const getRalphSessionByTerminalId = db.prepare<RalphSession, [string]>(
	"SELECT * FROM ralph_sessions WHERE terminal_session_id = ?",
);

export const updateRalphIteration = db.prepare<RalphSession, [number, string]>(
	"UPDATE ralph_sessions SET current_iteration = ? WHERE id = ? RETURNING *",
);

export const completeRalphSession = db.prepare<RalphSession, [string, string]>(
	"UPDATE ralph_sessions SET status = ?, completed_at = datetime('now') WHERE id = ? RETURNING *",
);

export const createRalphClaudeSession = db.prepare<RalphClaudeSession, [string, string, number]>(
	"INSERT INTO ralph_claude_sessions (ralph_session_id, claude_session_id, iteration) VALUES (?, ?, ?) RETURNING *",
);

export const getRunningRalphSessions = db.prepare<RalphSession, []>(
	"SELECT * FROM ralph_sessions WHERE status = 'running' ORDER BY created_at DESC",
);

export const getRalphClaudeSessionByClaudeId = db.prepare<RalphClaudeSession, [string]>(
	"SELECT * FROM ralph_claude_sessions WHERE claude_session_id = ? LIMIT 1",
);
