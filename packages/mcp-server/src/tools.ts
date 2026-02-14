import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	getAllWorkspaces,
	getTasksByWorkspaceId,
	getTaskById,
	getMaxTaskPosition,
	createTask,
	updateTask,
} from "@polygousse/database";
import { createTaskViaApi, updateTaskViaApi } from "./api-client.js";

const TaskStatusEnum = z.enum(["todo", "doing", "done", "waiting_for_input"]);

export function registerTools(server: McpServer) {
	server.tool("list_workspaces", "List all available workspaces", {}, async () => {
		const workspaces = getAllWorkspaces.all();
		return {
			content: [{ type: "text", text: JSON.stringify(workspaces, null, 2) }],
		};
	});

	server.tool(
		"list_tasks",
		"List all tasks in a workspace",
		{ workspace_id: z.number().describe("The workspace ID") },
		async ({ workspace_id }) => {
			const tasks = getTasksByWorkspaceId.all(workspace_id);
			return {
				content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }],
			};
		},
	);

	server.tool(
		"create_task",
		"Create a new task in a workspace",
		{
			workspace_id: z.number().describe("The workspace ID"),
			title: z.string().describe("Task title"),
			description: z.string().optional().describe("Task description"),
			status: TaskStatusEnum.optional().describe("Task status (default: todo)"),
			folder_id: z.number().optional().describe("Folder ID to place the task in"),
		},
		async ({ workspace_id, title, description, status, folder_id }) => {
			// Try API first so the web UI updates in real-time via WebSocket
			const apiResult = await createTaskViaApi(workspace_id, title, description, status, folder_id);
			if (apiResult) {
				return {
					content: [{ type: "text", text: JSON.stringify(apiResult, null, 2) }],
				};
			}

			// Fallback: write directly to DB
			const maxPos = getMaxTaskPosition.get(workspace_id);
			const position = (maxPos?.maxPos ?? -1) + 1;
			const task = createTask.get(
				workspace_id,
				title,
				description ?? null,
				status ?? "todo",
				null,
				position,
				folder_id ?? null,
			);
			return {
				content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
			};
		},
	);

	server.tool(
		"update_task",
		"Update a task's title, description, or status",
		{
			task_id: z.number().describe("The task ID"),
			title: z.string().optional().describe("New title"),
			description: z.string().optional().describe("New description"),
			status: TaskStatusEnum.optional().describe("New status"),
		},
		async ({ task_id, title, description, status }) => {
			// Try API first
			const fields: { title?: string; description?: string; status?: string } = {};
			if (title !== undefined) fields.title = title;
			if (description !== undefined) fields.description = description;
			if (status !== undefined) fields.status = status;

			const apiResult = await updateTaskViaApi(task_id, fields);
			if (apiResult) {
				return {
					content: [{ type: "text", text: JSON.stringify(apiResult, null, 2) }],
				};
			}

			// Fallback: read current task then apply updates directly
			const existing = getTaskById.get(task_id);
			if (!existing) {
				return {
					content: [{ type: "text", text: `Task ${task_id} not found` }],
					isError: true,
				};
			}

			const task = updateTask.get(
				title ?? existing.title,
				description !== undefined ? description : existing.description,
				status ?? existing.status,
				existing.session_id,
				task_id,
			);
			return {
				content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
			};
		},
	);
}
