import { db } from "../connection.js";

export interface SessionEvent {
	id: number;
	terminal_session_id: string;
	event_type: string;
	payload: string;
	created_at: string;
}

export const insertSessionEvent = db.prepare<SessionEvent, [string, string, string]>(
	"INSERT INTO session_events (terminal_session_id, event_type, payload) VALUES (?, ?, ?) RETURNING *",
);

export const getSessionEventsByTerminalId = db.prepare<SessionEvent, [string]>(
	"SELECT * FROM session_events WHERE terminal_session_id = ? ORDER BY id ASC",
);

export const deleteSessionEventsByTerminalId = db.prepare<null, [string]>(
	"DELETE FROM session_events WHERE terminal_session_id = ?",
);

/**
 * Delete session_events for terminal sessions that ended more than 1 hour ago.
 * These events are no longer needed for live replay.
 */
export const pruneEndedSessionEvents = db.prepare(`
	DELETE FROM session_events
	WHERE terminal_session_id IN (
		SELECT id FROM terminal_sessions
		WHERE status = 'ended' AND ended_at < datetime('now', '-1 hour')
	)
`);
