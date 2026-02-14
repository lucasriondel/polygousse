import type { ClaudeSessionStatus, TaskStatus } from "@/store/types";
import {
	Circle,
	CircleAlert,
	CircleCheck,
	CircleDot,
	CirclePause,
} from "lucide-react";

interface TaskStatusIconProps {
	taskStatus: TaskStatus;
	sessionStatus?: ClaudeSessionStatus | null;
	className?: string;
}

/**
 * Unified icon for task status. When a task is "doing", the session status
 * refines the icon (e.g. error, limit_hit show alert icons).
 */
export function TaskStatusIcon({
	taskStatus,
	sessionStatus,
	className = "h-5 w-5",
}: TaskStatusIconProps) {
	// When the task is actively running, use session status for finer granularity
	if (taskStatus === "doing" && sessionStatus) {
		switch (sessionStatus) {
			case "error":
				return <CircleAlert className={`${className} text-red-500`} />;
			case "limit_hit":
				return <CircleAlert className={`${className} text-red-500`} />;
			case "auth_expired":
				return <CircleAlert className={`${className} text-red-500`} />;
			case "waiting_input":
				return <CirclePause className={`${className} text-amber-500`} />;
			case "idle":
				return <CircleCheck className={`${className} text-green-500`} />;
			case "completed":
				return <CircleCheck className={`${className} text-green-500`} />;
			case "preparing":
				return <CircleDot className={`${className} text-gray-400 animate-pulse`} />;
			case "ongoing":
				return <CircleDot className={`${className} text-blue-500 animate-pulse`} />;
		}
	}

	switch (taskStatus) {
		case "todo":
			return <Circle className={`${className} text-muted-foreground`} />;
		case "doing":
			return <CircleDot className={`${className} text-blue-500 animate-pulse`} />;
		case "waiting_for_input":
			return <CirclePause className={`${className} text-amber-500`} />;
		case "done":
			return <CircleCheck className={`${className} text-green-500`} />;
	}
}
