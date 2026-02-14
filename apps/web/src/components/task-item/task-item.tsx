import { GripVertical, Play } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { TaskViewDialog } from "@/components/task-view-dialog";
import type { Task } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";
import { useStore } from "@/store";
import { selectLinearTaskLink } from "@/store/selectors";
import { cycleStatus, StatusIcon } from "./status-icon";
import { TaskDescription } from "./task-description";
import { TaskItemContext, type TaskItemContextValue } from "./task-item-context";
import { TaskTitle } from "./task-title";
import { useTaskAttachments } from "./use-task-attachments";
import { useTaskEditing } from "./use-task-editing";

export function TaskItem({
	task,
	onUpdate,
	onDelete,
	onBackspaceDelete,
	onCreateBelow,
	onStart,
	autoFocusSeq,
	isDragging,
	onDragStart,
	onDragEnd,
}: {
	task: Task;
	onUpdate: (id: number, fields: Partial<Pick<Task, "title" | "description" | "status">>) => void;
	onDelete: (id: number) => void;
	onBackspaceDelete: (id: number) => void;
	onCreateBelow: () => void;
	onStart?: (id: number) => void;
	autoFocusSeq: number;
	isDragging?: boolean;
	onDragStart?: () => void;
	onDragEnd?: () => void;
}) {
	const editing = useTaskEditing(task, autoFocusSeq, onUpdate, onDelete);
	const attachments = useTaskAttachments(task.id);
	const linearLink = useStore(selectLinearTaskLink(task.id));
	const [dialogOpen, setDialogOpen] = useState(false);

	const isDone = task.status === "done";
	const hasSession =
		task.session_id != null && (task.status === "doing" || task.status === "waiting_for_input");

	const openDialog = useCallback(() => setDialogOpen(true), []);

	const ctx = useMemo<TaskItemContextValue>(
		() => ({
			task,
			...editing,
			...attachments,
			onUpdate,
			onBackspaceDelete,
			onCreateBelow,
			openDialog,
			hasSession,
			isDone,
		}),
		[
			task,
			editing,
			attachments,
			onUpdate,
			onBackspaceDelete,
			onCreateBelow,
			openDialog,
			hasSession,
			isDone,
		],
	);

	return (
		<TaskItemContext.Provider value={ctx}>
			<div
				role="listitem"
				className={cn(
					"group flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-opacity",
					isDragging && "opacity-30",
				)}
				draggable={!editing.editingTitle && !editing.descOpen}
				onDragStart={(e) => {
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.setData("text/plain", String(task.id));
					e.dataTransfer.setData("application/task-id", String(task.id));
					onDragStart?.();
				}}
				onDragEnd={onDragEnd}
			>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle stops propagation only */}
				<div
					role="presentation"
					className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
					onMouseDown={(e) => e.stopPropagation()}
				>
					<GripVertical className="h-5 w-5 text-muted-foreground" />
				</div>
				<button
					type="button"
					className="mt-0.5 shrink-0"
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => onUpdate(task.id, { status: cycleStatus(task.status) })}
				>
					<StatusIcon status={task.status} sessionId={task.session_id} />
				</button>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-1.5">
						<TaskTitle />
						{linearLink && (
							<span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-500">
								{linearLink.linear_issue_identifier}
							</span>
						)}
					</div>
					<TaskDescription />
				</div>
				{onStart &&
					(task.status === "todo" || task.status === "waiting_for_input") &&
					task.title.trim() !== "" && (
						<button
							type="button"
							className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-green-500"
							onClick={() => onStart(task.id)}
							title="Start task with Claude"
						>
							<Play className="h-4 w-4" />
						</button>
					)}
			</div>
			<TaskViewDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				task={task}
				onUpdate={onUpdate}
				taskAttachments={attachments.taskAttachments}
				handleFiles={attachments.handleFiles}
				deleteAttachment={attachments.deleteAttachment}
				linearLink={linearLink}
				onStart={onStart}
			/>
		</TaskItemContext.Provider>
	);
}
