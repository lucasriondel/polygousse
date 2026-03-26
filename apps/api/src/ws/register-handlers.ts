import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile, mkdir, rmdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";
import {
	clearHookEvents,
	createAttachment,
	createFolder,
	createLinearTaskLink,
	createTask,
	createWorkspace,
	deleteAttachment,
	deleteFolder,
	deleteSetting,
	deleteTask,
	deleteWorkspace,
	dismissClaudeSession,
	getActiveClaudeSessions,
	getActiveTerminalSessions,
	getAllAttachments,
	getAllFolders,
	getAllLinearTaskLinks,
	getAllSettings,
	getAllTasks,
	getAllWorkspaces,
	getAttachmentById,
	getAttachmentsByTaskId,
	getClaudeSessionById,
	getClaudeSessionsByTerminalId,
	getCompletedTerminalSessions,
	getFolderById,
	getFoldersByWorkspaceId,
	getHookEventById,
	getLinearTaskLinkByTaskId,
	getMaxFolderPosition,
	getMaxTaskPosition,
	getMaxTaskPositionInFolder,
	getRecentHookEvents,
	getRunningRalphSessions,
	getSessionEventsByTerminalId,
	getSetting,
	getTaskById,
	getTaskBySessionId,
	getTasksByWorkspaceId,
	getTerminalSessionById,
	getWaitingClaudeSessionsWithTask,
	getWorkspaceById,
	reorderFolders,
	reorderTasks,
	updateFolderName,
	updateTask,
	updateTaskFolder,
	updateTaskPosition,
	updateWorkspace,
	upsertSetting,
} from "@polygousse/database";
import { debugSettings, debugTaskLifecycle } from "../debug.js";
import { getOrchestratorState } from "../orchestrator.js";
import { orchestrateCommitAndComplete } from "../orchestrators/commit-complete.js";
import { orchestrateExtractPrdAndStartRalph } from "../orchestrators/extract-prd-ralph.js";
import { orchestrateRelogin } from "../orchestrators/relogin.js";
import { getClaudeUsage, refreshClaudeUsage } from "../services/claude-usage.js";
import {
	getLinearIssueDetail,
	getLinearTeamIssues,
	getLinearTeamProjects,
	getLinearTeams,
	isLinearConfigured,
	markLinearIssueDone,
	markLinearIssueInProgress,
} from "../services/linear-client.js";
import { enrichTerminal, enrichTerminals } from "../services/session-enricher.js";
import { StartTaskError, startTask } from "../services/start-task/index.js";
import { teardownSession } from "../services/task-completion.js";
import { tmuxSendKeys } from "../tmux.js";
import { registerHandler } from "./handlers.js";
import { broadcast } from "./index.js";

const execFileAsync = promisify(execFile);

/** Expand leading `~` or `~user` to the home directory */
function resolvePath(p: string): string {
	if (p.startsWith("~/") || p === "~") return p.replace("~", homedir());
	return p;
}

const ATTACHMENTS_DIR = resolve(import.meta.dir, "../../../../data/attachments");

// ── Hydration ───────────────────────────────────────────────────────

registerHandler("hydrate", () => ({
	workspaces: getAllWorkspaces.all(),
	tasks: getAllTasks.all(),
	folders: getAllFolders.all(),
	attachments: getAllAttachments.all(),
	claudeSessions: getActiveClaudeSessions.all(),
	ralphSessions: getRunningRalphSessions.all(),
	settings: getAllSettings.all(),
	linearTaskLinks: getAllLinearTaskLinks.all(),
}));

// ── Workspaces ──────────────────────────────────────────────────────

registerHandler("workspace:create", (payload) => {
	const { name, folder_path, icon, linear_team_id, linear_project_ids } = payload;
	const projectIdsJson = linear_project_ids?.length ? JSON.stringify(linear_project_ids) : null;
	const workspace = createWorkspace.get(
		name,
		resolvePath(folder_path),
		icon ?? null,
		linear_team_id ?? null,
		projectIdsJson,
	);
	if (!workspace) throw new Error("Failed to create workspace");
	broadcast({ type: "workspace:created", workspace });
	return workspace;
});

