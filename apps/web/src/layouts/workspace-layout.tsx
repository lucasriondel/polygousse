import { Navigate, Outlet, useLocation, useParams } from "@tanstack/react-router";
import { WorkspaceTabBar } from "@/components/workspace-tab-bar";
import { useActiveSessions } from "@/hooks/use-sessions";
import { useWorkspaces } from "@/hooks/use-workspaces";

export function WorkspaceLayout() {
	const { workspaceId } = useParams({ strict: false }) as { workspaceId: string };
	const { workspaces } = useWorkspaces();
	const { sessions: activeSessions } = useActiveSessions();
	const location = useLocation();

	const workspace = workspaces.find((w) => w.id === Number(workspaceId));

	if (!workspace) {
		return <Navigate to="/" />;
	}

	const workspaceSessions = activeSessions.filter(
		(s) => s.workspace_id === workspace.id,
	);

	// Only show tab bar on workspace index and session routes, not settings/debug
	const pathname = location.pathname;
	const workspaceBase = `/workspaces/${workspaceId}`;
	const isSessionRoute = pathname.startsWith(`${workspaceBase}/sessions/`);
	const isIndex = pathname === workspaceBase || pathname === `${workspaceBase}/`;
	const showTabBar = isIndex || isSessionRoute;

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{showTabBar && (
				<WorkspaceTabBar
					workspaceId={workspaceId}
					sessions={workspaceSessions}
				/>
			)}
			<div className="min-h-0 flex-1 h-full overflow-hidden">
				<Outlet />
			</div>
		</div>
	);
}
