import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import {
	CheckCircle,
	ChevronRight,
	Inbox,
	Plus,
	RefreshCw,
	Settings,
} from "lucide-react";
import { Collapsible } from "radix-ui";
import { useState, useCallback } from "react";
import { CreateWorkspaceDialog } from "@/components/create-workspace-dialog";
import { TaskStatusIcon } from "@/components/task-status-icon";
import { CircularProgress } from "@/components/ui/circular-progress";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Workspace } from "@/hooks/use-workspaces";
import { wsRequest } from "@/lib/ws-client";
import { useStore } from "@/store";
import type { ActiveSessionTask } from "@/store/selectors";

function UsageIndicators() {
	const usage = useStore((s) => s.claudeUsage);
	const status = useStore((s) => s.claudeUsageStatus);

	const [refreshing, setRefreshing] = useState(false);
	const handleRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			const r = await wsRequest("claude-usage:refresh", {});
			useStore.setState(
				{ claudeUsage: r.usage, claudeUsageStatus: r.status },
				false,
				"usage/refresh",
			);
		} catch {
			// ignore
		} finally {
			setRefreshing(false);
		}
	}, []);

	if (status === "unavailable") return null;

	if (status === "error") {
		return (
			<div className="flex items-center justify-center gap-2 px-2 py-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="text-xs text-muted-foreground cursor-default">
							Failed to load usage
						</span>
					</TooltipTrigger>
					<TooltipContent side="top">
						<p>Failed to fetch usage data</p>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleRefresh}
							disabled={refreshing}
							className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
						>
							<RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">Retry</TooltipContent>
				</Tooltip>
			</div>
		);
	}

	if (status === "initializing" || !usage) {
		return (
			<div className="flex items-center justify-center gap-4 px-2 py-2">
				<Skeleton className="size-9 rounded-full" />
				<Skeleton className="size-9 rounded-full" />
				<Skeleton className="size-9 rounded-full" />
			</div>
		);
	}

	return (
		<div className="flex items-center justify-center gap-4 px-2 py-2">
			<Tooltip>
				<TooltipTrigger>
					<CircularProgress value={usage.currentSession} label="Session" />
				</TooltipTrigger>
				<TooltipContent side="top">
					<p>Session: {usage.currentSession}% used</p>
					{usage.sessionResetLabel && (
						<p className="text-muted-foreground">{usage.sessionResetLabel}</p>
					)}
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger>
					<CircularProgress value={usage.weeklyAllModels} label="Weekly" />
				</TooltipTrigger>
				<TooltipContent side="top">
					<p>Weekly (all models): {usage.weeklyAllModels}% used</p>
					{usage.weeklyResetLabel && (
						<p className="text-muted-foreground">{usage.weeklyResetLabel}</p>
					)}
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger>
					<CircularProgress value={usage.weeklySonnetOnly} label="Sonnet" />
				</TooltipTrigger>
				<TooltipContent side="top">
					<p>Weekly (Sonnet only): {usage.weeklySonnetOnly}% used</p>
					{usage.weeklyResetLabel && (
						<p className="text-muted-foreground">{usage.weeklyResetLabel}</p>
					)}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}

function WorkspaceIcon({ workspace }: { workspace: Workspace }) {
	if (workspace.icon) {
		return <span className="text-base leading-none">{workspace.icon}</span>;
	}
	return (
		<span className="flex size-4 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
			{workspace.name.charAt(0).toUpperCase()}
		</span>
	);
}

interface AppSidebarProps {
	workspaces: Workspace[];
	selectedId: number | null;
	onCreate: (name: string, folderPath: string, icon?: string | null, linearTeamId?: string | null, linearProjectIds?: string[] | null, multiRepo?: boolean) => Promise<Workspace>;
	activeSessions: ActiveSessionTask[];
	inboxCount: number;
}

