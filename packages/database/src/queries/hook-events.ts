import { db } from "../connection.js";

export type { HookEvent } from "@polygousse/types";

import type { HookEvent } from "@polygousse/types";

export const insertHookEvent = db.prepare<
	HookEvent,
	[string | null, string, string | null, string | null, string | null, string]
>(
	"INSERT INTO hook_events (session_id, hook_event_name, cwd, notification_type, message, raw_body) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
);

export const getHookEventById = db.prepare<HookEvent, [number]>(
	"SELECT * FROM hook_events WHERE id = ?",
);

export const getRecentHookEvents = db.prepare<HookEvent, [number]>(
	"SELECT * FROM hook_events ORDER BY id DESC LIMIT ?",
);

export const clearHookEvents = db.prepare("DELETE FROM hook_events");

/**
 * Delete hook events beyond the retention limit, keeping the most recent N rows.
 * Uses a subquery to find the minimum id to keep, then deletes everything older.
 */
export const pruneOldHookEvents = db.prepare(
	"DELETE FROM hook_events WHERE id < (SELECT MIN(id) FROM (SELECT id FROM hook_events ORDER BY id DESC LIMIT ?))",
);

/**
 * Strip raw_body on events older than 1 hour down to the fields the UI actually uses.
 * Adds a `_stripped` flag to prevent re-processing already-stripped rows.
 */
export const stripOldHookEventBodies = db.prepare(`
	UPDATE hook_events
	SET raw_body = json_object(
		'session_id', json_extract(raw_body, '$.session_id'),
		'hook_event_name', json_extract(raw_body, '$.hook_event_name'),
		'tool_name', json_extract(raw_body, '$.tool_name'),
		'agent_type', json_extract(raw_body, '$.agent_type'),
		'source', json_extract(raw_body, '$.source'),
		'reason', json_extract(raw_body, '$.reason'),
		'_stripped', 1
	)
	WHERE received_at < datetime('now', '-1 hour')
		AND json_extract(raw_body, '$._stripped') IS NULL
`);
