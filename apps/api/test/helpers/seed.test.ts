import { describe, test, expect, beforeEach } from "bun:test";
import { cleanupDb } from "./setup.js";
import {
	seedWorkspace,
	seedTask,
	seedFolder,
	seedTerminalSession,
	seedClaudeSession,
	seedSetting,
	seedLinearTaskLink,
	seedFullSessionStack,
	resetSeedCounters,
} from "./seed.js";

beforeEach(() => {
	cleanupDb();
	resetSeedCounters();
});

describe("seed factories", () => {
	test("seedWorkspace creates workspace with defaults", () => {
		const ws = seedWorkspace();
		expect(ws.id).toBeGreaterThan(0);
		expect(ws.name).toBe("Test Workspace 1");
		expect(ws.folder_path).toBe("/tmp/test-workspace-1");
		expect(ws.linear_team_id).toBeNull();
		expect(ws.linear_project_ids).toBeNull();
	});

	test("seedWorkspace accepts overrides", () => {
		const ws = seedWorkspace({
			name: "My Project",
			folderPath: "/home/user/project",
			linearTeamId: "team-abc",
			linearProjectIds: "proj-1,proj-2",
		});
		expect(ws.name).toBe("My Project");
		expect(ws.folder_path).toBe("/home/user/project");
		expect(ws.linear_team_id).toBe("team-abc");
		expect(ws.linear_project_ids).toBe("proj-1,proj-2");
	});

	test("seedTask creates task linked to workspace", () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id);
		expect(task.id).toBeGreaterThan(0);
		expect(task.workspace_id).toBe(ws.id);
		expect(task.title).toBe("Test Task 1");
		expect(task.status).toBe("todo");
		expect(task.session_id).toBeNull();
	});

	test("seedTask accepts overrides", () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id, {
			title: "Custom Task",
			description: "With description",
			status: "doing",
			position: 5,
		});
		expect(task.title).toBe("Custom Task");
		expect(task.description).toBe("With description");
		expect(task.status).toBe("doing");
		expect(task.position).toBe(5);
	});

	test("seedFolder creates folder in workspace", () => {
		const ws = seedWorkspace();
		const folder = seedFolder(ws.id);
		expect(folder.id).toBeGreaterThan(0);
		expect(folder.workspace_id).toBe(ws.id);
		expect(folder.name).toBe("Test Folder 1");
		expect(folder.position).toBe(0);
	});

	test("seedFolder accepts name and position", () => {
		const ws = seedWorkspace();
		const folder = seedFolder(ws.id, "Backlog", 10);
		expect(folder.name).toBe("Backlog");
		expect(folder.position).toBe(10);
	});

	test("seedTerminalSession creates active session", () => {
		const ws = seedWorkspace();
		const session = seedTerminalSession(ws.id);
		expect(session.id).toBe("test-terminal-1");
		expect(session.workspace_id).toBe(ws.id);
		expect(session.status).toBe("active");
		expect(session.cwd).toStartWith("/tmp/");
	});

	test("seedClaudeSession creates preparing session", () => {
		const ws = seedWorkspace();
		const terminal = seedTerminalSession(ws.id);
		const claude = seedClaudeSession(ws.id, terminal.id);
		expect(claude.id).toBe("test-claude-1");
		expect(claude.workspace_id).toBe(ws.id);
		expect(claude.status).toBe("preparing");
		expect(claude.terminal_session_id).toBe(terminal.id);
	});

	test("seedSetting upserts a setting", () => {
		const setting = seedSetting("theme", "dark");
		expect(setting.key).toBe("theme");
		expect(setting.value).toBe("dark");
	});

	test("seedLinearTaskLink creates link with defaults", () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id);
		const link = seedLinearTaskLink(task.id);
		expect(link.task_id).toBe(task.id);
		expect(link.linear_issue_id).toBe("issue-id-1");
		expect(link.linear_issue_identifier).toBe("LIN-1");
		expect(link.linear_team_id).toBe("team-1");
	});

	test("seedLinearTaskLink accepts overrides", () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id);
		const link = seedLinearTaskLink(task.id, {
			linearIssueId: "custom-issue",
			linearIssueIdentifier: "PRJ-42",
			linearTeamId: "team-xyz",
		});
		expect(link.linear_issue_id).toBe("custom-issue");
		expect(link.linear_issue_identifier).toBe("PRJ-42");
		expect(link.linear_team_id).toBe("team-xyz");
	});

	test("seedFullSessionStack creates linked workspace→task→terminal→claude", () => {
		const stack = seedFullSessionStack();
		expect(stack.workspace.id).toBeGreaterThan(0);
		expect(stack.task.workspace_id).toBe(stack.workspace.id);
		expect(stack.task.status).toBe("doing");
		expect(stack.task.session_id).toBe(stack.terminalSession.id);
		expect(stack.terminalSession.workspace_id).toBe(stack.workspace.id);
		expect(stack.claudeSession.workspace_id).toBe(stack.workspace.id);
		expect(stack.claudeSession.terminal_session_id).toBe(stack.terminalSession.id);
	});

	test("seedFullSessionStack accepts overrides", () => {
		const stack = seedFullSessionStack({
			workspaceName: "My Project",
			folderPath: "/home/user/project",
			taskTitle: "Build feature",
		});
		expect(stack.workspace.name).toBe("My Project");
		expect(stack.workspace.folder_path).toBe("/home/user/project");
		expect(stack.task.title).toBe("Build feature");
	});
});
