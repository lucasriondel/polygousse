import type { Workspace } from "@/hooks/use-workspaces";
import { WorkspacePage } from "@/pages/workspace";

export function WorkspaceTasksPage({ workspace }: { workspace: Workspace }) {
	return <WorkspacePage workspace={workspace} showDone={false} />;
}
