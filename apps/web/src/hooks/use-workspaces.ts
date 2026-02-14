import { shallowArrayEqual } from "@/lib/shallow-array-equal";
import { useStore } from "@/store";
import { selectWorkspaces } from "@/store/selectors";

// Re-export type so existing consumers don't need to change imports
export type { Workspace } from "@/store/types";

export function useWorkspaces() {
	const workspaces = useStore(selectWorkspaces, shallowArrayEqual);
	const createWorkspace = useStore((s) => s.createWorkspace);
	const updateWorkspace = useStore((s) => s.updateWorkspace);
	const deleteWorkspace = useStore((s) => s.deleteWorkspace);

	return {
		workspaces,
		create: createWorkspace,
		update: updateWorkspace,
		remove: deleteWorkspace,
	};
}
