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
	seedFullSessionStack,
} from "../helpers/seed.js";
import { execFileCalls, resetExecFileCalls } from "../preload.js";
import {
	getTaskById,
	getTasksByWorkspaceId,
	getAllTasks,
	getAttachmentsByTaskId,
	createAttachment,
} from "@polygousse/database";

describe("tasks", () => {
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

	test("task:create creates a task with auto position and broadcasts", async () => {
		const ws = seedWorkspace();

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const task = await client.sendOk("task:create", {
			workspaceId: ws.id,
			title: "My Task",
		});

		expect(task.id).toBeGreaterThan(0);
		expect(task.workspace_id).toBe(ws.id);
		expect(task.title).toBe("My Task");
		expect(task.description).toBeNull();
		expect(task.status).toBe("todo");
		expect(task.session_id).toBeNull();
		expect(task.position).toBe(0);
		expect(task.folder_id).toBeNull();
		expect(task.completed_at).toBeNull();
		expect(task.created_at).toBeString();

		const broadcast = await client.waitForBroadcast("task:created");
		expect(broadcast.task.id).toBe(task.id);
		expect(broadcast.task.title).toBe("My Task");
	});

	test("task:create with description and folder", async () => {
		const ws = seedWorkspace();
		const folder = seedFolder(ws.id, "My Folder");

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const task = await client.sendOk("task:create", {
			workspaceId: ws.id,
			title: "Foldered Task",
			description: "A detailed description",
			folderId: folder.id,
		});

		expect(task.title).toBe("Foldered Task");
		expect(task.description).toBe("A detailed description");
		expect(task.folder_id).toBe(folder.id);
	});

	test("task:create auto-increments position", async () => {
		const ws = seedWorkspace();

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const task1 = await client.sendOk("task:create", {
			workspaceId: ws.id,
			title: "First",
		});
		const task2 = await client.sendOk("task:create", {
			workspaceId: ws.id,
			title: "Second",
		});
		const task3 = await client.sendOk("task:create", {
			workspaceId: ws.id,
			title: "Third",
		});

		expect(task1.position).toBe(0);
		expect(task2.position).toBe(1);
		expect(task3.position).toBe(2);
	});

	test("task:update updates title and description", async () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id, { title: "Old Title", description: "Old desc" });

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const updated = await client.sendOk("task:update", {
			id: task.id,
			title: "New Title",
			description: "New desc",
		});

		expect(updated.id).toBe(task.id);
		expect(updated.title).toBe("New Title");
		expect(updated.description).toBe("New desc");
		expect(updated.status).toBe("todo");

		const broadcast = await client.waitForBroadcast("task:updated");
		expect(broadcast.task.id).toBe(task.id);
		expect(broadcast.task.title).toBe("New Title");
	});

	test("task:update status to done sets completed_at", async () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id, { title: "Complete me" });

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const updated = await client.sendOk("task:update", {
			id: task.id,
			status: "done",
		});

		expect(updated.status).toBe("done");
		expect(updated.completed_at).toBeString();
		// Verify it's a valid ISO date
		const parsed = new Date(updated.completed_at!);
		expect(parsed.getTime()).not.toBeNaN();
	});

	test("task:update reverting from done clears completed_at", async () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id, { status: "done" });

		// Manually set completed_at in DB since seedTask doesn't
		const { updateTask } = await import("@polygousse/database");
		updateTask.get(task.title, task.description, "done", null, new Date().toISOString(), task.id);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const updated = await client.sendOk("task:update", {
			id: task.id,
			status: "todo",
		});

		expect(updated.status).toBe("todo");
		expect(updated.completed_at).toBeNull();
	});

	test("task:update nonexistent returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("task:update", {
			id: 99999,
			title: "Ghost",
		});

		expect(error).toBe("Task not found");
	});

	test("task:delete removes a task and broadcasts", async () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		await client.sendOk("task:delete", { id: task.id });

		// Verify deleted from DB
		const found = getTaskById.get(task.id);
		expect(found).toBeNull();

		const broadcast = await client.waitForBroadcast("task:deleted");
		expect(broadcast.id).toBe(task.id);
		expect(broadcast.workspace_id).toBe(ws.id);
	});

	test("task:delete nonexistent returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("task:delete", { id: 99999 });
		expect(error).toBe("Task not found");
	});

	test("task:delete cleans up attachments", async () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id);

		// Create an attachment record directly (file won't exist, but that's fine — handler catches errors)
		createAttachment.get(
			task.id,
			"test.txt",
			"/tmp/nonexistent/test.txt",
			"text/plain",
			100,
		);

		// Verify attachment exists
		const before = getAttachmentsByTaskId.all(task.id);
		expect(before).toBeArrayOfSize(1);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		await client.sendOk("task:delete", { id: task.id });

		// Attachment should be cascade-deleted along with the task
		const after = getAttachmentsByTaskId.all(task.id);
		expect(after).toBeArrayOfSize(0);
	});

	// ── Reorder ─────────────────────────────────────────────────────────

	test("task:reorder updates positions and broadcasts", async () => {
		const ws = seedWorkspace();
		const t1 = seedTask(ws.id, { title: "A", position: 0 });
		const t2 = seedTask(ws.id, { title: "B", position: 1 });
		const t3 = seedTask(ws.id, { title: "C", position: 2 });

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		// Reverse the order
		const tasks = await client.sendOk("task:reorder", {
			workspaceId: ws.id,
			taskIds: [t3.id, t2.id, t1.id],
		});

		// Response should contain all tasks in new order
		expect(tasks).toBeArrayOfSize(3);
		const positions = tasks.map((t: any) => ({ id: t.id, position: t.position }));
		expect(positions).toContainEqual({ id: t3.id, position: 0 });
		expect(positions).toContainEqual({ id: t2.id, position: 1 });
		expect(positions).toContainEqual({ id: t1.id, position: 2 });

		const broadcast = await client.waitForBroadcast("task:reordered");
		expect(broadcast.workspace_id).toBe(ws.id);
		expect(broadcast.tasks).toBeArrayOfSize(3);
	});

	// ── Move to folder ──────────────────────────────────────────────────

	test("task:move-to-folder moves task into a folder", async () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id);
		const folder = seedFolder(ws.id, "Target Folder");

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const moved = await client.sendOk("task:move-to-folder", {
			taskId: task.id,
			folderId: folder.id,
		});

		expect(moved.id).toBe(task.id);
		expect(moved.folder_id).toBe(folder.id);

		const broadcast = await client.waitForBroadcast("task:updated");
		expect(broadcast.task.folder_id).toBe(folder.id);
	});

	test("task:move-to-folder moves task out of folder (null)", async () => {
		const ws = seedWorkspace();
		const folder = seedFolder(ws.id, "Source Folder");
		const task = seedTask(ws.id, { folderId: folder.id });

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const moved = await client.sendOk("task:move-to-folder", {
			taskId: task.id,
			folderId: null,
		});

		expect(moved.folder_id).toBeNull();
	});

	test("task:move-to-folder nonexistent task returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("task:move-to-folder", {
			taskId: 99999,
			folderId: null,
		});

		expect(error).toBe("Task not found");
	});

	// ── task:start ──────────────────────────────────────────────────────

	test("task:start creates sessions and updates task to doing", async () => {
		const ws = seedWorkspace({ folderPath: "/tmp/test-project" });
		const task = seedTask(ws.id, { title: "Start me" });

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const started = await client.sendOk("task:start", {
			taskId: task.id,
		});

		expect(started.id).toBe(task.id);
		expect(started.status).toBe("doing");
		expect(started.session_id).toBeString();

		// Verify tmux session was created via execFile mock
		const tmuxCall = execFileCalls.find((c) => c.command === "tmux");
		expect(tmuxCall).toBeDefined();
		expect(tmuxCall!.args[0]).toBe("new-session");
	});

	test("task:start on doing task returns error", async () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id, { status: "doing" });

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("task:start", {
			taskId: task.id,
		});

		expect(error).toBe("Task is already in progress");
	});

	test("task:start on done task returns error", async () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id, { status: "done" });

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("task:start", {
			taskId: task.id,
		});

		expect(error).toBe("Task is already completed");
	});

	test("task:start on nonexistent task returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("task:start", {
			taskId: 99999,
		});

		expect(error).toBe("Task not found");
	});
});
