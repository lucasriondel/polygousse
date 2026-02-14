import { db } from "../connection.js";

export type { ClaudeSession, ClaudeSessionStatus } from "@polygousse/types";

import type { ClaudeSession } from "@polygousse/types";

export const upsertClaudeSession = db.prepare<
	ClaudeSession,
	[string, number | null, string, string, string | null, string | null, string]
>(
	`INSERT INTO claude_sessions (id, workspace_id, status, cwd, message, notification_type, last_event, last_event_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
   ON CONFLICT(id) DO UPDATE SET
     status = excluded.status,
     message = excluded.message,
     notification_type = excluded.notification_type,
     last_event = excluded.last_event,
     last_event_at = datetime('now'),
     workspace_id = COALESCE(excluded.workspace_id, claude_sessions.workspace_id)
   RETURNING *`,
);

export const endClaudeSession = db.prepare<ClaudeSession, [string]>(
	`UPDATE claude_sessions
   SET status = 'completed', last_event = 'session_end', last_event_at = datetime('now'), ended_at = datetime('now')
   WHERE id = ?
   RETURNING *`,
);

export const getClaudeSessionById = db.prepare<ClaudeSession, [string]>(
	"SELECT * FROM claude_sessions WHERE id = ?",
);

export const getActiveClaudeSessions = db.prepare<ClaudeSession, []>(
	"SELECT * FROM claude_sessions WHERE status != 'completed' ORDER BY last_event_at DESC",
);

export const getWaitingClaudeSessions = db.prepare<ClaudeSession, []>(
	"SELECT * FROM claude_sessions WHERE status IN ('waiting_input', 'error', 'idle', 'limit_hit') ORDER BY last_event_at DESC",
);

export const dismissClaudeSession = db.prepare<ClaudeSession, [string]>(
	`UPDATE claude_sessions
   SET status = 'completed', last_event = 'dismissed', last_event_at = datetime('now'), ended_at = datetime('now')
   WHERE id = ?
   RETURNING *`,
);

export const deleteClaudeSession = db.prepare<null, [string]>(
	"DELETE FROM claude_sessions WHERE id = ?",
);

export const completeClaudeSession = db.prepare<ClaudeSession, [string]>(
	`UPDATE claude_sessions
   SET status = 'completed', last_event_at = datetime('now'), ended_at = datetime('now')
   WHERE id = ?
   RETURNING *`,
);

export const createClaudeSessionPreparing = db.prepare<
	ClaudeSession,
	[string, number | null, string, string | null]
>(
	`INSERT INTO claude_sessions (id, workspace_id, status, cwd, terminal_session_id, last_event, last_event_at)
   VALUES (?, ?, 'preparing', ?, ?, 'created', datetime('now'))
   ON CONFLICT(id) DO UPDATE SET
     status = 'preparing',
     workspace_id = COALESCE(excluded.workspace_id, claude_sessions.workspace_id),
     terminal_session_id = COALESCE(excluded.terminal_session_id, claude_sessions.terminal_session_id),
     last_event = 'created',
     last_event_at = datetime('now')
   RETURNING *`,
);

export interface WaitingClaudeSessionWithTask extends ClaudeSession {
	task_id: number | null;
	task_title: string | null;
}

export const getWaitingClaudeSessionsWithTask = db.prepare<WaitingClaudeSessionWithTask, []>(
	`SELECT cs.*, t.id AS task_id, t.title AS task_title
   FROM claude_sessions cs
   LEFT JOIN tasks t ON t.session_id = cs.terminal_session_id
   WHERE cs.status IN ('waiting_input', 'error', 'idle', 'limit_hit')
   ORDER BY cs.last_event_at DESC`,
);

export const getRecentlyEndedSessionByCwd = db.prepare<ClaudeSession, [string]>(
	`SELECT * FROM claude_sessions
   WHERE cwd = ? AND terminal_session_id IS NOT NULL AND status = 'completed'
   ORDER BY ended_at DESC LIMIT 1`,
);
