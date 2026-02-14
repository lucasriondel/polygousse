import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskItemContext } from "./task-item-context";

export function TaskDescription() {
	const { task, taskAttachments, openDialog, isDone } = useTaskItemContext();

	if (!task.description && taskAttachments.length === 0) {
		return null;
	}

	return (
		<button type="button" className="block text-left w-full" onClick={openDialog}>
			{task.description && (
				<p className={cn("text-xs text-muted-foreground mt-0.5 truncate", isDone && "opacity-60")}>
					{task.description}
				</p>
			)}
			{taskAttachments.length > 0 && (
				<p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
					<Paperclip className="h-3 w-3" />
					{taskAttachments.length} attachment{taskAttachments.length !== 1 ? "s" : ""}
				</p>
			)}
		</button>
	);
}
