import { db } from "../connection.js";
import type { Task } from "./tasks.js";

export type { TaskFolder } from "@polygousse/types";

import type { TaskFolder } from "@polygousse/types";

export const getAllFolders = db.prepare<TaskFolder, []>(
	"SELECT * FROM task_folders ORDER BY workspace_id, position ASC",
);

export const getFoldersByWorkspaceId = db.prepare<TaskFolder, [number]>(
	"SELECT * FROM task_folders WHERE workspace_id = ? ORDER BY position ASC",
);

export const getFolderById = db.prepare<TaskFolder, [number]>(
	"SELECT * FROM task_folders WHERE id = ?",
);

export const getMaxFolderPosition = db.prepare<{ maxPos: number | null }, [number]>(
	"SELECT MAX(position) as maxPos FROM task_folders WHERE workspace_id = ?",
);

export const createFolder = db.prepare<TaskFolder, [number, string, number]>(
	"INSERT INTO task_folders (workspace_id, name, position) VALUES (?, ?, ?) RETURNING *",
);

export const updateFolderName = db.prepare<TaskFolder, [string, number]>(
	"UPDATE task_folders SET name = ? WHERE id = ? RETURNING *",
);

export const updateFolderPosition = db.prepare<TaskFolder, [number, number]>(
	"UPDATE task_folders SET position = ? WHERE id = ? RETURNING *",
);

export const reorderFolders = db.transaction((folderIds: number[]) => {
	const results: TaskFolder[] = [];
	for (let i = 0; i < folderIds.length; i++) {
		const updated = updateFolderPosition.get(i, folderIds[i]!);
		if (updated) {
			results.push(updated);
		}
	}
	return results;
});

export const deleteFolder = db.prepare("DELETE FROM task_folders WHERE id = ?");

export const updateTaskFolder = db.prepare<Task, [number | null, number]>(
	"UPDATE tasks SET folder_id = ? WHERE id = ? RETURNING *",
);

export const getMaxTaskPositionInFolder = db.prepare<{ maxPos: number | null }, [number]>(
	"SELECT MAX(position) as maxPos FROM tasks WHERE folder_id = ?",
);