registerHandler("workspace:update", (payload) => {
	const { id, name, folder_path, icon, linear_team_id, linear_project_ids } = payload;
	const projectIdsJson = linear_project_ids?.length ? JSON.stringify(linear_project_ids) : null;
	const workspace = updateWorkspace.get(
		name,
		resolvePath(folder_path),
		icon ?? null,
		linear_team_id ?? null,
		projectIdsJson,
		id,
	);
	if (!workspace) throw new Error("Workspace not found");
	broadcast({ type: "workspace:updated", workspace });
	return workspace;
});

registerHandler("workspace:delete", (payload) => {
	const existing = getWorkspaceById.get(payload.id);
	if (!existing) throw new Error("Workspace not found");
	deleteWorkspace.run(payload.id);
	broadcast({ type: "workspace:deleted", id: payload.id });
});

registerHandler("workspace:check-path", async (payload) => {
	const folderPath = resolvePath(payload.folder_path);
	let exists = false;
	try {
		const s = await stat(folderPath);
		exists = s.isDirectory();
	} catch {}
	let is_git = false;
	if (exists) {
		try {
			await execFileAsync("git", ["rev-parse", "--git-dir"], { cwd: folderPath });
			is_git = true;
		} catch {}
	}
	return { exists, is_git };
});

registerHandler("workspace:init-repo", async (payload) => {
	const folderPath = resolvePath(payload.folder_path);
	await mkdir(folderPath, { recursive: true });
	await execFileAsync("git", ["init", "-b", "main"], { cwd: folderPath });
});

registerHandler("worktree:create", async (payload) => {
	const { workspaceId, branchName } = payload;

	const workspace = getWorkspaceById.get(workspaceId);
	if (!workspace) throw new Error("Workspace not found");

	const sanitized = branchName
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

	if (!sanitized) throw new Error("Branch name must contain at least one alphanumeric character");

	const folderPath = resolvePath(workspace.folder_path);

	// Pre-flight: ensure the workspace directory exists
	try {
		const s = await stat(folderPath);
		if (!s.isDirectory()) throw new Error(`Workspace path is not a directory: ${folderPath}`);
	} catch (err: unknown) {
		if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(`Workspace directory does not exist: ${folderPath}`);
		}
		throw err;
	}

	// Pre-flight: ensure it's a git repository
	try {
		await execFileAsync("git", ["rev-parse", "--git-dir"], { cwd: folderPath });
	} catch {
		throw new Error(`Workspace is not a git repository: ${folderPath}`);
	}

	const parentDir = dirname(folderPath);
	const parentBase = basename(folderPath);
	const worktreePath = `${parentDir}/${parentBase}-${sanitized}`;

	try {
		await execFileAsync("git", ["worktree", "add", worktreePath, "-b", sanitized], {
			cwd: folderPath,
		});
	} catch (err: unknown) {
		const stderr =
			err instanceof Error && "stderr" in err
				? String((err as { stderr: unknown }).stderr).trim()
				: "";
		const detail = stderr || (err instanceof Error ? err.message : String(err));
		throw new Error(`git worktree add failed: ${detail}`);
	}

	return { path: worktreePath, branch: sanitized };
});

// ── Tasks ───────────────────────────────────────────────────────────

registerHandler("task:create", (payload) => {
	const { workspaceId, title, description, folderId } = payload;
	const maxPos = getMaxTaskPosition.get(workspaceId)?.maxPos ?? -1;
	const task = createTask.get(workspaceId, title, description ?? null, "todo", null, maxPos + 1, folderId || null);
	if (!task) throw new Error("Failed to create task");
	debugTaskLifecycle(`Created task #${task.id}: "${title}"`);
	broadcast({ type: "task:created", task });
	return task;
});

