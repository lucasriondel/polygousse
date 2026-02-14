import { Link, useParams } from "@tanstack/react-router";
import { ListTodo } from "lucide-react";
import { TaskStatusIcon } from "@/components/task-status-icon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActiveSessionTask } from "@/store/selectors";

interface WorkspaceTabBarProps {
	workspaceId: string;
	sessions: ActiveSessionTask[];
}

export function WorkspaceTabBar({ workspaceId, sessions }: WorkspaceTabBarProps) {
	const { sessionId } = useParams({ strict: false }) as { sessionId?: string };
	const isTasksView = !sessionId;

	return (
		<div className="flex h-9 shrink-0 items-end border-b bg-background overflow-x-auto scrollbar-hide">
			<Link
				to="/workspaces/$workspaceId"
				params={{ workspaceId }}
				className={`flex h-full items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition-colors ${
					isTasksView
						? "border-amber-500 text-foreground"
						: "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
				}`}
			>
				<ListTodo className="size-3.5" />
				Tasks
			</Link>
			<TooltipProvider delayDuration={1000}>
				{sessions.map((session) => {
					const isActive = session.session_id === sessionId;
					return (
						<Tooltip key={session.session_id}>
							<TooltipTrigger asChild>
								<Link
									to="/workspaces/$workspaceId/sessions/$sessionId"
									params={{ workspaceId, sessionId: session.session_id! }}
									className={`flex h-full max-w-48 items-center gap-1.5 border-b-2 px-3 text-sm transition-colors ${
										isActive
											? "border-amber-500 text-foreground"
											: "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
									}`}
								>
									<span className="shrink-0 [&>svg]:size-3.5">
										<TaskStatusIcon taskStatus={session.status} sessionStatus={session.sessionStatus} />
									</span>
									<span className="truncate">{session.title}</span>
									{session.ralphMaxIterations != null && (
										<span className="shrink-0 text-xs font-mono text-muted-foreground tabular-nums">
											{session.ralphCurrentIteration ?? 0}/{session.ralphMaxIterations}
										</span>
									)}
								</Link>
							</TooltipTrigger>
							<TooltipContent side="bottom">{session.title}</TooltipContent>
						</Tooltip>
					);
				})}
			</TooltipProvider>
		</div>
	);
}
