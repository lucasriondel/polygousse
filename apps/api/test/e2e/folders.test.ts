import {
	afterAll,
	afterEach,
	beforeAll,
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
	seedWorkspace,
} from "../helpers/seed.js";
import { getFolderById, getFoldersByWorkspaceId } from "@polygousse/database";

describe("folders", () => {
	let ctx: TestAppContext;
	let client: TestWsClient;

	setDefaultTimeout(10_000);

	beforeAll(async () => {
		ctx = await createTestApp();
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

	test("folder:create creates a folder with auto position and broadcasts", async () => {
		const ws = seedWorkspace();

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const folder = await client.sendOk("folder:create", {
			workspaceId: ws.id,
			name: "My Folder",
		});

		expect(folder.id).toBeGreaterThan(0);
		expect(folder.workspace_id).toBe(ws.id);
		expect(folder.name).toBe("My Folder");
		expect(folder.position).toBe(0);
		expect(folder.created_at).toBeString();

		const broadcast = await client.waitForBroadcast("folder:created");
		expect(broadcast.folder.id).toBe(folder.id);
		expect(broadcast.folder.name).toBe("My Folder");
	});

	test("folder:create auto-increments position", async () => {
		const ws = seedWorkspace();

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const f1 = await client.sendOk("folder:create", {
			workspaceId: ws.id,
			name: "First",
		});
		const f2 = await client.sendOk("folder:create", {
			workspaceId: ws.id,
			name: "Second",
		});
		const f3 = await client.sendOk("folder:create", {
			workspaceId: ws.id,
			name: "Third",
		});

		expect(f1.position).toBe(0);
		expect(f2.position).toBe(1);
		expect(f3.position).toBe(2);
	});

	test("folder:update updates name and broadcasts", async () => {
		const ws = seedWorkspace();
		const folder = seedFolder(ws.id, "Old Name");

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const updated = await client.sendOk("folder:update", {
			id: folder.id,
			name: "New Name",
		});

		expect(updated.id).toBe(folder.id);
		expect(updated.name).toBe("New Name");
		expect(updated.workspace_id).toBe(ws.id);

		const broadcast = await client.waitForBroadcast("folder:updated");
		expect(broadcast.folder.id).toBe(folder.id);
		expect(broadcast.folder.name).toBe("New Name");
	});

	test("folder:update nonexistent returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("folder:update", {
			id: 99999,
			name: "Ghost",
		});

		expect(error).toBe("Folder not found");
	});

	test("folder:delete removes folder and broadcasts", async () => {
		const ws = seedWorkspace();
		const folder = seedFolder(ws.id, "Delete Me");

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		await client.sendOk("folder:delete", { id: folder.id });

		// Verify deleted from DB
		const found = getFolderById.get(folder.id);
		expect(found).toBeNull();

		const broadcast = await client.waitForBroadcast("folder:deleted");
		expect(broadcast.id).toBe(folder.id);
		expect(broadcast.workspace_id).toBe(ws.id);
	});

	test("folder:delete nonexistent returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("folder:delete", { id: 99999 });
		expect(error).toBe("Folder not found");
	});

	// ── Reorder ─────────────────────────────────────────────────────────

	test("folder:reorder updates positions and broadcasts", async () => {
		const ws = seedWorkspace();
		const f1 = seedFolder(ws.id, "A", 0);
		const f2 = seedFolder(ws.id, "B", 1);
		const f3 = seedFolder(ws.id, "C", 2);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		// Reverse the order
		const folders = await client.sendOk("folder:reorder", {
			workspaceId: ws.id,
			folderIds: [f3.id, f2.id, f1.id],
		});

		// Response should contain all folders in new order
		expect(folders).toBeArrayOfSize(3);
		const positions = folders.map((f: any) => ({ id: f.id, position: f.position }));
		expect(positions).toContainEqual({ id: f3.id, position: 0 });
		expect(positions).toContainEqual({ id: f2.id, position: 1 });
		expect(positions).toContainEqual({ id: f1.id, position: 2 });

		const broadcast = await client.waitForBroadcast("folder:reordered");
		expect(broadcast.workspace_id).toBe(ws.id);
		expect(broadcast.folders).toBeArrayOfSize(3);
	});

	// ── Edge cases ──────────────────────────────────────────────────────

	test("folder:delete orphans tasks (folder_id becomes null)", async () => {
		const ws = seedWorkspace();
		const folder = seedFolder(ws.id, "With Tasks");

		// Seed a task in the folder
		const { seedTask } = await import("../helpers/seed.js");
		const task = seedTask(ws.id, { folderId: folder.id });

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		await client.sendOk("folder:delete", { id: folder.id });

		// Task should still exist but with null folder_id
		const { getTaskById } = await import("@polygousse/database");
		const orphaned = getTaskById.get(task.id);
		expect(orphaned).not.toBeNull();
		expect(orphaned!.folder_id).toBeNull();
	});
});