registerHandler("task:update", async (payload, { log }) => {
	const { id, title, description, status } = payload;

	const existing = getTaskById.get(id);
	if (!existing) throw new Error("Task not found");

	const newStatus = status ?? existing.status;
	if (newStatus !== existing.status) {
		debugTaskLifecycle(`Task #${id} status: ${existing.status} → ${newStatus}`);
	}
	let sessionId: string | null | undefined;

	// If marking a running task as done, clean up the session and worktree
	if (newStatus === "done" && existing.session_id && existing.status !== "done") {
		const completedTerminal = await teardownSession(existing.session_id, log);
		if (completedTerminal) {
			broadcast({ type: "terminal-session:updated", session: completedTerminal });
		}
		sessionId = null;
	}

	// Sync completion status to Linear if task is linked
	if (newStatus === "done" && existing.status !== "done") {
		try {
			if (isLinearConfigured()) {
				const link = getLinearTaskLinkByTaskId.get(id);
				if (link) {
					await markLinearIssueDone(link.linear_issue_id);
				}
			}
		} catch (err) {
			log.error(err, "Failed to sync done status to Linear");
		}
	}

	const completedAt =
		newStatus === "done" && existing.status !== "done"
			? new Date().toISOString()
			: newStatus !== "done"
				? null
				: existing.completed_at;

	const task = updateTask.get(
		title ?? existing.title,
		description !== undefined ? description : existing.description,
		newStatus,
		sessionId !== undefined ? sessionId : existing.session_id,
		completedAt,
		id,
	);
	if (!task) throw new Error("Failed to update task");
	broadcast({ type: "task:updated", task });
	return task;
});

registerHandler("task:delete", async (payload) => {
	const existing = getTaskById.get(payload.id);
	if (!existing) throw new Error("Task not found");

	const attachments = getAttachmentsByTaskId.all(payload.id);
	for (const attachment of attachments) {
		try {
			await unlink(attachment.stored_path);
		} catch {
			// File may already be gone
		}
	}
	if (attachments.length > 0) {
		try {
			await rmdir(dirname(attachments[0]!.stored_path));
		} catch {
			// Directory not empty or already gone
		}
	}

	deleteTask.run(payload.id);
	broadcast({ type: "task:deleted", id: payload.id, workspace_id: existing.workspace_id });
});

registerHandler("task:reorder", (payload) => {
	const { workspaceId, taskIds } = payload;
	const results = reorderTasks(taskIds);
	const updatedTasks = results.map((t) => ({ id: t.id, position: t.position, folder_id: t.folder_id }));
	broadcast({ type: "task:reordered", workspace_id: workspaceId, tasks: updatedTasks });
	return getTasksByWorkspaceId.all(workspaceId);
});

registerHandler("task:move-to-folder", (payload) => {
	const { taskId, folderId } = payload;

	const existing = getTaskById.get(taskId);
	if (!existing) throw new Error("Task not found");

	if (folderId !== null) {
		const maxPos = getMaxTaskPositionInFolder.get(folderId)?.maxPos ?? -1;
		updateTaskPosition.run(maxPos + 1, taskId);
	}

	const task = updateTaskFolder.get(folderId, taskId);
	if (!task) throw new Error("Failed to move task");
	broadcast({ type: "task:updated", task });
	return task;
});

registerHandler("task:start", async (payload, { log }) => {
	const { taskId, permissionMode, planMode, cwd, ralphMode, maxIterations } = payload;
	debugTaskLifecycle(`Starting task #${taskId}`);
	try {
		const result = await startTask({ taskId, permissionMode, planMode, cwd, ralphMode, maxIterations }, { log });

		// Sync "In Progress" status to Linear if task is linked
		try {
			if (isLinearConfigured()) {
				const link = getLinearTaskLinkByTaskId.get(taskId);
				if (link) {
					await markLinearIssueInProgress(link.linear_issue_id);
				}
			}
		} catch (err) {
			log.error(err, "Failed to sync in-progress status to Linear");
		}

		return result;
	} catch (err) {
		if (err instanceof StartTaskError) {
			throw new Error(err.message);
		}
		throw err;
	}
});

// ── Folders ─────────────────────────────────────────────────────────

registerHandler("folder:create", (payload) => {
	const { workspaceId, name } = payload;
	const maxPos = getMaxFolderPosition.get(workspaceId)?.maxPos ?? -1;
	const folder = createFolder.get(workspaceId, name, maxPos + 1);
	if (!folder) throw new Error("Failed to create folder");
	broadcast({ type: "folder:created", folder });
	return folder;
});

