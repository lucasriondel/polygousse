import { useCallback, useMemo } from "react";
import { shallowArrayEqual } from "@/lib/shallow-array-equal";
import { useStore } from "@/store";
import {
	selectAllTasksByWorkspace,
	selectWorkspaceFolders,
	selectWorkspaceTasks,
} from "@/store/selectors";

export type { WorkspaceWithTasks } from "@/store/selectors";
// Re-export types so existing consumers don't need to change imports
export type { ClaudeSessionStatus, Task, TaskFolder, TaskStatus } from "@/store/types";

export function useAllTasks() {
	const workspacesWithTasks = useStore(selectAllTasksByWorkspace, shallowArrayEqual);

	return useMemo(() => ({ workspacesWithTasks }), [workspacesWithTasks]);
}

export function useWorkspaceTasks(workspaceId: number) {
	const selector = useMemo(() => selectWorkspaceTasks(workspaceId), [workspaceId]);
	const tasks = useStore(selector, shallowArrayEqual);
	const createTask = useStore((s) => s.createTask);
	const updateTask = useStore((s) => s.updateTask);
	const deleteTask = useStore((s) => s.deleteTask);
	const reorderTasks = useStore((s) => s.reorderTasks);
	const startTaskAction = useStore((s) => s.startTask);

	const create = useCallback(
		(title: string, description?: string, folderId?: number | null) =>
			createTask(workspaceId, title, description, folderId),
		[createTask, workspaceId],
	);

	const reorder = useCallback(
		(taskIds: number[]) => reorderTasks(workspaceId, taskIds),
		[reorderTasks, workspaceId],
	);

	return useMemo(
		() => ({
			tasks,
			create,
			update: updateTask,
			remove: deleteTask,
			reorder,
			startTask: startTaskAction,
		}),
		[tasks, create, updateTask, deleteTask, reorder, startTaskAction],
	);
}

export function useWorkspaceFolders(workspaceId: number) {
	const selector = useMemo(() => selectWorkspaceFolders(workspaceId), [workspaceId]);
	const folders = useStore(selector, shallowArrayEqual);
	const createFolder = useStore((s) => s.createFolder);
	const renameFolder = useStore((s) => s.renameFolder);
	const deleteFolder = useStore((s) => s.deleteFolder);
	const reorderFolders = useStore((s) => s.reorderFolders);
	const moveTaskToFolder = useStore((s) => s.moveTaskToFolder);

	const create = useCallback(
		(name: string) => createFolder(workspaceId, name),
		[createFolder, workspaceId],
	);

	const reorder = useCallback(
		(folderIds: number[]) => reorderFolders(workspaceId, folderIds),
		[reorderFolders, workspaceId],
	);

	return useMemo(
		() => ({
			folders,
			create,
			rename: renameFolder,
			remove: deleteFolder,
			reorder,
			moveTaskToFolder,
		}),
		[folders, create, renameFolder, deleteFolder, reorder, moveTaskToFolder],
	);
}
