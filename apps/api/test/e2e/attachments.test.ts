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
	seedTask,
	seedWorkspace,
} from "../helpers/seed.js";
import { getAttachmentById, getAttachmentsByTaskId } from "@polygousse/database";

describe("attachments", () => {
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

	// ── Upload ──────────────────────────────────────────────────────────

	test("attachment:upload creates record and broadcasts", async () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const data = Buffer.from("hello world").toString("base64");

		const attachment = await client.sendOk("attachment:upload", {
			taskId: task.id,
			filename: "hello.txt",
			mime_type: "text/plain",
			data,
		});

		expect(attachment.id).toBeGreaterThan(0);
		expect(attachment.task_id).toBe(task.id);
		expect(attachment.filename).toBe("hello.txt");
		expect(attachment.mime_type).toBe("text/plain");
		expect(attachment.size_bytes).toBe(11); // "hello world".length
		expect(attachment.stored_path).toBeString();
		expect(attachment.created_at).toBeString();

		const broadcast = await client.waitForBroadcast("task:attachment:created");
		expect(broadcast.attachment.id).toBe(attachment.id);
		expect(broadcast.attachment.filename).toBe("hello.txt");
	});

	test("attachment:upload stores correct size for binary data", async () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		// 256 bytes of binary data
		const buf = Buffer.alloc(256);
		for (let i = 0; i < 256; i++) buf[i] = i;
		const data = buf.toString("base64");

		const attachment = await client.sendOk("attachment:upload", {
			taskId: task.id,
			filename: "binary.bin",
			mime_type: "application/octet-stream",
			data,
		});

		expect(attachment.size_bytes).toBe(256);
	});

	test("attachment:upload persists in database", async () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const data = Buffer.from("persisted").toString("base64");

		const attachment = await client.sendOk("attachment:upload", {
			taskId: task.id,
			filename: "persist.txt",
			mime_type: "text/plain",
			data,
		});

		const found = getAttachmentById.get(attachment.id);
		expect(found).not.toBeNull();
		expect(found!.filename).toBe("persist.txt");
		expect(found!.task_id).toBe(task.id);
	});

	test("attachment:upload to nonexistent task returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const data = Buffer.from("orphan").toString("base64");

		const error = await client.sendError("attachment:upload", {
			taskId: 99999,
			filename: "orphan.txt",
			mime_type: "text/plain",
			data,
		});

		expect(error).toBe("Task not found");
	});

	// ── Delete ──────────────────────────────────────────────────────────

	test("attachment:delete removes record and broadcasts", async () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const data = Buffer.from("delete me").toString("base64");

		const attachment = await client.sendOk("attachment:upload", {
			taskId: task.id,
			filename: "delete-me.txt",
			mime_type: "text/plain",
			data,
		});

		// Clear upload broadcast
		client.clearBroadcasts();

		await client.sendOk("attachment:delete", { id: attachment.id });

		// Verify deleted from DB
		const found = getAttachmentById.get(attachment.id);
		expect(found).toBeNull();

		const broadcast = await client.waitForBroadcast("task:attachment:deleted");
		expect(broadcast.id).toBe(attachment.id);
		expect(broadcast.task_id).toBe(task.id);
	});

	test("attachment:delete nonexistent returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("attachment:delete", { id: 99999 });
		expect(error).toBe("Attachment not found");
	});

	// ── Edge cases ──────────────────────────────────────────────────────

	test("multiple attachments on same task", async () => {
		const ws = seedWorkspace();
		const task = seedTask(ws.id);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const a1 = await client.sendOk("attachment:upload", {
			taskId: task.id,
			filename: "first.txt",
			mime_type: "text/plain",
			data: Buffer.from("first").toString("base64"),
		});

		const a2 = await client.sendOk("attachment:upload", {
			taskId: task.id,
			filename: "second.txt",
			mime_type: "text/plain",
			data: Buffer.from("second").toString("base64"),
		});

		const attachments = getAttachmentsByTaskId.all(task.id);
		expect(attachments).toBeArrayOfSize(2);
		expect(attachments.map((a) => a.filename)).toContain("first.txt");
		expect(attachments.map((a) => a.filename)).toContain("second.txt");

		// Deleting one leaves the other
		await client.sendOk("attachment:delete", { id: a1.id });
		const remaining = getAttachmentsByTaskId.all(task.id);
		expect(remaining).toBeArrayOfSize(1);
		expect(remaining[0]!.id).toBe(a2.id);
	});
});