registerHandler("folder:update", (payload) => {
	const existing = getFolderById.get(payload.id);
	if (!existing) throw new Error("Folder not found");
	const folder = updateFolderName.get(payload.name, payload.id);
	if (!folder) throw new Error("Failed to update folder");
	broadcast({ type: "folder:updated", folder });
	return folder;
});

registerHandler("folder:delete", (payload) => {
	const existing = getFolderById.get(payload.id);
	if (!existing) throw new Error("Folder not found");
	deleteFolder.run(payload.id);
	broadcast({ type: "folder:deleted", id: payload.id, workspace_id: existing.workspace_id });
});

registerHandler("folder:reorder", (payload) => {
	const { workspaceId, folderIds } = payload;
	const results = reorderFolders(folderIds);
	const updatedFolders = results.map((f) => ({ id: f.id, position: f.position }));
	broadcast({ type: "folder:reordered", workspace_id: workspaceId, folders: updatedFolders });
	return getFoldersByWorkspaceId.all(workspaceId);
});

// ── Attachments ─────────────────────────────────────────────────────

registerHandler("attachment:upload", async (payload) => {
	const { taskId, filename, mime_type, data } = payload;

	const task = getTaskById.get(taskId);
	if (!task) throw new Error("Task not found");

	const uuid = randomUUID();
	const storedFilename = `${uuid}-${filename}`;
	const dir = resolve(ATTACHMENTS_DIR, `task-${taskId}`);
	const filePath = resolve(dir, storedFilename);

	await mkdir(dir, { recursive: true });
	const buffer = Buffer.from(data, "base64");
	await Bun.write(filePath, buffer);

	const attachment = createAttachment.get(taskId, filename, filePath, mime_type, buffer.length);
	if (!attachment) throw new Error("Failed to create attachment");
	broadcast({ type: "task:attachment:created", attachment });
	return attachment;
});

registerHandler("attachment:delete", async (payload) => {
	const attachment = getAttachmentById.get(payload.id);
	if (!attachment) throw new Error("Attachment not found");

	try {
		await unlink(attachment.stored_path);
	} catch {
		// File may already be gone
	}
	try {
		await rmdir(dirname(attachment.stored_path));
	} catch {
		// Directory not empty or already gone
	}

	deleteAttachment.run(payload.id);
	broadcast({ type: "task:attachment:deleted", id: payload.id, task_id: attachment.task_id });
});

// ── Settings ────────────────────────────────────────────────────────

registerHandler("setting:update", (payload) => {
	const { key, value } = payload;
	debugSettings(`Upserting key "${key}"`);
	const setting = upsertSetting.get(key, value);
	if (!setting) throw new Error("Failed to update setting");
	broadcast({ type: "setting:updated", setting });
	return setting;
});

registerHandler("setting:delete", (payload) => {
	debugSettings(`Deleting key "${payload.key}"`);
	const existing = getSetting.get(payload.key);
	if (!existing) throw new Error("Setting not found");
	deleteSetting.run(payload.key);
	broadcast({ type: "setting:deleted", key: payload.key });
});

registerHandler("setting:get", (payload) => {
	debugSettings(`Reading key "${payload.key}"`);
	const setting = getSetting.get(payload.key);
	if (!setting) throw new Error("Setting not found");
	if (payload.key.includes("token")) {
		return { ...setting, value: "••••••••" };
	}
	return setting;
});

// ── Sessions ────────────────────────────────────────────────────────

registerHandler("session:terminate", async (payload, { log }) => {
	const { sessionId } = payload;

	const terminalSession = await teardownSession(sessionId, log);
	if (terminalSession) {
		broadcast({ type: "terminal-session:updated", session: terminalSession });
	}

	// Detach the task from the terminated session and reset status to todo
	const task = getTaskBySessionId.get(sessionId);
	if (task) {
		const updatedTask = updateTask.get(task.title, task.description, "todo", null, null, task.id);
		if (updatedTask) {
			broadcast({ type: "task:updated", task: updatedTask });
		}
	}

	return terminalSession;
});

