import { ChevronRight, FolderOpen, GripVertical, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { Task, TaskFolder } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";
import { TaskList } from "./task-list";

export function FolderSection({
	folder,
	tasks,
	onUpdate,
	onDelete,
	onCreate,
	onStart,
	onReorder,
	onRename,
	onDeleteFolder,
	onTaskDrop,
	isDragging,
	onDragStart,
	onDragEnd,
}: {
	folder: TaskFolder;
	tasks: Task[];
	onUpdate: (id: number, fields: Partial<Pick<Task, "title" | "description" | "status">>) => void;
	onDelete: (id: number) => void;
	onCreate: (title: string, folderId: number) => void;
	onStart?: (id: number) => void;
	onReorder?: (taskIds: number[]) => void;
	onRename: (id: number, name: string) => void;
	onDeleteFolder: (id: number) => void;
	onTaskDrop?: (taskId: number, targetFolderId: number | null) => void;
	isDragging?: boolean;
	onDragStart?: () => void;
	onDragEnd?: () => void;
}) {
	const [collapsed, setCollapsed] = useState(false);
	const [editing, setEditing] = useState(false);
	const [nameValue, setNameValue] = useState(folder.name);
	const [headerDropHover, setHeaderDropHover] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleCreate = useCallback(
		(title: string) => onCreate(title, folder.id),
		[onCreate, folder.id],
	);

	const handleNameSubmit = useCallback(() => {
		const trimmed = nameValue.trim();
		if (trimmed && trimmed !== folder.name) {
			onRename(folder.id, trimmed);
		} else {
			setNameValue(folder.name);
		}
		setEditing(false);
	}, [nameValue, folder.name, folder.id, onRename]);

	const handleHeaderDragOver = (e: React.DragEvent) => {
		if (e.dataTransfer.types.includes("application/task-id")) {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			setHeaderDropHover(true);
		}
	};

	const handleHeaderDragLeave = () => {
		setHeaderDropHover(false);
	};

	const handleHeaderDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setHeaderDropHover(false);
		const taskIdStr = e.dataTransfer.getData("application/task-id");
		if (taskIdStr && onTaskDrop) {
			onTaskDrop(Number(taskIdStr), folder.id);
		}
	};

	return (
		<div
			role="group"
			className={cn("transition-opacity", isDragging && "opacity-30")}
			draggable={!editing}
			onDragStart={(e) => {
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer.setData("application/folder-id", String(folder.id));
				onDragStart?.();
			}}
			onDragEnd={onDragEnd}
		>
			<div
				role="toolbar"
				className={cn(
					"group flex items-center gap-1 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer select-none",
					headerDropHover && "bg-amber-500/10 ring-1 ring-amber-500/40",
				)}
				onDragOver={handleHeaderDragOver}
				onDragLeave={handleHeaderDragLeave}
				onDrop={handleHeaderDrop}
			>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle stops propagation only */}
				<div
					role="presentation"
					className="shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
					onMouseDown={(e) => e.stopPropagation()}
				>
					<GripVertical className="h-4 w-4 text-muted-foreground" />
				</div>
				<button type="button" className="shrink-0" onClick={() => setCollapsed((v) => !v)}>
					<ChevronRight
						className={cn(
							"h-4 w-4 text-muted-foreground transition-transform",
							!collapsed && "rotate-90",
						)}
					/>
				</button>
				<FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
				{editing ? (
					<input
						ref={inputRef}
						className="flex-1 min-w-0 bg-transparent outline-none text-sm font-medium"
						value={nameValue}
						onChange={(e) => setNameValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								handleNameSubmit();
							}
							if (e.key === "Escape") {
								setNameValue(folder.name);
								setEditing(false);
							}
						}}
						onBlur={handleNameSubmit}
					/>
				) : (
					<button
						type="button"
						className="flex-1 min-w-0 text-sm font-medium truncate text-left"
						onDoubleClick={() => {
							setNameValue(folder.name);
							setEditing(true);
						}}
						onClick={() => setCollapsed((v) => !v)}
					>
						{folder.name}
					</button>
				)}
				<span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
				<button
					type="button"
					className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
					onClick={(e) => {
						e.stopPropagation();
						onDeleteFolder(folder.id);
					}}
					title="Delete folder"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>
			{!collapsed && (
				<div className="ml-6">
					<TaskList
						tasks={tasks}
						onUpdate={onUpdate}
						onDelete={onDelete}
						onCreate={handleCreate}
						onStart={onStart}
						onReorder={onReorder}
						folderId={folder.id}
						onTaskDrop={onTaskDrop}
					/>
				</div>
			)}
		</div>
	);
}
