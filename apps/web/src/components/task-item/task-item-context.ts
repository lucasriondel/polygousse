import type { RefObject } from "react";
import { createContext, useContext } from "react";
import type { Task } from "@/hooks/use-tasks";
import type { TaskAttachment } from "@/store/types";

export interface TaskItemContextValue {
	task: Task;
	// Editing state
	editingTitle: boolean;
	setEditingTitle: (v: boolean) => void;
	descOpen: boolean;
	setDescOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
	titleValue: string;
	setTitleValue: (v: string) => void;
	descValue: string;
	setDescValue: (v: string) => void;
	titleRef: RefObject<HTMLInputElement | null>;
	descRef: RefObject<HTMLTextAreaElement | null>;
	titleDebounce: RefObject<ReturnType<typeof setTimeout> | undefined>;
	descDebounce: RefObject<ReturnType<typeof setTimeout> | undefined>;
	clickTimeout: RefObject<ReturnType<typeof setTimeout> | undefined>;
	flushTitle: () => void;
	handleTitleChange: (value: string) => void;
	handleDescChange: (value: string) => void;
	// Attachments
	taskAttachments: TaskAttachment[];
	handleFiles: (files: FileList | File[]) => void;
	deleteAttachment: (id: number) => void;
	// Callbacks
	onUpdate: (id: number, fields: Partial<Pick<Task, "title" | "description" | "status">>) => void;
	onBackspaceDelete: (id: number) => void;
	onCreateBelow: () => void;
	// Dialog
	openDialog: () => void;
	// Derived
	hasSession: boolean;
	isDone: boolean;
}

export const TaskItemContext = createContext<TaskItemContextValue | null>(null);

export function useTaskItemContext() {
	const ctx = useContext(TaskItemContext);
	if (!ctx) throw new Error("useTaskItemContext must be used within TaskItemContext.Provider");
	return ctx;
}