export function AppSidebar({
	workspaces,
	selectedId,
	onCreate,
	activeSessions,
	inboxCount,
}: AppSidebarProps) {
	const [dialogOpen, setDialogOpen] = useState(false);
	const navigate = useNavigate();
	const location = useLocation();
	const { sessionId: activeSessionId } = useParams({ strict: false }) as { sessionId?: string };

	const isInboxPage = location.pathname.startsWith("/inbox");
	const isTasksPage = location.pathname.startsWith("/tasks");
	const isSettingsPage = location.pathname.startsWith("/settings");
	async function handleCreate(name: string, folderPath: string, icon?: string | null, linearTeamId?: string | null, multiRepo?: boolean) {
		const workspace = await onCreate(name, folderPath, icon, linearTeamId, null, multiRepo);
		await navigate({
			to: "/workspaces/$workspaceId",
			params: { workspaceId: String(workspace.id) },
		});
		return workspace;
	}

	// Group active sessions by workspaceId
	const sessionsByWorkspace = new Map<number, ActiveSessionTask[]>();
	for (const session of activeSessions) {
		const existing = sessionsByWorkspace.get(session.workspace_id);
		if (existing) {
			existing.push(session);
		} else {
			sessionsByWorkspace.set(session.workspace_id, [session]);
		}
	}

	return (
		<Sidebar>
			<SidebarContent>
				<SidebarGroup>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton asChild tooltip="Inbox" isActive={isInboxPage}>
								<Link to="/inbox">
									<Inbox className="text-blue-500" />
									<span>Inbox</span>
								</Link>
							</SidebarMenuButton>
							{inboxCount > 0 && (
								<SidebarMenuBadge className="bg-blue-500 text-white">{inboxCount}</SidebarMenuBadge>
							)}
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton asChild tooltip="Tasks" isActive={isTasksPage}>
								<Link to="/tasks">
									<CheckCircle className="text-green-500" />
									<span>Tasks</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
				<SidebarGroup>
					<SidebarGroupLabel>Workspaces</SidebarGroupLabel>
					<SidebarGroupAction title="Add Workspace" onClick={() => setDialogOpen(true)}>
						<Plus />
						<span className="sr-only">Add Workspace</span>
					</SidebarGroupAction>
					<SidebarMenu>
						{workspaces.length === 0 ? (
							<p className="px-2 py-4 text-sm text-muted-foreground">No workspaces yet</p>
						) : (
							workspaces.map((ws) => {
								const wsSessions = sessionsByWorkspace.get(ws.id) || [];

								if (wsSessions.length === 0) {
									return (
										<SidebarMenuItem key={ws.id}>
											<SidebarMenuButton
												asChild
												tooltip={ws.folder_path}
												isActive={ws.id === selectedId && !activeSessionId}
											>
												<Link to="/workspaces/$workspaceId" params={{ workspaceId: String(ws.id) }}>
													<WorkspaceIcon workspace={ws} />
													<span>{ws.name}</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								}

								return (
									<Collapsible.Root key={ws.id} asChild defaultOpen>
										<SidebarMenuItem>
											<SidebarMenuButton
												asChild
												tooltip={ws.folder_path}
												isActive={ws.id === selectedId && !activeSessionId}
											>
												<Link to="/workspaces/$workspaceId" params={{ workspaceId: String(ws.id) }}>
													<WorkspaceIcon workspace={ws} />
													<span>{ws.name}</span>
												</Link>
											</SidebarMenuButton>
											<Collapsible.Trigger asChild>
												<SidebarMenuAction className="data-[state=open]:rotate-90">
													<ChevronRight />
													<span className="sr-only">Toggle</span>
												</SidebarMenuAction>
											</Collapsible.Trigger>
											<Collapsible.Content>
												<SidebarMenuSub>
													{wsSessions.map((session) => (
														<SidebarMenuSubItem key={session.session_id}>
															<SidebarMenuSubButton
																asChild
																size="sm"
																isActive={session.session_id === activeSessionId}
															>
																<Link
																	to="/workspaces/$workspaceId/sessions/$sessionId"
																	params={{
																		workspaceId: String(ws.id),
																		sessionId: session.session_id!,
																	}}
																>
																	<span className="flex-1 truncate">{session.title}</span>
																	{session.ralphMaxIterations != null && (
																		<span className="text-xs font-mono text-muted-foreground tabular-nums">
																			{session.ralphCurrentIteration ?? 0}/
																			{session.ralphMaxIterations}
																		</span>
																	)}
																	<span className="shrink-0">
																		<TaskStatusIcon taskStatus={session.status} sessionStatus={session.sessionStatus} />
																	</span>
																</Link>
															</SidebarMenuSubButton>
														</SidebarMenuSubItem>
													))}
												</SidebarMenuSub>
											</Collapsible.Content>
										</SidebarMenuItem>
									</Collapsible.Root>
								);
							})
						)}
					</SidebarMenu>
				</SidebarGroup>
				</SidebarContent>

			<SidebarFooter>
				<UsageIndicators />
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild tooltip="Settings" isActive={isSettingsPage}>
							<Link to="/settings">
								<Settings />
								<span>Settings</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>

			<CreateWorkspaceDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				onCreate={handleCreate}
			/>
		</Sidebar>
	);
}
