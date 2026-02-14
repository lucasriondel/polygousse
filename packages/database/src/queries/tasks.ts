import { db } from "../connection.js";
import type { ClaudeSessionStatus } from "./claude-sessions.js";

export type { Task, TaskStatus } from "@polygousse/types";

import type { Task } from "@polygousse/types";

export const getTasksByWorkspaceId = db.prepare<Task, [number]>(
	"SELECT * FROM tasks WHERE workspace_id = ? ORDER BY position ASC, created_at ASC",
);

export const getAllTasks = db.prepare<Task, []>(
	"SELECT * FROM tasks ORDER BY workspace_id, position ASC, created_at ASC",
);

export const getTaskById = db.prepare<Task, [number]>("SELECT * FROM tasks WHERE id = ?");

export const getMaxTaskPosition = db.prepare<{ maxPos: number | null }, [number]>(
	"SELECT MAX(position) as maxPos FROM tasks WHERE workspace_id = ?",
);

export const createTask = db.prepare<
	Task,
	[number, string, string | null, string, string | null, number, number | null]
>(
	"INSERT INTO tasks (workspace_id, title, description, status, session_id, position, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *",
);

export const updateTask = db.prepare<
	Task,
	[string, string | null, string, string | null, string | null, number]
>(
	"UPDATE tasks SET title = ?, description = ?, status = ?, session_id = ?, completed_at = ? WHERE id = ? RETURNING *",
);

export interface ActiveSessionTask extends Task {
	sessionStatus: ClaudeSessionStatus | null;
	claudeSessionId: string | null;
}

export const getActiveSessionTasks = db.prepare<ActiveSessionTask, []>(
	`SELECT t.*, cs.status AS sessionStatus, cs.id AS claudeSessionId
   FROM tasks t
   LEFT JOIN claude_sessions cs ON cs.terminal_session_id = t.session_id AND cs.status != 'completed'
   WHERE t.status = 'doing' AND t.session_id IS NOT NULL
   ORDER BY t.workspace_id, t.position ASC, t.created_at ASC`,
);

export const updateTaskPosition = db.prepare<Task, [number, number]>(
	"UPDATE tasks SET position = ? WHERE id = ? RETURNING *",
);

export const reorderTasks = db.transaction((taskIds: number[]) => {
	const results: Task[] = [];
	for (let i = 0; i < taskIds.length; i++) {
		const updated = updateTaskPosition.get(i, taskIds[i]!);
		if (updated) {
			results.push(updated);
		}
	}
	return results;
});

export const deleteTask = db.prepare("DELETE FROM tasks WHERE id = ?");

export const getTaskBySessionId = db.prepare<Task, [string]>(
	"SELECT * FROM tasks WHERE session_id = ? LIMIT 1",
);

export const getTaskByClaudeSessionId = db.prepare<Task, [string]>(
	"SELECT t.* FROM tasks t JOIN claude_sessions cs ON cs.terminal_session_id = t.session_id WHERE cs.id = ? LIMIT 1",
);
