import type { LinearTaskLink } from "@polygousse/types";
import { db } from "../connection.js";

export type { LinearTaskLink } from "@polygousse/types";

export const createLinearTaskLink = db.prepare<LinearTaskLink, [number, string, string, string]>(
	"INSERT INTO linear_task_links (task_id, linear_issue_id, linear_issue_identifier, linear_team_id) VALUES (?, ?, ?, ?) RETURNING *",
);

export const getLinearTaskLinkByTaskId = db.prepare<LinearTaskLink, [number]>(
	"SELECT * FROM linear_task_links WHERE task_id = ?",
);

export const getLinearTaskLinkByIssueId = db.prepare<LinearTaskLink, [string]>(
	"SELECT * FROM linear_task_links WHERE linear_issue_id = ?",
);

export const getAllLinearTaskLinks = db.prepare<LinearTaskLink, []>(
	"SELECT * FROM linear_task_links ORDER BY created_at DESC",
);

export const deleteLinearTaskLink = db.prepare("DELETE FROM linear_task_links WHERE id = ?");
