import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useTaskItemContext } from "./task-item-context";

export function TaskTitle() {
	const {
		task,
		editingTitle,
		setEditingTitle,
		titleValue,
		setTitleValue,
		titleRef,
		titleDebounce,
		flushTitle,
		handleTitleChange,
		onBackspaceDelete,
		onCreateBelow,
		openDialog,
		hasSession,
		isDone,
	} = useTaskItemContext();

	if (editingTitle) {
		return (
			<input
				ref={titleRef}
				className="w-full bg-transparent outline-none text-sm"
				value={titleValue}
				onChange={(e) => handleTitleChange(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						flushTitle();
						setEditingTitle(false);
						onCreateBelow();
					}
					if (e.key === "Backspace" && titleValue === "") {
						e.preventDefault();
						clearTimeout(titleDebounce.current);
						onBackspaceDelete(task.id);
					}
					if (e.key === "Escape") {
						clearTimeout(titleDebounce.current);
						setTitleValue(task.title);
						setEditingTitle(false);
					}
				}}
				onBlur={() => {
					flushTitle();
					setEditingTitle(false);
				}}
				placeholder="Task title…"
			/>
		);
	}

	if (hasSession) {
		return (
			<Link
				to="/workspaces/$workspaceId/sessions/$sessionId"
				params={{
					workspaceId: String(task.workspace_id),
					sessionId: task.session_id!,
				}}
				className="text-sm text-left w-full text-blue-500 hover:underline"
			>
				{task.title || <span className="text-muted-foreground">Untitled</span>}
			</Link>
		);
	}

	return (
		<button
			type="button"
			className={cn("text-sm text-left w-full", isDone && "opacity-60 line-through")}
			onClick={openDialog}
		>
			{task.title || <span className="text-muted-foreground">Untitled</span>}
		</button>
	);
}
