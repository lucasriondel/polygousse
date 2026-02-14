import { useCallback, useRef, useState } from "react";
import type { Task } from "@/hooks/use-tasks";
import { useWorkspaceFolders, useWorkspaceTasks } from "@/hooks/use-tasks";
import type { Workspace } from "@/hooks/use-workspaces";
import { useStore } from "@/store";

export function useWorkspaceTaskManagement(workspace: Workspace) {
	const { tasks, create, update, remove, reorder, startTask } = useWorkspaceTasks(workspace.id);
	const {
		folders,
		create: createFolder,
		rename: renameFolder,
		remove: removeFolder,
		reorder: reorderFolders,
		moveTaskToFolder,
	} = useWorkspaceFolders(workspace.id);
	const [runDialogTaskId, setRunDialogTaskId] = useState<number | null>(null);
	const runDialogTask = useStore((s) => (runDialogTaskId !== null ? s.tasks.get(runDialogTaskId) ?? null : null));

	// Folder drag state
	const [draggingFolderId, setDraggingFolderId] = useState<number | null>(null);
	const draggingFolderIdRef = useRef<number | null>(null);
	const [folderDropIndex, setFolderDropIndex] = useState<number | null>(null);
	const folderRefs = useRef<Map<number, HTMLDivElement>>(new Map());

	const handleStart = (taskId: number) => {
		setRunDialogTaskId(taskId);
	};

	const handleRun = async (
		taskId: number,
		options: {
			permissionMode?: string;
			planMode?: boolean;
			worktreePath?: string;
			ralphMode?: boolean;
			maxIterations?: number;
		},
	) => {
		await startTask(taskId, {
			permissionMode: options.permissionMode,
			planMode: options.planMode,
			cwd: options.worktreePath,
			ralphMode: options.ralphMode,
			maxIterations: options.maxIterations,
		});
	};

	const handleUpdate = (
		id: number,
		fields: Partial<Pick<Task, "title" | "description" | "status">>,
	) => {
		update(id, fields);
	};

	const handleDelete = (id: number) => {
		remove(id);
	};

	const handleCreate = (title: string) => {
		create(title);
	};

	const handleCreateInFolder = useCallback(
		(title: string, folderId: number) => {
			create(title, undefined, folderId);
		},
		[create],
	);

	const handleTaskDrop = useCallback(
		(taskId: number, targetFolderId: number | null) => {
			moveTaskToFolder(taskId, targetFolderId);
		},
		[moveTaskToFolder],
	);

	const handleAddFolder = () => {
		createFolder("New Folder");
	};

	// Folder DnD helpers
	const getFolderDropIndex = (clientY: number): number => {
		for (let i = 0; i < folders.length; i++) {
			const folder = folders[i];
			if (!folder) continue;
			const el = folderRefs.current.get(folder.id);
			if (!el) continue;
			const rect = el.getBoundingClientRect();
			const midY = rect.top + rect.height / 2;
			if (clientY < midY) return i;
		}
		return folders.length;
	};

	const handleFolderDragOver = (e: React.DragEvent) => {
		if (!e.dataTransfer.types.includes("application/folder-id")) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		setFolderDropIndex(getFolderDropIndex(e.clientY));
	};

	const handleFolderDrop = (e: React.DragEvent) => {
		e.preventDefault();
		const folderId = draggingFolderIdRef.current;
		if (folderId === null) {
			setDraggingFolderId(null);
			draggingFolderIdRef.current = null;
			setFolderDropIndex(null);
			return;
		}
		const targetIndex = getFolderDropIndex(e.clientY);
		const fromIndex = folders.findIndex((f) => f.id === folderId);
		if (fromIndex !== -1 && fromIndex !== targetIndex) {
			const reordered = [...folders];
			const [moved] = reordered.splice(fromIndex, 1);
			const insertAt = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
			reordered.splice(insertAt, 0, moved!);
			reorderFolders(reordered.map((f) => f.id));
		}
		draggingFolderIdRef.current = null;
		setDraggingFolderId(null);
		setFolderDropIndex(null);
	};

	const setFolderRef = useCallback((id: number, el: HTMLDivElement | null) => {
		if (el) {
			folderRefs.current.set(id, el);
		} else {
			folderRefs.current.delete(id);
		}
	}, []);

	const handleFolderDragStart = (folderId: number) => {
		draggingFolderIdRef.current = folderId;
		setDraggingFolderId(folderId);
	};

	const handleFolderDragEnd = () => {
		draggingFolderIdRef.current = null;
		setDraggingFolderId(null);
		setFolderDropIndex(null);
	};

	const clearFolderDropIndex = () => setFolderDropIndex(null);

	return {
		tasks,
		folders,
		reorder,
		renameFolder,
		removeFolder,
		runDialogTask,
		setRunDialogTaskId,
		draggingFolderId,
		folderDropIndex,
		handleStart,
		handleRun,
		handleUpdate,
		handleDelete,
		handleCreate,
		handleCreateInFolder,
		handleTaskDrop,
		handleAddFolder,
		handleFolderDragOver,
		handleFolderDrop,
		handleFolderDragStart,
		handleFolderDragEnd,
		clearFolderDropIndex,
		setFolderRef,
	};
}
