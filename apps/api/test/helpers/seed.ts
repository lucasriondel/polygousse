/**
 * Seed factories — convenient wrappers around database prepared statements
 * for quickly populating test data. Each factory returns the created entity.
 */

import {
	createWorkspace,
	createTask,
	createFolder,
	createTerminalSession,
	createClaudeSessionPreparing,
	upsertSetting,
	createLinearTaskLink,
} from "@polygousse/database";

import type {
	Workspace,
	Task,
	TaskFolder,
	TerminalSession,
	ClaudeSession,
	Setting,
	LinearTaskLink,
} from "@polygousse/types";

// ---------------------------------------------------------------------------
// Counters for generating unique default values
// ---------------------------------------------------------------------------

let workspaceCounter = 0;
let taskCounter = 0;
let folderCounter = 0;
let terminalCounter = 0;
let claudeCounter = 0;

export function resetSeedCounters(): void {
	workspaceCounter = 0;
	taskCounter = 0;
	folderCounter = 0;
	terminalCounter = 0;
	claudeCounter = 0;
}

// ---------------------------------------------------------------------------
// Individual seed factories
// ---------------------------------------------------------------------------

export function seedWorkspace(
	overrides: {
		name?: string;
		folderPath?: string;
		linearTeamId?: string | null;
		linearProjectIds?: string | null;
	} = {},
): Workspace {
	workspaceCounter++;
	const ws = createWorkspace.get(
		overrides.name ?? `Test Workspace ${workspaceCounter}`,
		overrides.folderPath ?? `/tmp/test-workspace-${workspaceCounter}`,
		null,
		overrides.linearTeamId ?? null,
		overrides.linearProjectIds ?? null,
		0,
	);
	if (!ws) throw new Error("Failed to seed workspace");
	return ws;
}

export function seedTask(
	workspaceId: number,
	overrides: {
		title?: string;
		description?: string | null;
		status?: string;
		sessionId?: string | null;
		position?: number;
		folderId?: number | null;
	} = {},
): Task {
	taskCounter++;
	const task = createTask.get(
		workspaceId,
		overrides.title ?? `Test Task ${taskCounter}`,
		overrides.description ?? null,
		overrides.status ?? "todo",
		overrides.sessionId ?? null,
		overrides.position ?? taskCounter - 1,
		overrides.folderId ?? null,
	);
	if (!task) throw new Error("Failed to seed task");
	return task;
}

export function seedFolder(
	workspaceId: number,
	name?: string,
	position?: number,
): TaskFolder {
	folderCounter++;
	const folder = createFolder.get(
		workspaceId,
		name ?? `Test Folder ${folderCounter}`,
		position ?? folderCounter - 1,
	);
	if (!folder) throw new Error("Failed to seed folder");
	return folder;
}

export function seedTerminalSession(
	workspaceId: number | null,
	cwd?: string,
): TerminalSession {
	terminalCounter++;
	const id = `test-terminal-${terminalCounter}`;
	const session = createTerminalSession.get(
		id,
		workspaceId,
		cwd ?? `/tmp/test-workspace-${terminalCounter}`,
	);
	if (!session) throw new Error("Failed to seed terminal session");
	return session;
}

export function seedClaudeSession(
	workspaceId: number | null,
	terminalSessionId: string | null,
	cwd?: string,
): ClaudeSession {
	claudeCounter++;
	const id = `test-claude-${claudeCounter}`;
	const session = createClaudeSessionPreparing.get(
		id,
		workspaceId,
		cwd ?? `/tmp/test-workspace-${claudeCounter}`,
		terminalSessionId,
	);
	if (!session) throw new Error("Failed to seed claude session");
	return session;
}

export function seedSetting(key: string, value: string): Setting {
	const setting = upsertSetting.get(key, value);
	if (!setting) throw new Error("Failed to seed setting");
	return setting;
}

export function seedLinearTaskLink(
	taskId: number,
	overrides: {
		linearIssueId?: string;
		linearIssueIdentifier?: string;
		linearTeamId?: string;
	} = {},
): LinearTaskLink {
	const link = createLinearTaskLink.get(
		taskId,
		overrides.linearIssueId ?? "issue-id-1",
		overrides.linearIssueIdentifier ?? "LIN-1",
		overrides.linearTeamId ?? "team-1",
	);
	if (!link) throw new Error("Failed to seed linear task link");
	return link;
}

// ---------------------------------------------------------------------------
// Composite factory
// ---------------------------------------------------------------------------

export interface FullSessionStack {
	workspace: Workspace;
	task: Task;
	terminalSession: TerminalSession;
	claudeSession: ClaudeSession;
}

/**
 * Seeds a complete session stack: workspace → task → terminal session → claude session.
 * The task is linked to the terminal session via session_id, and the claude session
 * is linked to the terminal session via terminal_session_id.
 */
export function seedFullSessionStack(
	overrides: {
		workspaceName?: string;
		folderPath?: string;
		taskTitle?: string;
	} = {},
): FullSessionStack {
	const workspace = seedWorkspace({
		name: overrides.workspaceName,
		folderPath: overrides.folderPath,
	});

	const terminalSession = seedTerminalSession(
		workspace.id,
		workspace.folder_path,
	);

	const task = seedTask(workspace.id, {
		title: overrides.taskTitle,
		sessionId: terminalSession.id,
		status: "doing",
	});

	const claudeSession = seedClaudeSession(
		workspace.id,
		terminalSession.id,
		workspace.folder_path,
	);

	return { workspace, task, terminalSession, claudeSession };
}
