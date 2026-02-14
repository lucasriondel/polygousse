import { useCallback, useEffect, useRef, useState } from "react";
import type { Task } from "@/hooks/use-tasks";

export function useTaskEditing(
	task: Task,
	autoFocusSeq: number,
	onUpdate: (id: number, fields: Partial<Pick<Task, "title" | "description" | "status">>) => void,
	onDelete: (id: number) => void,
) {
	const [editingTitle, setEditingTitle] = useState(autoFocusSeq > 0);
	const [descOpen, setDescOpen] = useState(false);
	const [titleValue, setTitleValue] = useState(task.title);
	const [descValue, setDescValue] = useState(task.description ?? "");
	const titleRef = useRef<HTMLInputElement>(null);
	const descRef = useRef<HTMLTextAreaElement>(null);
	const titleDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
	const descDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
	const clickTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

	useEffect(
		() => () => {
			clearTimeout(titleDebounce.current);
			clearTimeout(descDebounce.current);
			clearTimeout(clickTimeout.current);
		},
		[],
	);

	useEffect(() => {
		if (autoFocusSeq > 0) setEditingTitle(true);
	}, [autoFocusSeq]);

	useEffect(() => {
		if (editingTitle && titleRef.current) {
			titleRef.current.focus();
		}
	}, [editingTitle]);

	useEffect(() => {
		if (descOpen && descRef.current) {
			descRef.current.focus();
		}
	}, [descOpen]);

	// Sync from server when not editing
	useEffect(() => {
		if (!editingTitle) setTitleValue(task.title);
	}, [task.title, editingTitle]);

	useEffect(() => {
		if (!descOpen) setDescValue(task.description ?? "");
	}, [task.description, descOpen]);

	const flushTitle = useCallback(() => {
		clearTimeout(titleDebounce.current);
		const val = titleValue.trim();
		if (val === "" && task.title === "") {
			onDelete(task.id);
			return;
		}
		if (val !== task.title) {
			onUpdate(task.id, { title: val });
		}
	}, [titleValue, task.title, task.id, onUpdate, onDelete]);

	const handleTitleChange = (value: string) => {
		setTitleValue(value);
		clearTimeout(titleDebounce.current);
		titleDebounce.current = setTimeout(() => {
			const val = value.trim();
			if (val !== task.title) {
				onUpdate(task.id, { title: val });
			}
		}, 500);
	};

	const handleDescChange = (value: string) => {
		setDescValue(value);
		clearTimeout(descDebounce.current);
		descDebounce.current = setTimeout(() => {
			const val = value.trim() || null;
			if (val !== task.description) {
				onUpdate(task.id, { description: val ?? "" });
			}
		}, 500);
	};

	return {
		editingTitle,
		setEditingTitle,
		descOpen,
		setDescOpen,
		titleValue,
		setTitleValue,
		descValue,
		setDescValue,
		titleRef,
		descRef,
		titleDebounce,
		descDebounce,
		clickTimeout,
		flushTitle,
		handleTitleChange,
		handleDescChange,
	};
}
