import { db } from "../connection.js";

export type { Workspace } from "@polygousse/types";

import type { Workspace } from "@polygousse/types";

export const getAllWorkspaces = db.prepare<Workspace, []>("SELECT * FROM workspaces ORDER BY name");

export const getWorkspaceById = db.prepare<Workspace, [number]>(
	"SELECT * FROM workspaces WHERE id = ?",
);

export const createWorkspace = db.prepare<Workspace, [string, string, string | null, string | null, string | null, number]>(
	"INSERT INTO workspaces (name, folder_path, icon, linear_team_id, linear_project_ids, nested_repos) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
);

export const updateWorkspace = db.prepare<Workspace, [string, string, string | null, string | null, string | null, number, number]>(
	"UPDATE workspaces SET name = ?, folder_path = ?, icon = ?, linear_team_id = ?, linear_project_ids = ?, nested_repos = ? WHERE id = ? RETURNING *",
);

export const deleteWorkspace = db.prepare("DELETE FROM workspaces WHERE id = ?");

export const getWorkspaceByFolderPath = db.prepare<Workspace, [string, string]>(
	"SELECT * FROM workspaces WHERE ? = folder_path OR ? LIKE folder_path || '/%' ORDER BY LENGTH(folder_path) DESC LIMIT 1",
);