registerHandler("session:complete-task", async (payload, { log }) => {
	const { sessionId } = payload;

	const terminalSession = await teardownSession(sessionId, log);

	const task = getTaskBySessionId.get(sessionId);
	if (!task) {
		log.warn({ sessionId }, "No task found for this session, only tearing down session");
		if (terminalSession) {
			broadcast({ type: "terminal-session:updated", session: terminalSession });
		}
		return terminalSession;
	}

	const updatedTask = updateTask.get(task.title, task.description, "done", null, new Date().toISOString(), task.id);
	if (!updatedTask) throw new Error("Failed to update task");

	// Sync completion status to Linear if task is linked
	try {
		if (isLinearConfigured()) {
			const link = getLinearTaskLinkByTaskId.get(task.id);
			if (link) {
				await markLinearIssueDone(link.linear_issue_id);
			}
		}
	} catch (err) {
		log.error(err, "Failed to sync done status to Linear");
	}

	broadcast({ type: "task:updated", task: updatedTask });
	if (terminalSession) {
		broadcast({ type: "terminal-session:updated", session: terminalSession });
	}

	return updatedTask;
});

registerHandler("session:commit-and-complete", (payload, { log }) => {
	const { sessionId } = payload;

	const task = getTaskBySessionId.get(sessionId);
	if (!task) throw new Error("No task found for this session");

	const claudeSessions = getClaudeSessionsByTerminalId.all(sessionId);
	const activeClaudeSession = claudeSessions.find((s) => s.status !== "completed");
	if (!activeClaudeSession) throw new Error("No active Claude session found");

	const existing = getOrchestratorState(sessionId);
	if (existing && existing.status === "running") {
		throw new Error("An orchestrator is already running for this session");
	}

	orchestrateCommitAndComplete({
		terminalSessionId: sessionId,
		claudeSessionId: activeClaudeSession.id,
		log,
	});
});

registerHandler("session:relogin", (payload, { log }) => {
	const { sessionId } = payload;

	const task = getTaskBySessionId.get(sessionId);
	if (!task) throw new Error("No task found for this session");

	const claudeSessions = getClaudeSessionsByTerminalId.all(sessionId);
	const activeClaudeSession = claudeSessions.find((s) => s.status !== "completed");
	if (!activeClaudeSession) throw new Error("No active Claude session found");

	const existing = getOrchestratorState(sessionId);
	if (existing && existing.status === "running") {
		throw new Error("An orchestrator is already running for this session");
	}

	orchestrateRelogin({
		terminalSessionId: sessionId,
		claudeSessionId: activeClaudeSession.id,
		log,
	});
});

registerHandler("session:extract-prd", (payload, { log }) => {
	const { sessionId, hookEventId, maxIterations } = payload;

	const task = getTaskBySessionId.get(sessionId);
	if (!task) throw new Error("No task found for this session");

	const hookEvent = getHookEventById.get(hookEventId);
	if (!hookEvent) throw new Error("Hook event not found");

	let rawBody: Record<string, unknown>;
	try {
		rawBody = JSON.parse(hookEvent.raw_body);
	} catch {
		throw new Error("Failed to parse hook event raw_body");
	}

	if (hookEvent.hook_event_name !== "PermissionRequest" || rawBody.tool_name !== "ExitPlanMode") {
		throw new Error("Hook event is not an ExitPlanMode permission request");
	}

	const toolInput = rawBody.tool_input as Record<string, unknown> | undefined;
	const plan = toolInput?.plan as string | undefined;
	if (!plan) throw new Error("No plan found in ExitPlanMode tool input");

	const claudeSessions = getClaudeSessionsByTerminalId.all(sessionId);
	const activeClaudeSession = claudeSessions.find((s) => s.status !== "completed");
	if (!activeClaudeSession) throw new Error("No active Claude session found");

	const existing = getOrchestratorState(sessionId);
	if (existing && existing.status === "running") {
		throw new Error("An orchestrator is already running for this session");
	}

	if (!hookEvent.cwd) throw new Error("Hook event has no cwd");
	const cwd = hookEvent.cwd;
	const ralphSessionId = randomUUID();

	orchestrateExtractPrdAndStartRalph({
		terminalSessionId: sessionId,
		claudeSessionId: activeClaudeSession.id,
		ralphSessionId,
		cwd,
		taskId: task.id,
		maxIterations: maxIterations ?? 50,
		plan,
		log,
	});
});

