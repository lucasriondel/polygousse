import {
	createRootRoute,
	createRoute,
	createRouter,
	Navigate,
	useParams,
} from "@tanstack/react-router";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { RootLayout } from "@/layouts/sidebar-layout";
import { WorkspaceLayout } from "@/layouts/workspace-layout";
import { InboxPage } from "@/pages/inbox";
import { SessionPage } from "@/pages/session";
import { SessionDebugPage } from "@/pages/session-debug";
import { SettingsPage } from "@/pages/settings";
import { TasksPage } from "@/pages/tasks";
import { TranscriptPage } from "@/pages/transcript";
import { WorkspacePage } from "@/pages/workspace";
import { WorkspaceSettingsPage } from "@/pages/workspace-settings";
import { WorkspaceTasksPage } from "@/pages/workspace-tasks";

const rootRoute = createRootRoute({
	component: RootLayout,
	notFoundComponent: () => (
		<div className="mx-auto max-w-2xl px-4 py-16 text-center">
			<h1 className="text-4xl font-bold tracking-tight">404</h1>
			<p className="mt-2 text-muted-foreground">Page not found</p>
		</div>
	),
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: () => <Navigate to="/inbox" />,
});

const workspaceLayoutRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspaces/$workspaceId",
	component: WorkspaceLayout,
});

function WorkspaceRouteComponent() {
	const { workspaceId } = useParams({ from: "/workspaces/$workspaceId/" });
	const { workspaces } = useWorkspaces();

	const workspace = workspaces.find((w) => w.id === Number(workspaceId));

	if (!workspace) {
		return <Navigate to="/" />;
	}

	return <WorkspacePage workspace={workspace} />;
}

const workspaceRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/",
	component: WorkspaceRouteComponent,
});

const inboxRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/inbox",
	component: InboxPage,
});

const tasksRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/tasks",
	component: TasksPage,
});

function WorkspaceTasksRouteComponent() {
	const { workspaceId } = useParams({
		from: "/workspaces/$workspaceId/tasks",
	});
	const { workspaces } = useWorkspaces();

	const workspace = workspaces.find((w) => w.id === Number(workspaceId));

	if (!workspace) {
		return <Navigate to="/" />;
	}

	return <WorkspaceTasksPage workspace={workspace} />;
}

const workspaceTasksRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/tasks",
	component: WorkspaceTasksRouteComponent,
});

function WorkspaceSettingsRouteComponent() {
	const { workspaceId } = useParams({
		from: "/workspaces/$workspaceId/settings",
	});
	const { workspaces } = useWorkspaces();

	const workspace = workspaces.find((w) => w.id === Number(workspaceId));

	if (!workspace) {
		return <Navigate to="/" />;
	}

	return <WorkspaceSettingsPage workspace={workspace} />;
}

const workspaceSettingsRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/settings",
	component: WorkspaceSettingsRouteComponent,
});

function SessionRouteComponent() {
	const { workspaceId, sessionId } = useParams({
		from: "/workspaces/$workspaceId/sessions/$sessionId",
	});
	const { workspaces } = useWorkspaces();

	const workspace = workspaces.find((w) => w.id === Number(workspaceId));

	if (!workspace) {
		return <Navigate to="/" />;
	}

	return <SessionPage key={sessionId} sessionId={sessionId} workspaceId={workspaceId} workspace={workspace} />;
}

const sessionRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/sessions/$sessionId",
	component: SessionRouteComponent,
});

function SessionDebugRouteComponent() {
	const { workspaceId, sessionId } = useParams({
		from: "/workspaces/$workspaceId/sessions/$sessionId/debug",
	});
	return <SessionDebugPage sessionId={sessionId} workspaceId={workspaceId} />;
}

const sessionDebugRoute = createRoute({
	getParentRoute: () => workspaceLayoutRoute,
	path: "/sessions/$sessionId/debug",
	component: SessionDebugRouteComponent,
});

function TranscriptRouteComponent() {
	const { sessionId } = useParams({ from: "/transcript/$sessionId" });
	return <TranscriptPage sessionId={sessionId} />;
}

const transcriptRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/transcript/$sessionId",
	component: TranscriptRouteComponent,
	validateSearch: (search: Record<string, unknown>) => ({
		cwd: (search.cwd as string) ?? "",
	}),
});

const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings",
	component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
	indexRoute,
	inboxRoute,
	tasksRoute,
	workspaceLayoutRoute.addChildren([
		workspaceRoute,
		workspaceTasksRoute,
		workspaceSettingsRoute,
		sessionRoute,
		sessionDebugRoute,
	]),
	transcriptRoute,
	settingsRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
