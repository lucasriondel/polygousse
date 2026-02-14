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
	seedFullSessionStack,
	seedLinearTaskLink,
	seedSetting,
	seedTask,
	seedWorkspace,
} from "../helpers/seed.js";
import { createAttachment, createRalphSession } from "@polygousse/database";

describe("hydrate", () => {
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

	// ── Empty database ──────────────────────────────────────────────

	test("empty database returns all arrays empty", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const data = await client.sendOk("hydrate", undefined as any);

		expect(data.workspaces).toBeArrayOfSize(0);
		expect(data.tasks).toBeArrayOfSize(0);
		expect(data.folders).toBeArrayOfSize(0);
		expect(data.attachments).toBeArrayOfSize(0);
		expect(data.claudeSessions).toBeArrayOfSize(0);
		expect(data.ralphSessions).toBeArrayOfSize(0);
		expect(data.settings).toBeArrayOfSize(0);
		expect(data.linearTaskLinks).toBeArrayOfSize(0);
	});

	// ── Seeded database ─────────────────────────────────────────────

	test("seeded database returns all entities", async () => {
		// Seed a variety of data
		const stack = seedFullSessionStack();
		const folder = seedFolder(stack.workspace.id, "Backlog");
		const extraTask = seedTask(stack.workspace.id, {
			title: "Extra Task",
			folderId: folder.id,
		});
		const attachment = createAttachment.get(
			stack.task.id,
			"screenshot.png",
			"/tmp/screenshot.png",
			"image/png",
			1024,
		)!;
		const setting = seedSetting("theme", "dark");
		const link = seedLinearTaskLink(stack.task.id, {
			linearIssueIdentifier: "LIN-42",
		});
		const ralph = createRalphSession.get(
			"ralph-1",
			stack.terminalSession.id,
			stack.task.id,
			5,
		)!;

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const data = await client.sendOk("hydrate", undefined as any);

		// Workspaces
		expect(data.workspaces).toBeArrayOfSize(1);
		expect(data.workspaces[0]!.id).toBe(stack.workspace.id);
		expect(data.workspaces[0]!.name).toBe(stack.workspace.name);

		// Tasks (2: the "doing" task from the stack + the extra task)
		expect(data.tasks).toBeArrayOfSize(2);
		const taskIds = data.tasks.map((t: any) => t.id);
		expect(taskIds).toContain(stack.task.id);
		expect(taskIds).toContain(extraTask.id);

		// Folders
		expect(data.folders).toBeArrayOfSize(1);
		expect(data.folders[0]!.name).toBe("Backlog");

		// Attachments
		expect(data.attachments).toBeArrayOfSize(1);
		expect(data.attachments[0]!.filename).toBe("screenshot.png");
		expect(data.attachments[0]!.size_bytes).toBe(1024);

		// Claude sessions (only non-completed are returned)
		expect(data.claudeSessions).toBeArrayOfSize(1);
		expect(data.claudeSessions[0]!.id).toBe(stack.claudeSession.id);
		expect(data.claudeSessions[0]!.status).toBe("preparing");

		// Ralph sessions (only running are returned)
		expect(data.ralphSessions).toBeArrayOfSize(1);
		expect(data.ralphSessions[0]!.id).toBe("ralph-1");
		expect(data.ralphSessions[0]!.task_id).toBe(stack.task.id);

		// Settings
		expect(data.settings).toBeArrayOfSize(1);
		expect(data.settings[0]!.key).toBe("theme");
		expect(data.settings[0]!.value).toBe("dark");

		// Linear task links
		expect(data.linearTaskLinks).toBeArrayOfSize(1);
		expect(data.linearTaskLinks[0]!.linear_issue_identifier).toBe("LIN-42");
		expect(data.linearTaskLinks[0]!.task_id).toBe(stack.task.id);
	});
});