registerHandler("session:send-message", async (payload) => {
	const { sessionId, message } = payload;

	const task = getTaskBySessionId.get(sessionId);
	if (!task) throw new Error("No task found for this session");

	const workspace = getWorkspaceById.get(task.workspace_id);
	if (!workspace) throw new Error("Workspace not found");

	await tmuxSendKeys(sessionId, message, { literal: true });
});

registerHandler("session:split-terminal", async (payload) => {
	const { sessionId, direction } = payload;
	const terminalSession = getTerminalSessionById.get(sessionId);
	if (!terminalSession) throw new Error("Terminal session not found");
	const flag = direction === "horizontal" ? "-h" : "-v";
	await execFileAsync("tmux", ["split-window", flag, "-t", sessionId]);
});

registerHandler("session:debug", () => {
	const active = enrichTerminals(getActiveTerminalSessions.all());
	const completed = enrichTerminals(getCompletedTerminalSessions.all());
	return { active, completed };
});

registerHandler("session:debug-detail", (payload) => {
	const { terminalSessionId } = payload;
	const terminalSession = getTerminalSessionById.get(terminalSessionId);
	if (!terminalSession) throw new Error("Terminal session not found");
	const enriched = enrichTerminal(terminalSession);
	const events = getSessionEventsByTerminalId.all(terminalSessionId);
	return { ...enriched, events };
});

registerHandler("session:ralph-running", () => {
	return getRunningRalphSessions.all();
});

// ── Hooks ───────────────────────────────────────────────────────────

registerHandler("hook:events-recent", (payload) => {
	const parsedLimit = Math.min(Math.max(Number(payload.limit) || 200, 1), 1000);
	return getRecentHookEvents.all(parsedLimit);
});

registerHandler("hook:events-clear", () => {
	clearHookEvents.run();
});

registerHandler("hook:sessions", () => {
	return getActiveClaudeSessions.all();
});

registerHandler("hook:sessions-waiting", () => {
	return getWaitingClaudeSessionsWithTask.all();
});

registerHandler("hook:session-get", (payload) => {
	const session = getClaudeSessionById.get(payload.id);
	if (!session) throw new Error("Session not found");
	return session;
});

registerHandler("hook:session-dismiss", (payload) => {
	const session = dismissClaudeSession.get(payload.id);
	if (!session) throw new Error("Session not found");
	broadcast({ type: "claude-session:updated", session });
	return session;
});

// ── Linear helpers ──────────────────────────────────────────────────

function mimeFromFilename(filename: string): string {
	const ext = filename.split(".").pop()?.toLowerCase();
	const map: Record<string, string> = {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
		pdf: "application/pdf",
		txt: "text/plain",
		md: "text/markdown",
		csv: "text/csv",
		json: "application/json",
		zip: "application/zip",
	};
	return (ext && map[ext]) || "application/octet-stream";
}

async function downloadLinearAttachments(
	taskId: number,
	attachments: { id: string; title: string | null; url: string; sourceType: string | null }[],
	log: { error: (err: unknown, msg: string) => void },
): Promise<void> {
	const fileAttachments = attachments.filter(
		(a) => a.sourceType === "file" || a.url.includes("uploads.linear.app"),
	);
	if (fileAttachments.length === 0) return;

	const dir = resolve(ATTACHMENTS_DIR, `task-${taskId}`);
	await mkdir(dir, { recursive: true });

	for (const att of fileAttachments) {
		try {
			// URLs are pre-signed via the public-file-urls-expire-in header in the GraphQL query
			const response = await fetch(att.url);
			if (!response.ok) {
				log.error(new Error(`HTTP ${response.status}`), `Failed to download Linear attachment ${att.id}`);
				continue;
			}
			const buffer = Buffer.from(await response.arrayBuffer());
			const originalName = att.title || att.url.split("/").pop() || "attachment";
			const uuid = randomUUID();
			const storedFilename = `${uuid}-${originalName}`;
			const filePath = resolve(dir, storedFilename);
			await Bun.write(filePath, buffer);

			const mimeType = mimeFromFilename(originalName);
			const attachment = createAttachment.get(taskId, originalName, filePath, mimeType, buffer.length);
			if (attachment) {
				broadcast({ type: "task:attachment:created", attachment });
			}
		} catch (err) {
			log.error(err, `Failed to download Linear attachment ${att.id}`);
		}
	}
}

