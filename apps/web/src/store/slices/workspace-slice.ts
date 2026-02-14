import { wsRequest } from "@/lib/ws-client";
import type { Workspace } from "../types";

export interface WorkspaceSlice {
	workspaces: Map<number, Workspace>;
	createWorkspace: (
		name: string,
		folderPath: string,
		icon?: string | null,
		linearTeamId?: string | null,
		linearProjectIds?: string[] | null,
	) => Promise<Workspace>;
	updateWorkspace: (
		id: number,
		name: string,
		folderPath: string,
		icon?: string | null,
		linearTeamId?: string | null,
		linearProjectIds?: string[] | null,
	) => Promise<Workspace>;
	deleteWorkspace: (id: number) => Promise<void>;
}

export const createWorkspaceSlice = (): WorkspaceSlice => ({
	workspaces: new Map(),

	createWorkspace: async (name, folderPath, icon, linearTeamId, linearProjectIds) => {
		return wsRequest("workspace:create", {
			name,
			folder_path: folderPath,
			icon: icon ?? null,
			linear_team_id: linearTeamId ?? null,
			linear_project_ids: linearProjectIds ?? null,
		});
	},

	updateWorkspace: async (id, name, folderPath, icon, linearTeamId, linearProjectIds) => {
		return wsRequest("workspace:update", {
			id,
			name,
			folder_path: folderPath,
			icon: icon ?? null,
			linear_team_id: linearTeamId ?? null,
			linear_project_ids: linearProjectIds ?? null,
		});
	},

	deleteWorkspace: async (id) => {
		await wsRequest("workspace:delete", { id });
	},
});
