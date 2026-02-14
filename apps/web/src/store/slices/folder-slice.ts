import { wsRequest } from "@/lib/ws-client";
import type { TaskFolder } from "../types";

export interface FolderSlice {
	folders: Map<number, TaskFolder>;
	createFolder: (workspaceId: number, name: string) => Promise<TaskFolder>;
	renameFolder: (id: number, name: string) => Promise<TaskFolder>;
	deleteFolder: (id: number) => Promise<void>;
	reorderFolders: (workspaceId: number, folderIds: number[]) => Promise<void>;
}

export const createFolderSlice = (): FolderSlice => ({
	folders: new Map(),

	createFolder: async (workspaceId, name) => {
		return wsRequest("folder:create", { workspaceId, name });
	},

	renameFolder: async (id, name) => {
		return wsRequest("folder:update", { id, name });
	},

	deleteFolder: async (id) => {
		await wsRequest("folder:delete", { id });
	},

	reorderFolders: async (workspaceId, folderIds) => {
		await wsRequest("folder:reorder", { workspaceId, folderIds });
	},
});