// ── Linear ──────────────────────────────────────────────────────────

registerHandler("linear:configured", () => {
	return { configured: isLinearConfigured() };
});

registerHandler("linear:teams", async () => {
	if (!isLinearConfigured()) throw new Error("Linear API token not configured");
	return getLinearTeams();
});

registerHandler("linear:team-issues", async (payload) => {
	if (!isLinearConfigured()) throw new Error("Linear API token not configured");
	const projectIds = payload.projectIds ? payload.projectIds.split(",") : undefined;
	return getLinearTeamIssues(payload.teamId, projectIds);
});

registerHandler("linear:team-projects", async (payload) => {
	if (!isLinearConfigured()) throw new Error("Linear API token not configured");
	return getLinearTeamProjects(payload.teamId);
});

registerHandler("linear:issue-detail", async (payload) => {
	if (!isLinearConfigured()) throw new Error("Linear API token not configured");
	return getLinearIssueDetail(payload.issueId);
});

registerHandler("linear:issue-done", async (payload) => {
	if (!isLinearConfigured()) throw new Error("Linear API token not configured");
	await markLinearIssueDone(payload.issueId);
	return { success: true as const };
});

registerHandler("linear:import", async (payload, { log }) => {
	if (!isLinearConfigured()) throw new Error("Linear API token not configured");

	const { issueId, issueIdentifier, issueTitle, teamId, workspaceId } = payload;
	const title = `[${issueIdentifier}] ${issueTitle}`;
	const maxPos = getMaxTaskPosition.get(workspaceId)?.maxPos ?? -1;
	const task = createTask.get(workspaceId, title, null, "todo", null, maxPos + 1, null);
	if (!task) throw new Error("Failed to create task");

	broadcast({ type: "task:created", task });

	const link = createLinearTaskLink.get(task.id, issueId, issueIdentifier, teamId);
	if (!link) throw new Error("Failed to create linear task link");
	broadcast({ type: "linear-task-link:created", link });

	// Fetch issue description and attachments from Linear
	try {
		const issueDetail = await getLinearIssueDetail(issueId);

		if (issueDetail.description) {
			const updatedTask = updateTask.get(
				task.title,
				issueDetail.description,
				task.status,
				task.session_id,
				task.completed_at,
				task.id,
			);
			if (updatedTask) {
				broadcast({ type: "task:updated", task: updatedTask });
			}
		}

		if (issueDetail.attachments.length > 0) {
			await downloadLinearAttachments(task.id, issueDetail.attachments, log);
		}
	} catch (err) {
		log.error(err, "Failed to fetch Linear issue details — task created without description/attachments");
	}

	return { task, link };
});

