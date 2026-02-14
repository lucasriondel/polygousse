import { describe, test, expect, beforeAll, afterAll, afterEach, setDefaultTimeout } from "bun:test";
import {
	createTestApp,
	closeTestApp,
	cleanupDb,
	type TestAppContext,
} from "../helpers/setup.js";
import { TestWsClient } from "../helpers/ws-client.js";
import {
	seedFullSessionStack,
	resetSeedCounters,
} from "../helpers/seed.js";
import { MockClaudeCli } from "@polygousse/fake-claude-cli";
import { getClaudeSessionById, getRecentHookEvents } from "@polygousse/database";

describe("hook-processing", () => {
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

	// ── Session lifecycle state transitions ────────────────────────────

	test("SessionStart transitions session to ongoing", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		const result = await cli.sendSessionStart(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);

		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "ongoing");
		expect(result.body).toHaveProperty("last_event", "SessionStart");

		// Verify in DB
		const dbSession = getClaudeSessionById.get(stack.claudeSession.id);
		expect(dbSession!.status).toBe("ongoing");
	});

	test("Stop transitions session to idle", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
		const result = await cli.sendStop(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);

		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "idle");
		expect(result.body).toHaveProperty("last_event", "Stop");

		const dbSession = getClaudeSessionById.get(stack.claudeSession.id);
		expect(dbSession!.status).toBe("idle");
	});

	test("SessionEnd transitions session to completed", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
		await cli.sendStop(stack.claudeSession.id, stack.workspace.folder_path);
		const result = await cli.sendSessionEnd(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);

		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "completed");

		const dbSession = getClaudeSessionById.get(stack.claudeSession.id);
		expect(dbSession!.status).toBe("completed");
		expect(dbSession!.ended_at).toBeTruthy();
	});

	test("full lifecycle: SessionStart → ongoing, Stop → idle, SessionEnd → completed", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		// SessionStart → ongoing
		let result = await cli.sendSessionStart(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);
		expect(result.body).toHaveProperty("status", "ongoing");

		// UserPromptSubmit → still ongoing
		result = await cli.sendUserPromptSubmit(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);
		expect(result.body).toHaveProperty("status", "ongoing");

		// Stop → idle
		result = await cli.sendStop(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);
		expect(result.body).toHaveProperty("status", "idle");

		// SessionEnd → completed
		result = await cli.sendSessionEnd(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);
		expect(result.body).toHaveProperty("status", "completed");
	});

	// ── Notification handling ──────────────────────────────────────────

	test("Notification with permission_prompt transitions to waiting_input", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
		const result = await cli.sendPermissionPrompt(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);

		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "waiting_input");

		const dbSession = getClaudeSessionById.get(stack.claudeSession.id);
		expect(dbSession!.status).toBe("waiting_input");
	});

	test("Notification with idle_prompt transitions to waiting_input", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
		const result = await cli.sendEvent({
			session_id: stack.claudeSession.id,
			hook_event_name: "Notification",
			cwd: stack.workspace.folder_path,
			notification_type: "idle_prompt",
		});

		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "waiting_input");
	});

	// ── Limit hit ─────────────────────────────────────────────────────

	test("Stop with limit hit message transitions to limit_hit", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
		const result = await cli.sendLimitHit(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);

		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "limit_hit");

		const dbSession = getClaudeSessionById.get(stack.claudeSession.id);
		expect(dbSession!.status).toBe("limit_hit");
	});

	// ── Hook events storage ───────────────────────────────────────────

	test("hook events are stored and retrievable", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
		await cli.sendUserPromptSubmit(stack.claudeSession.id, stack.workspace.folder_path);
		await cli.sendStop(stack.claudeSession.id, stack.workspace.folder_path);

		const events = getRecentHookEvents.all(50);
		const sessionEvents = events
			.filter((e) => e.session_id === stack.claudeSession.id)
			.reverse(); // chronological order

		expect(sessionEvents.length).toBe(3);
		expect(sessionEvents[0]!.hook_event_name).toBe("SessionStart");
		expect(sessionEvents[1]!.hook_event_name).toBe("UserPromptSubmit");
		expect(sessionEvents[2]!.hook_event_name).toBe("Stop");

		// Verify raw_body is stored as JSON
		const rawBody = JSON.parse(sessionEvents[0]!.raw_body);
		expect(rawBody.session_id).toBe(stack.claudeSession.id);
		expect(rawBody.hook_event_name).toBe("SessionStart");
		expect(rawBody.cwd).toBe(stack.workspace.folder_path);
	});

	// ── Broadcasts ────────────────────────────────────────────────────

	test("broadcasts claude-session:updated on each state change", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		// SessionStart
		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
		const startBroadcast = await client.waitForBroadcast("claude-session:updated");
		expect(startBroadcast.session.id).toBe(stack.claudeSession.id);
		expect(startBroadcast.session.status).toBe("ongoing");
		client.clearBroadcasts();

		// Stop
		await cli.sendStop(stack.claudeSession.id, stack.workspace.folder_path);
		const stopBroadcast = await client.waitForBroadcast("claude-session:updated");
		expect(stopBroadcast.session.status).toBe("idle");
		client.clearBroadcasts();

		// SessionEnd
		await cli.sendSessionEnd(stack.claudeSession.id, stack.workspace.folder_path);
		const endBroadcast = await client.waitForBroadcast("claude-session:updated");
		expect(endBroadcast.session.status).toBe("completed");
	});

	test("broadcasts hook-event:raw for every event", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
		const rawBroadcast = await client.waitForBroadcast("hook-event:raw");
		expect(rawBroadcast.event.session_id).toBe(stack.claudeSession.id);
		expect(rawBroadcast.event.hook_event_name).toBe("SessionStart");
	});

	// ── Unknown session → 204 ─────────────────────────────────────────

	test("event for unknown session returns 204 and no broadcast", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const result = await cli.sendSessionStart(
			"completely-unknown-session",
			"/tmp/nonexistent",
		);

		expect(result.status).toBe(204);
		expect(result.body).toBeNull();

		// Event should still be stored in DB
		const events = getRecentHookEvents.all(10);
		const found = events.find((e) => e.session_id === "completely-unknown-session");
		expect(found).toBeDefined();
		expect(found!.hook_event_name).toBe("SessionStart");

		// No session-related broadcast should have been sent
		const sessionBroadcasts = client.getBroadcasts("claude-session:updated");
		expect(sessionBroadcasts.length).toBe(0);
	});

	// ── Non-status-changing events ────────────────────────────────────

	test("events that dont change status return null (no session update)", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const stack = seedFullSessionStack();

		// Start the session first
		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
		client.clearBroadcasts();

		// PreToolUse should not change status
		const result = await cli.sendEvent({
			session_id: stack.claudeSession.id,
			hook_event_name: "PreToolUse",
			cwd: stack.workspace.folder_path,
			tool_name: "Read",
		});

		// Returns 204 because resolveStatus returns null for PreToolUse
		expect(result.status).toBe(204);

		// Session should still be ongoing in DB
		const dbSession = getClaudeSessionById.get(stack.claudeSession.id);
		expect(dbSession!.status).toBe("ongoing");
	});
});
