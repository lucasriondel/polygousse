import { wsRequest } from "@/lib/ws-client";
import type { Task } from "../types";

export interface TaskSlice {
	tasks: Map<number, Task>;
	createTask: (
		workspaceId: number,
		title: string,
		description?: string,
		folderId?: number | null,
	) => Promise<Task>;
	updateTask: (
		id: number,
		fields: Partial<Pick<Task, "title" | "description" | "status">>,
	) => Promise<Task>;
	deleteTask: (id: number) => Promise<void>;
	reorderTasks: (workspaceId: number, taskIds: number[]) => Promise<void>;
	startTask: (
		taskId: number,
		options?: {
			permissionMode?: string;
			planMode?: boolean;
			cwd?: string;
			ralphMode?: boolean;
			maxIterations?: number;
		},
	) => Promise<Task>;
	moveTaskToFolder: (taskId: number, folderId: number | null) => Promise<void>;
}

export const createTaskSlice = (): TaskSlice => ({
	tasks: new Map(),

	createTask: async (workspaceId, title, description, folderId) => {
		return wsRequest("task:create", { workspaceId, title, description, folderId });
	},

	updateTask: async (id, fields) => {
		return wsRequest("task:update", { id, ...fields });
	},

	deleteTask: async (id) => {
		await wsRequest("task:delete", { id });
	},

	reorderTasks: async (workspaceId, taskIds) => {
		await wsRequest("task:reorder", { workspaceId, taskIds });
	},

	startTask: async (taskId, options) => {
		return wsRequest("task:start", { taskId, ...options });
	},

	moveTaskToFolder: async (taskId, folderId) => {
		await wsRequest("task:move-to-folder", { taskId, folderId });
	},
});
