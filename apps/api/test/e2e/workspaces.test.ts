import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import {
	type TestAppContext,
	cleanupDb,
	closeTestApp,
	createTestApp,
} from "../helpers/setup.js";
import { TestWsClient } from "../helpers/ws-client.js";
import {
	resetSeedCounters,
	seedFolder,
	seedTask,
	seedWorkspace,
} from "../helpers/seed.js";
import { execFileCalls, resetExecFileCalls } from "../preload.js";
import {
	getAllTasks,
	getAllFolders,
	getWorkspaceById,
} from "@polygousse/database";

describe("workspaces", () => {
	let ctx: TestAppContext;
	let client: TestWsClient;

	setDefaultTimeout(10_000);

	beforeAll(async () => {
		ctx = await createTestApp();
	});

	beforeEach(() => {
		resetExecFileCalls();
	});

	afterEach(() => {
		client?.close();
		cleanupDb();
		resetSeedCounters();
	});

	afterAll(async () => {
		if (ctx) await closeTestApp(ctx);
	});

	// ── CRUD ────────────────────────────────────────────────────────────

	test("workspace:create creates a workspace and broadcasts", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const ws = await client.sendOk("workspace:create", {
			name: "My Project",
			folder_path: "/home/user/my-project",
		});

		expect(ws.id).toBeGreaterThan(0);
		expect(ws.name).toBe("My Project");
		expect(ws.folder_path).toBe("/home/user/my-project");
		expect(ws.linear_team_id).toBeNull();
		expect(ws.linear_project_ids).toBeNull();
		expect(ws.created_at).toBeString();

		const broadcast = await client.waitForBroadcast("workspace:created");
		expect(broadcast.workspace.id).toBe(ws.id);
		expect(broadcast.workspace.name).toBe("My Project");
	});

	test("workspace:create with Linear fields", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const ws = await client.sendOk("workspace:create", {
			name: "Linear Project",
			folder_path: "/home/user/linear-project",
			linear_team_id: "team-abc",
			linear_project_ids: ["proj-1", "proj-2"],
		});

		expect(ws.linear_team_id).toBe("team-abc");
		// linear_project_ids is stored as JSON string
		expect(ws.linear_project_ids).toBe(JSON.stringify(["proj-1", "proj-2"]));
	});

	test("workspace:update updates a workspace and broadcasts", async () => {
		const existing = seedWorkspace({ name: "Old Name", folderPath: "/tmp/old" });

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const updated = await client.sendOk("workspace:update", {
			id: existing.id,
			name: "New Name",
			folder_path: "/tmp/new",
		});

		expect(updated.id).toBe(existing.id);
		expect(updated.name).toBe("New Name");
		expect(updated.folder_path).toBe("/tmp/new");

		const broadcast = await client.waitForBroadcast("workspace:updated");
		expect(broadcast.workspace.id).toBe(existing.id);
		expect(broadcast.workspace.name).toBe("New Name");
	});

	test("workspace:update nonexistent returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("workspace:update", {
			id: 99999,
			name: "Ghost",
			folder_path: "/tmp/ghost",
		});

		expect(error).toBe("Workspace not found");
	});

	test("workspace:delete removes a workspace and broadcasts", async () => {
		const ws = seedWorkspace();

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		await client.sendOk("workspace:delete", { id: ws.id });

		// Verify deleted from DB
		const found = getWorkspaceById.get(ws.id);
		expect(found).toBeNull();

		const broadcast = await client.waitForBroadcast("workspace:deleted");
		expect(broadcast.id).toBe(ws.id);
	});

	test("workspace:delete nonexistent returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("workspace:delete", { id: 99999 });
		expect(error).toBe("Workspace not found");
	});

	// ── Cascade ─────────────────────────────────────────────────────────

	test("workspace:delete cascades to tasks and folders", async () => {
		const ws = seedWorkspace();
		seedTask(ws.id, { title: "Task A" });
		seedTask(ws.id, { title: "Task B" });
		seedFolder(ws.id, "Folder 1");

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		await client.sendOk("workspace:delete", { id: ws.id });

		// Tasks and folders should be cascade-deleted
		const tasks = getAllTasks.all();
		expect(tasks).toBeArrayOfSize(0);

		const folders = getAllFolders.all();
		expect(folders).toBeArrayOfSize(0);
	});

	// ── worktree:create ─────────────────────────────────────────────────

	test("worktree:create sanitizes branch name and calls git", async () => {
		const ws = seedWorkspace({ folderPath: "/home/user/my-project" });

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const result = await client.sendOk("worktree:create", {
			workspaceId: ws.id,
			branchName: "Feature/My Branch!!",
		});

		// Branch name should be sanitized: lowercase, alphanum+hyphens, no leading/trailing dashes
		expect(result.branch).toBe("feature-my-branch");
		expect(result.path).toBe("/home/user/my-project-feature-my-branch");

		// Verify git command was called
		expect(execFileCalls).toBeArrayOfSize(1);
		expect(execFileCalls[0]!.command).toBe("git");
		expect(execFileCalls[0]!.args).toEqual([
			"worktree",
			"add",
			"/home/user/my-project-feature-my-branch",
			"-b",
			"feature-my-branch",
		]);
		expect(execFileCalls[0]!.options).toEqual({ cwd: "/home/user/my-project" });
	});

	test("worktree:create with nonexistent workspace returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("worktree:create", {
			workspaceId: 99999,
			branchName: "test",
		});

		expect(error).toBe("Workspace not found");
	});

	test("worktree:create with empty branch name after sanitization returns error", async () => {
		const ws = seedWorkspace();

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("worktree:create", {
			workspaceId: ws.id,
			branchName: "!!!",
		});

		expect(error).toBe("Branch name must contain at least one alphanumeric character");
	});
});
