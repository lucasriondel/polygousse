import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Task } from "@/hooks/use-tasks";
import { TaskItem } from "./task-item";

export function TaskList({
	tasks,
	onUpdate,
	onDelete,
	onCreate,
	onStart,
	onReorder,
	folderId,
	onTaskDrop,
}: {
	tasks: Task[];
	onUpdate: (id: number, fields: Partial<Pick<Task, "title" | "description" | "status">>) => void;
	onDelete: (id: number) => void;
	onCreate?: (title: string) => void;
	onStart?: (id: number) => void;
	onReorder?: (taskIds: number[]) => void;
	folderId?: number | null;
	onTaskDrop?: (taskId: number, targetFolderId: number | null) => void;
}) {
	const [autoFocus, setAutoFocus] = useState<{ id: number; seq: number } | null>(null);
	const seqRef = useRef(0);
	const [dragId, setDragId] = useState<number | null>(null);
	const dragIdRef = useRef<number | null>(null);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

	const focusTask = useCallback((id: number) => {
		seqRef.current += 1;
		setAutoFocus({ id, seq: seqRef.current });
	}, []);

	const handleCreate = () => {
		onCreate("");
	};

	const handleBackspaceDelete = useCallback(
		(id: number) => {
			const idx = tasks.findIndex((t) => t.id === id);
			const prevTask = idx > 0 ? tasks[idx - 1] : null;
			onDelete(id);
			if (prevTask) {
				focusTask(prevTask.id);
			}
		},
		[tasks, onDelete, focusTask],
	);

	// Track the latest task id to auto-focus newly created tasks
	// Only focus tasks with empty titles (genuinely new), not tasks moving between lists
	const prevTaskIds = useRef(new Set(tasks.map((t) => t.id)));
	useEffect(() => {
		const currentIds = new Set(tasks.map((t) => t.id));
		for (const id of currentIds) {
			if (!prevTaskIds.current.has(id)) {
				const task = tasks.find((t) => t.id === id);
				if (task && task.title === "") {
					focusTask(id);
				}
				break;
			}
		}
		prevTaskIds.current = currentIds;
	}, [tasks, focusTask]);

	const getDropIndex = (clientY: number): number => {
		for (let i = 0; i < tasks.length; i++) {
			const el = itemRefs.current.get(tasks[i]?.id);
			if (!el) continue;
			const rect = el.getBoundingClientRect();
			const midY = rect.top + rect.height / 2;
			if (clientY < midY) return i;
		}
		return tasks.length - 1;
	};

	const handleDragStart = (taskId: number) => {
		dragIdRef.current = taskId;
		setDragId(taskId);
	};

	const handleContainerDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		// Allow drop even for cross-section drags (task from another folder)
		if (dragIdRef.current !== null) {
			setDropIndex(getDropIndex(e.clientY));
		}
	};

	const handleContainerDrop = (e: React.DragEvent) => {
		e.preventDefault();
		const currentDragId = dragIdRef.current;

		// Handle cross-section drop (task dragged from another list/folder)
		if (currentDragId === null && onTaskDrop) {
			const taskIdStr = e.dataTransfer.getData("application/task-id");
			if (taskIdStr) {
				onTaskDrop(Number(taskIdStr), folderId ?? null);
			}
			setDropIndex(null);
			return;
		}

		if (currentDragId === null || !onReorder) {
			dragIdRef.current = null;
			setDragId(null);
			setDropIndex(null);
			return;
		}

		const targetIndex = getDropIndex(e.clientY);
		const fromIndex = tasks.findIndex((t) => t.id === currentDragId);
		if (fromIndex === -1 || fromIndex === targetIndex) {
			dragIdRef.current = null;
			setDragId(null);
			setDropIndex(null);
			return;
		}

		const reordered = [...tasks];
		const [moved] = reordered.splice(fromIndex, 1);
		reordered.splice(targetIndex, 0, moved!);
		onReorder(reordered.map((t) => t.id));

		dragIdRef.current = null;
		setDragId(null);
		setDropIndex(null);
	};

	const handleDragEnd = () => {
		dragIdRef.current = null;
		setDragId(null);
		setDropIndex(null);
	};

	const setItemRef = useCallback((id: number, el: HTMLDivElement | null) => {
		if (el) {
			itemRefs.current.set(id, el);
		} else {
			itemRefs.current.delete(id);
		}
	}, []);

	if (tasks.length === 0) {
		if (!onCreate) return null;
		return (
			<div>
				<button
					type="button"
					className="flex items-center gap-2 py-1.5 px-2 text-sm text-muted-foreground hover:text-blue-500 rounded-md hover:bg-blue-500/10 w-full"
					onClick={handleCreate}
				>
					<Plus className="h-4 w-4" />
					Add task
				</button>
			</div>
		);
	}

	const dragFromIndex = dragId !== null ? tasks.findIndex((t) => t.id === dragId) : -1;

	return (
		<div
			role="list"
			onDragOver={handleContainerDragOver}
			onDrop={handleContainerDrop}
			onDragLeave={() => setDropIndex(null)}
		>
			{tasks.map((task, index) => (
				<div key={task.id} ref={(el) => setItemRef(task.id, el)}>
					{dropIndex === index &&
						dragId !== null &&
						dragFromIndex !== index &&
						dragFromIndex !== index - 1 && (
							<div className="h-0.5 bg-blue-500 rounded-full mx-2 my-px" />
						)}
					<TaskItem
						task={task}
						onUpdate={onUpdate}
						onDelete={onDelete}
						onBackspaceDelete={handleBackspaceDelete}
						onCreateBelow={handleCreate}
						onStart={onStart}
						autoFocusSeq={autoFocus?.id === task.id ? autoFocus.seq : 0}
						isDragging={dragId === task.id}
						onDragStart={() => handleDragStart(task.id)}
						onDragEnd={handleDragEnd}
					/>
				</div>
			))}
			{onCreate && (
				<button
					type="button"
					className="flex items-center gap-2 py-1.5 px-2 text-sm text-muted-foreground hover:text-blue-500 rounded-md hover:bg-blue-500/10 w-full"
					onClick={handleCreate}
				>
					<Plus className="h-4 w-4" />
					Add task
				</button>
			)}
		</div>
	);
}
