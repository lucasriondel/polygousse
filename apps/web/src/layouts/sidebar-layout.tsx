import { Outlet, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { Bug, Search, Settings, X } from "lucide-react";
import { useRef, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { DebugPanel } from "@/components/debug/debug-panel";
import { DebugPanelProvider, useDebugPanel } from "@/components/debug/debug-panel-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { useBrowserNotifications } from "@/hooks/use-browser-notifications";
import { useWaitingClaudeSessions } from "@/hooks/use-claude-sessions";
import { useActiveSessions } from "@/hooks/use-sessions";
import { useWorkspaces } from "@/hooks/use-workspaces";

export function RootLayout() {
	return (
		<DebugPanelProvider>
			<RootLayoutInner />
		</DebugPanelProvider>
	);
}

function RootLayoutInner() {
	const { workspaces, create } = useWorkspaces();
	const { sessions: activeSessions } = useActiveSessions();
	const { sessions: waitingSessions } = useWaitingClaudeSessions();
	const { workspaceId, sessionId } = useParams({ strict: false });
	const location = useLocation();
	const navigate = useNavigate();
	useBrowserNotifications(waitingSessions, navigate);
	const [searchQuery, setSearchQuery] = useState("");
	const searchInputRef = useRef<HTMLInputElement>(null);
	const debugPanel = useDebugPanel();

	const isInboxPage = location.pathname.startsWith("/inbox");
	const isTasksPage = location.pathname.startsWith("/tasks");
	const isTranscriptPage = location.pathname.startsWith("/transcript/");
	const isSettingsPage = location.pathname === "/settings";
	const selectedWorkspace = workspaceId
		? (workspaces.find((w) => w.id === Number(workspaceId)) ?? null)
		: null;

	function renderHeaderTitle() {
		if (isInboxPage) return "Inbox";
		if (isTasksPage) return "Tasks";
		if (isTranscriptPage) return "Transcript";
		if (isSettingsPage) return "Settings";
		if (selectedWorkspace) {
			return selectedWorkspace.name;
		}
		return "polygousse";
	}

	const isWorkspacePage = selectedWorkspace && !sessionId;

	return (
		<>
		<Toaster position="bottom-right" />
		<SidebarProvider>
			<AppSidebar
				workspaces={workspaces}
				selectedId={selectedWorkspace?.id ?? null}
				onCreate={create}
				activeSessions={activeSessions}
				inboxCount={waitingSessions.length}
			/>
			<SidebarInset className="max-h-svh overflow-hidden">
				<header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
					<SidebarTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mr-2 !h-4" />
					<span className="text-sm font-medium truncate">{renderHeaderTitle()}</span>
					{isWorkspacePage && (
						<>
							<div className="flex flex-1 justify-center px-4">
								<div className="relative w-full max-w-sm">
									<Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
									<input
										ref={searchInputRef}
										type="text"
										placeholder="Search tasks..."
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										className="h-7 w-full rounded-md border border-input bg-transparent pl-8 pr-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									/>
									{searchQuery && (
										<button
											type="button"
											onClick={() => {
												setSearchQuery("");
												searchInputRef.current?.focus();
											}}
											className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
										>
											<X className="size-3.5" />
										</button>
									)}
								</div>
							</div>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() =>
									navigate({
										to: "/workspaces/$workspaceId/settings",
										params: { workspaceId: String(selectedWorkspace.id) },
									})
								}
							>
								<Settings className="size-4" />
							</Button>
						</>
					)}
						<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant={debugPanel.open ? "secondary" : "ghost"}
								size="icon-sm"
								className="ml-auto"
								onClick={debugPanel.toggle}
							>
								<Bug className="size-4 text-red-400" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Debug (Ctrl+Shift+D)</TooltipContent>
					</Tooltip>
				</header>
				<div className="flex flex-1 min-h-0 overflow-hidden">
					<div className="flex-1 overflow-hidden">
						<Outlet />
					</div>
					<DebugPanel />
				</div>
			</SidebarInset>
		</SidebarProvider>
		</>
	);
}
