import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import {
	createTestApp,
	closeTestApp,
	cleanupDb,
	type TestAppContext,
} from "./setup.js";
import {
	seedFullSessionStack,
	resetSeedCounters,
} from "./seed.js";
import { MockClaudeCli } from "@polygousse/fake-claude-cli";
import { getRecentHookEvents } from "@polygousse/database";

let ctx: TestAppContext;
let cli: MockClaudeCli;

beforeEach(async () => {
	if (!ctx) {
		ctx = await createTestApp();
	}
	cleanupDb();
	resetSeedCounters();
	cli = new MockClaudeCli(ctx.baseUrl);
});

afterAll(async () => {
	if (ctx) await closeTestApp(ctx);
});

describe("MockClaudeCli", () => {
	test("sendEvent posts to /api/hooks/event and stores the event", async () => {
		const stack = seedFullSessionStack();

		const result = await cli.sendEvent({
			session_id: stack.claudeSession.id,
			hook_event_name: "SessionStart",
			cwd: stack.workspace.folder_path,
		});

		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("id", stack.claudeSession.id);
		expect(result.body).toHaveProperty("status", "ongoing");

		// Verify event was stored in DB
		const events = getRecentHookEvents.all(10);
		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(events[0]!.session_id).toBe(stack.claudeSession.id);
		expect(events[0]!.hook_event_name).toBe("SessionStart");
	});

	test("sendEvent returns 204 for unknown session", async () => {
		const result = await cli.sendEvent({
			session_id: "unknown-session-id",
			hook_event_name: "SessionStart",
			cwd: "/tmp/nonexistent",
		});

		expect(result.status).toBe(204);
		expect(result.body).toBeNull();
	});

	test("simulateSessionLifecycle sends all 4 events in order", async () => {
		const stack = seedFullSessionStack();

		await cli.simulateSessionLifecycle(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);

		// Check stored events in DB (most recent first)
		const events = getRecentHookEvents.all(10);
		const sessionEvents = events.filter(
			(e) => e.session_id === stack.claudeSession.id,
		);
		expect(sessionEvents.length).toBe(4);

		// Events are returned most-recent-first, so reverse for chronological
		const names = sessionEvents.reverse().map((e) => e.hook_event_name);
		expect(names).toEqual([
			"SessionStart",
			"UserPromptSubmit",
			"Stop",
			"SessionEnd",
		]);
	});

	test("sendPermissionPrompt sends Notification with permission_prompt", async () => {
		const stack = seedFullSessionStack();

		// Start session first
		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);

		const result = await cli.sendPermissionPrompt(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);

		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "waiting_input");
	});

	test("sendRalphDone sends Stop with ralph:done marker", async () => {
		const stack = seedFullSessionStack();
		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);

		const result = await cli.sendRalphDone(
			stack.claudeSession.id,
			stack.workspace.folder_path,
			"ralph-session-1",
		);

		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "idle");

		// Verify the raw event body contains the ralph marker
		const events = getRecentHookEvents.all(10);
		const stopEvent = events.find(
			(e) =>
				e.session_id === stack.claudeSession.id &&
				e.hook_event_name === "Stop",
		);
		expect(stopEvent).toBeDefined();
		const rawBody = JSON.parse(stopEvent!.raw_body);
		expect(rawBody.last_assistant_message).toContain("<ralph:done/>");
		expect(rawBody.ralph_session_id).toBe("ralph-session-1");
	});

	test("sendLimitHit sends Stop with limit hit message", async () => {
		const stack = seedFullSessionStack();
		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);

		const result = await cli.sendLimitHit(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);

		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "limit_hit");
	});

	test("individual event helpers work correctly", async () => {
		const stack = seedFullSessionStack();

		// SessionStart → ongoing
		let result = await cli.sendSessionStart(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);
		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "ongoing");

		// UserPromptSubmit → ongoing
		result = await cli.sendUserPromptSubmit(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);
		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "ongoing");

		// Stop → idle
		result = await cli.sendStop(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);
		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "idle");

		// SessionEnd → completed
		result = await cli.sendSessionEnd(
			stack.claudeSession.id,
			stack.workspace.folder_path,
		);
		expect(result.status).toBe(200);
		expect(result.body).toHaveProperty("status", "completed");
	});
});