registerHandler("linear:create-and-start", async (payload, { log }) => {
	if (!isLinearConfigured()) throw new Error("Linear API token not configured");

	const { issueId, issueIdentifier, issueTitle, teamId, workspaceId, permissionMode, planMode, worktreePath, ralphMode, maxIterations } = payload;
	const title = `[${issueIdentifier}] ${issueTitle}`;
	const maxPos = getMaxTaskPosition.get(workspaceId)?.maxPos ?? -1;
	const task = createTask.get(workspaceId, title, null, "todo", null, maxPos + 1, null);
	if (!task) throw new Error("Failed to create task");

	broadcast({ type: "task:created", task });

	const link = createLinearTaskLink.get(task.id, issueId, issueIdentifier, teamId);
	if (!link) throw new Error("Failed to create linear task link");
	broadcast({ type: "linear-task-link:created", link });

	// Fetch issue description and attachments from Linear
	try {
		const issueDetail = await getLinearIssueDetail(issueId);

		if (issueDetail.description) {
			const updatedTask = updateTask.get(
				task.title,
				issueDetail.description,
				task.status,
				task.session_id,
				task.completed_at,
				task.id,
			);
			if (updatedTask) {
				broadcast({ type: "task:updated", task: updatedTask });
			}
		}

		if (issueDetail.attachments.length > 0) {
			await downloadLinearAttachments(task.id, issueDetail.attachments, log);
		}
	} catch (err) {
		log.error(err, "Failed to fetch Linear issue details — starting task without description/attachments");
	}

	try {
		const startedTask = await startTask(
			{ taskId: task.id, permissionMode, planMode, cwd: worktreePath, ralphMode, maxIterations },
			{ log },
		);

		// Sync "In Progress" status to Linear
		try {
			await markLinearIssueInProgress(issueId);
		} catch (err) {
			log.error(err, "Failed to sync in-progress status to Linear");
		}

		return { task: startedTask, link };
	} catch (err) {
		// Clean up: delete the task (cascade deletes the link)
		deleteTask.run(task.id);
		broadcast({ type: "task:deleted", id: task.id, workspace_id: workspaceId });
		if (err instanceof StartTaskError) {
			throw new Error(err.message);
		}
		throw err;
	}
});

registerHandler("linear:task-links", () => {
	return getAllLinearTaskLinks.all();
});

// ── Claude Usage ────────────────────────────────────────────────────

registerHandler("claude-usage:get", () => getClaudeUsage());

registerHandler("claude-usage:refresh", async () => {
	await refreshClaudeUsage();
	return getClaudeUsage();
});

// ── Filesystem ──────────────────────────────────────────────────────

registerHandler("filesystem:browse", async (payload) => {
	const dirPath = resolve(payload.path || homedir());

	try {
		const entries = await readdir(dirPath, { withFileTypes: true });
		const directories = entries
			.filter((e) => e.isDirectory() && !e.name.startsWith("."))
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((e) => ({
				name: e.name,
				path: resolve(dirPath, e.name),
			}));

		const parent = dirname(dirPath);
		return {
			path: dirPath,
			parent: parent !== dirPath ? parent : null,
			directories,
		};
	} catch {
		throw new Error(`Cannot access directory: ${dirPath}`);
	}
});

// ── Transcripts ─────────────────────────────────────────────────────

function cwdToProjectKey(cwd: string): string {
	return `-${cwd.split("/").join("-")}`;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		const { access } = await import("node:fs/promises");
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function findTranscriptFile(sessionId: string, cwd: string): Promise<string | null> {
	const { join } = await import("node:path");
	const claudeDir = join(homedir(), ".claude", "projects");

	let current = cwd;
	while (current && current !== "/") {
		const projectKey = cwdToProjectKey(current);
		const filePath = join(claudeDir, projectKey, `${sessionId}.jsonl`);
		if (await fileExists(filePath)) return filePath;
		const parent = current.replace(/\/[^/]+$/, "");
		if (parent === current) break;
		current = parent;
	}

	try {
		const dirs = await readdir(claudeDir);
		for (const dir of dirs) {
			const filePath = join(claudeDir, dir, `${sessionId}.jsonl`);
			if (await fileExists(filePath)) return filePath;
		}
	} catch {
		// ~/.claude/projects may not exist
	}

	return null;
}

registerHandler("transcript:get", async (payload) => {
	const { sessionId, cwd } = payload;

	const filePath = await findTranscriptFile(sessionId, cwd);
	if (!filePath) throw new Error("Transcript file not found");

	const raw = await readFile(filePath, "utf-8");
	const entries: Array<Record<string, unknown>> = [];

	for (const line of raw.split("\n")) {
		if (!line.trim()) continue;
		try {
			const parsed = JSON.parse(line);
			if (parsed.type === "file-history-snapshot" || parsed.type === "queue-operation") continue;
			if (parsed.type === "progress" && parsed.data?.type === "agent_progress") {
				delete parsed.data.normalizedMessages;
			}
			entries.push(parsed);
		} catch {
			// Skip malformed lines
		}
	}

	return entries;
});
