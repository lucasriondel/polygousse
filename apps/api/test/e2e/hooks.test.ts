import { describe, test, expect, beforeAll, afterAll, afterEach, setDefaultTimeout } from "bun:test";
import {
	createTestApp,
	closeTestApp,
	cleanupDb,
	type TestAppContext,
} from "../helpers/setup.js";
import { TestWsClient } from "../helpers/ws-client.js";
import {
	seedWorkspace,
	seedTask,
	seedTerminalSession,
	seedClaudeSession,
	seedFullSessionStack,
	resetSeedCounters,
} from "../helpers/seed.js";
import { MockClaudeCli } from "@polygousse/fake-claude-cli";
import { getClaudeSessionById, getHookEventById, insertHookEvent } from "@polygousse/database";

describe("hooks", () => {
	let ctx: TestAppContext;
	let client: TestWsClient;
	let cli: MockClaudeCli;

	setDefaultTimeout(10_000);

	beforeAll(async () => {
		ctx = await createTestApp();
		cli = new MockClaudeCli(ctx.baseUrl);
	});

	afterEach(() => {
		client?.close();
		cleanupDb();
		resetSeedCounters();
	});

	afterAll(async () => {
		if (ctx) await closeTestApp(ctx);
	});

	// ── getHookEventById ──────────────────────────────────────────────

	test("getHookEventById returns a hook event by id", async () => {
		const hookEvent = insertHookEvent.get(
			"test-session-by-id",
			"PermissionRequest",
			"/tmp/test-cwd",
			null,
			null,
			JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { plan: "test" } }),
		);

		const fetched = getHookEventById.get(hookEvent!.id);
		expect(fetched).toBeDefined();
		expect(fetched!.id).toBe(hookEvent!.id);
		expect(fetched!.session_id).toBe("test-session-by-id");
		expect(fetched!.hook_event_name).toBe("PermissionRequest");
		expect(fetched!.cwd).toBe("/tmp/test-cwd");

		const rawBody = JSON.parse(fetched!.raw_body);
		expect(rawBody.tool_name).toBe("ExitPlanMode");
		expect(rawBody.tool_input.plan).toBe("test");
	});

	test("getHookEventById returns null for nonexistent id", async () => {
		const fetched = getHookEventById.get(999999);
		expect(fetched).toBeNull();
	});

	// ── hook:events-recent ─────────────────────────────────────────────

	test("hook:events-recent returns stored events with default limit", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		// Create a workspace + task + session stack so events are processed
		const stack = seedFullSessionStack();

		// Send a few hook events via the mock CLI
		await cli.sendSessionStart("test-session-1", stack.workspace.folder_path);
		await cli.sendUserPromptSubmit("test-session-1", stack.workspace.folder_path);
		await cli.sendStop("test-session-1", stack.workspace.folder_path);

		const events = await client.sendOk("hook:events-recent", {});

		expect(events.length).toBe(3);
		// Events are returned in descending order (most recent first)
		expect(events[0]!.hook_event_name).toBe("Stop");
		expect(events[1]!.hook_event_name).toBe("UserPromptSubmit");
		expect(events[2]!.hook_event_name).toBe("SessionStart");
		// Verify event structure
		expect(events[0]!.session_id).toBe("test-session-1");
		expect(events[0]!.cwd).toBe(stack.workspace.folder_path);
		expect(events[0]!.raw_body).toBeTruthy();
	});

	test("hook:events-recent respects limit parameter", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		await cli.sendSessionStart("test-session-2", stack.workspace.folder_path);
		await cli.sendUserPromptSubmit("test-session-2", stack.workspace.folder_path);
		await cli.sendStop("test-session-2", stack.workspace.folder_path);

		const events = await client.sendOk("hook:events-recent", { limit: 2 });

		expect(events.length).toBe(2);
	});

	// ── hook:events-clear ──────────────────────────────────────────────

	test("hook:events-clear removes all stored events", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		// Insert some events
		await cli.sendSessionStart("test-session-3", stack.workspace.folder_path);
		await cli.sendStop("test-session-3", stack.workspace.folder_path);

		// Verify events exist
		const before = await client.sendOk("hook:events-recent", {});
		expect(before.length).toBe(2);

		// Clear all events
		await client.sendOk("hook:events-clear", {});

		// Verify events are gone
		const after = await client.sendOk("hook:events-recent", {});
		expect(after.length).toBe(0);
	});

	// ── hook:sessions ──────────────────────────────────────────────────

	test("hook:sessions returns active (non-completed) sessions", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		// Send SessionStart to create an active session via hook processing
		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);

		const sessions = await client.sendOk("hook:sessions", {});

		// Should include the session that was started (now "ongoing")
		const found = sessions.find((s: any) => s.id === stack.claudeSession.id);
		expect(found).toBeDefined();
		expect(found!.status).toBe("ongoing");
	});

	test("hook:sessions excludes completed sessions", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		// Run full lifecycle so the session ends up completed
		await cli.simulateSessionLifecycle(stack.claudeSession.id, stack.workspace.folder_path);

		const sessions = await client.sendOk("hook:sessions", {});

		const found = sessions.find((s: any) => s.id === stack.claudeSession.id);
		expect(found).toBeUndefined();
	});

	// ── hook:sessions-waiting ──────────────────────────────────────────

	test("hook:sessions-waiting returns waiting sessions with task info", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		// Start the session, then send permission prompt to put it in waiting_input
		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
		await cli.sendPermissionPrompt(stack.claudeSession.id, stack.workspace.folder_path);

		const waiting = await client.sendOk("hook:sessions-waiting", {});

		const found = waiting.find((s: any) => s.id === stack.claudeSession.id);
		expect(found).toBeDefined();
		expect(found!.status).toBe("waiting_input");
		// Should include linked task info
		expect(found!.task_id).toBe(stack.task.id);
		expect(found!.task_title).toBe(stack.task.title);
	});

	test("hook:sessions-waiting returns idle sessions", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		// Start then stop → idle
		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
		await cli.sendStop(stack.claudeSession.id, stack.workspace.folder_path);

		const waiting = await client.sendOk("hook:sessions-waiting", {});

		const found = waiting.find((s: any) => s.id === stack.claudeSession.id);
		expect(found).toBeDefined();
		expect(found!.status).toBe("idle");
	});

	// ── hook:session-get ───────────────────────────────────────────────

	test("hook:session-get returns a session by id", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		// Create session via hook event
		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);

		const session = await client.sendOk("hook:session-get", {
			id: stack.claudeSession.id,
		});

		expect(session.id).toBe(stack.claudeSession.id);
		expect(session.status).toBe("ongoing");
		expect(session.cwd).toBe(stack.workspace.folder_path);
	});

	test("hook:session-get with nonexistent id returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("hook:session-get", {
			id: "nonexistent-session-id",
		});

		expect(error).toBe("Session not found");
	});

	// ── hook:session-dismiss ───────────────────────────────────────────

	test("hook:session-dismiss marks session as completed and broadcasts", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		// Create an active session and drain its broadcast before testing dismiss
		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
		await client.waitForBroadcast("claude-session:updated");
		client.clearBroadcasts();

		const session = await client.sendOk("hook:session-dismiss", {
			id: stack.claudeSession.id,
		});

		expect(session.id).toBe(stack.claudeSession.id);
		expect(session.status).toBe("completed");
		expect(session.ended_at).toBeTruthy();

		// Verify broadcast
		const broadcast = await client.waitForBroadcast("claude-session:updated");
		expect(broadcast.session.id).toBe(stack.claudeSession.id);
		expect(broadcast.session.status).toBe("completed");

		// Verify in DB
		const dbSession = getClaudeSessionById.get(stack.claudeSession.id);
		expect(dbSession!.status).toBe("completed");
		expect(dbSession!.last_event).toBe("dismissed");
	});

	test("hook:session-dismiss with nonexistent id returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("hook:session-dismiss", {
			id: "nonexistent-session-id",
		});

		expect(error).toBe("Session not found");
	});
});
