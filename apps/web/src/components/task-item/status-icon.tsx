import { useMemo } from "react";
import { TaskStatusIcon } from "@/components/task-status-icon";
import type { TaskStatus } from "@/hooks/use-tasks";
import { useStore } from "@/store";
import { selectSessionStatus } from "@/store/selectors";

export function StatusIcon({
	status,
	sessionId,
}: { status: TaskStatus; sessionId: string | null }) {
	const selector = useMemo(() => selectSessionStatus(sessionId), [sessionId]);
	const sessionStatus = useStore(selector);

	return (
		<TaskStatusIcon taskStatus={status} sessionStatus={sessionStatus} />
	);
}

export function cycleStatus(status: TaskStatus): TaskStatus {
	if (status === "done") return "todo";
	return "done";
}
