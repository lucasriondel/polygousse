import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach, setDefaultTimeout } from "bun:test";
import {
	createTestApp,
	closeTestApp,
	cleanupDb,
	type TestAppContext,
} from "../helpers/setup.js";
import { TestWsClient } from "../helpers/ws-client.js";
import {
	seedFullSessionStack,
	seedTerminalSession,
	seedWorkspace,
	seedClaudeSession,
	resetSeedCounters,
} from "../helpers/seed.js";
import { execFileCalls, resetExecFileCalls } from "../preload.js";
import { MockClaudeCli } from "@polygousse/fake-claude-cli";
import {
	getTaskById,
	getTerminalSessionById,
	completeTerminalSession,
	createRalphSession,
	insertHookEvent,
	getHookEventById,
} from "@polygousse/database";

describe("sessions", () => {
	let ctx: TestAppContext;
	let client: TestWsClient;
	let cli: MockClaudeCli;

	setDefaultTimeout(10_000);

	beforeAll(async () => {
		ctx = await createTestApp();
		cli = new MockClaudeCli(ctx.baseUrl);
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

	// ── session:debug ────────────────────────────────────────────────

	test("session:debug returns active and completed terminal sessions", async () => {
		const stack = seedFullSessionStack();

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const result = await client.sendOk("session:debug", {});

		expect(result.active).toBeArray();
		expect(result.completed).toBeArray();

		// The seeded terminal session should be active
		const found = result.active.find((s: any) => s.id === stack.terminalSession.id);
		expect(found).toBeDefined();
		expect(found!.taskTitle).toBe(stack.task.title);
		expect(found!.agentSessions).toBeArray();
		expect(found!.agentSessions.length).toBeGreaterThanOrEqual(1);
		expect(found!.ralphSession).toBeNull();
		expect(found!.orchestrator).toBeNull();
	});

	test("session:debug returns completed sessions after teardown", async () => {
		const stack = seedFullSessionStack();

		// Manually complete the terminal session
		completeTerminalSession.get(stack.terminalSession.id);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const result = await client.sendOk("session:debug", {});

		const activeFound = result.active.find((s: any) => s.id === stack.terminalSession.id);
		expect(activeFound).toBeUndefined();

		const completedFound = result.completed.find((s: any) => s.id === stack.terminalSession.id);
		expect(completedFound).toBeDefined();
		expect(completedFound!.status).toBe("completed");
	});

	test("session:debug empty DB returns empty arrays", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const result = await client.sendOk("session:debug", {});

		expect(result.active).toEqual([]);
		expect(result.completed).toEqual([]);
	});

	// ── session:debug-detail ─────────────────────────────────────────

	test("session:debug-detail returns enriched session with events", async () => {
		const stack = seedFullSessionStack();

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const detail = await client.sendOk("session:debug-detail", {
			terminalSessionId: stack.terminalSession.id,
		});

		expect(detail.id).toBe(stack.terminalSession.id);
		expect(detail.taskTitle).toBe(stack.task.title);
		expect(detail.agentSessions).toBeArray();
		expect(detail.events).toBeArray();
		expect(detail.ralphSession).toBeNull();
	});

	test("session:debug-detail with unknown id returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("session:debug-detail", {
			terminalSessionId: "nonexistent-terminal",
		});

		expect(error).toBe("Terminal session not found");
	});

	// ── session:ralph-running ────────────────────────────────────────

	test("session:ralph-running returns running ralph sessions", async () => {
		const stack = seedFullSessionStack();
		createRalphSession.get(
			"ralph-test-1",
			stack.terminalSession.id,
			stack.task.id,
			5,
		);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const sessions = await client.sendOk("session:ralph-running", {});

		expect(sessions.length).toBeGreaterThanOrEqual(1);
		const found = sessions.find((s: any) => s.id === "ralph-test-1");
		expect(found).toBeDefined();
		expect(found!.status).toBe("running");
		expect(found!.max_iterations).toBe(5);
		expect(found!.current_iteration).toBe(0);
	});

	test("session:ralph-running excludes completed ralph sessions", async () => {
		const stack = seedFullSessionStack();
		createRalphSession.get(
			"ralph-test-2",
			stack.terminalSession.id,
			stack.task.id,
			3,
		);

		// Complete the session via teardown
		await client?.close();
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		// First verify it's running
		let sessions = await client.sendOk("session:ralph-running", {});
		expect(sessions.find((s: any) => s.id === "ralph-test-2")).toBeDefined();

		// Complete task triggers teardown which completes the ralph session
		await client.sendOk("session:complete-task", {
			sessionId: stack.terminalSession.id,
		});

		sessions = await client.sendOk("session:ralph-running", {});
		const found = sessions.find((s: any) => s.id === "ralph-test-2");
		expect(found).toBeUndefined();
	});

	test("session:ralph-running empty when no ralph sessions exist", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const sessions = await client.sendOk("session:ralph-running", {});
		expect(sessions).toEqual([]);
	});

	// ── session:complete-task ────────────────────────────────────────

	test("session:complete-task marks task done and tears down session", async () => {
		const stack = seedFullSessionStack();

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const updatedTask = await client.sendOk("session:complete-task", {
			sessionId: stack.terminalSession.id,
		});

		// Returned task is done with session_id cleared
		expect(updatedTask.id).toBe(stack.task.id);
		expect(updatedTask.status).toBe("done");
		expect(updatedTask.session_id).toBeNull();
		expect(updatedTask.completed_at).toBeString();

		// Broadcasts
		const taskBroadcast = await client.waitForBroadcast("task:updated");
		expect(taskBroadcast.task.status).toBe("done");

		const terminalBroadcast = await client.waitForBroadcast("terminal-session:updated");
		expect(terminalBroadcast.session.id).toBe(stack.terminalSession.id);
		expect(terminalBroadcast.session.status).toBe("completed");

		// DB verification
		const dbTask = getTaskById.get(stack.task.id);
		expect(dbTask!.status).toBe("done");
		expect(dbTask!.session_id).toBeNull();

		const dbTerminal = getTerminalSessionById.get(stack.terminalSession.id);
		expect(dbTerminal!.status).toBe("completed");

		// tmux kill-session was called
		const tmuxKill = execFileCalls.find(
			(c) => c.command === "tmux" && c.args[0] === "kill-session",
		);
		expect(tmuxKill).toBeDefined();
		expect(tmuxKill!.args).toContain(stack.terminalSession.id);
	});

	test("session:complete-task also completes linked claude sessions", async () => {
		const stack = seedFullSessionStack();

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		await client.sendOk("session:complete-task", {
			sessionId: stack.terminalSession.id,
		});

		// Claude session should be broadcast as completed
		const claudeBroadcast = await client.waitForBroadcast("claude-session:updated");
		expect(claudeBroadcast.session.id).toBe(stack.claudeSession.id);
		expect(claudeBroadcast.session.status).toBe("completed");
	});

	test("session:complete-task with unknown sessionId returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("session:complete-task", {
			sessionId: "no-such-session",
		});

		expect(error).toBe("No task found for this session");
	});

	// ── session:send-message ─────────────────────────────────────────

	test("session:send-message calls tmux send-keys with literal mode", async () => {
		const stack = seedFullSessionStack();

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		await client.sendOk("session:send-message", {
			sessionId: stack.terminalSession.id,
			message: "hello world",
		});

		// Verify tmux send-keys was called with -l flag (literal mode)
		const sendKeysCall = execFileCalls.find(
			(c) => c.command === "tmux" && c.args[0] === "send-keys" && c.args.includes("-l"),
		);
		expect(sendKeysCall).toBeDefined();
		expect(sendKeysCall!.args).toContain(stack.terminalSession.id);
		expect(sendKeysCall!.args).toContain("hello world");
	});

	test("session:send-message with unknown sessionId returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("session:send-message", {
			sessionId: "no-such-session",
			message: "hi",
		});

		expect(error).toBe("No task found for this session");
	});

	// ── session:extract-prd ─────────────────────────────────────────

	test("session:extract-prd with unknown session returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const hookEvent = insertHookEvent.get(
			null,
			"PermissionRequest",
			"/tmp/test",
			null,
			null,
			JSON.stringify({ tool_name: "ExitPlanMode", tool_input: { plan: "test" } }),
		);

		const error = await client.sendError("session:extract-prd", {
			sessionId: "no-such-session",
			hookEventId: hookEvent!.id,
		});

		expect(error).toBe("No task found for this session");
	});

	test("session:extract-prd with unknown hook event returns error", async () => {
		const stack = seedFullSessionStack();

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("session:extract-prd", {
			sessionId: stack.terminalSession.id,
			hookEventId: 999999,
		});

		expect(error).toBe("Hook event not found");
	});

	test("session:extract-prd with non-ExitPlanMode event returns error", async () => {
		const stack = seedFullSessionStack();

		// Insert a hook event that is NOT an ExitPlanMode PermissionRequest
		const hookEvent = insertHookEvent.get(
			stack.claudeSession.id,
			"SessionStart",
			stack.workspace.folder_path,
			null,
			null,
			JSON.stringify({ session_id: stack.claudeSession.id }),
		);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("session:extract-prd", {
			sessionId: stack.terminalSession.id,
			hookEventId: hookEvent!.id,
		});

		expect(error).toBe("Hook event is not an ExitPlanMode permission request");
	});

	test("session:extract-prd with PermissionRequest but wrong tool returns error", async () => {
		const stack = seedFullSessionStack();

		const hookEvent = insertHookEvent.get(
			stack.claudeSession.id,
			"PermissionRequest",
			stack.workspace.folder_path,
			null,
			null,
			JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }),
		);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("session:extract-prd", {
			sessionId: stack.terminalSession.id,
			hookEventId: hookEvent!.id,
		});

		expect(error).toBe("Hook event is not an ExitPlanMode permission request");
	});

	test("session:extract-prd with ExitPlanMode but no plan returns error", async () => {
		const stack = seedFullSessionStack();

		const hookEvent = insertHookEvent.get(
			stack.claudeSession.id,
			"PermissionRequest",
			stack.workspace.folder_path,
			null,
			null,
			JSON.stringify({ tool_name: "ExitPlanMode", tool_input: {} }),
		);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("session:extract-prd", {
			sessionId: stack.terminalSession.id,
			hookEventId: hookEvent!.id,
		});

		expect(error).toBe("No plan found in ExitPlanMode tool input");
	});

	test("session:extract-prd with no active claude session returns error", async () => {
		const stack = seedFullSessionStack();

		// End the claude session so there's no active one
		await cli.sendSessionEnd(stack.claudeSession.id, stack.workspace.folder_path);

		const hookEvent = insertHookEvent.get(
			stack.claudeSession.id,
			"PermissionRequest",
			stack.workspace.folder_path,
			null,
			null,
			JSON.stringify({
				tool_name: "ExitPlanMode",
				tool_input: { plan: "# Test Plan\n\n1. Do something" },
			}),
		);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("session:extract-prd", {
			sessionId: stack.terminalSession.id,
			hookEventId: hookEvent!.id,
		});

		expect(error).toBe("No active Claude session found");
	});

	test("session:extract-prd with hook event missing cwd returns error", async () => {
		const stack = seedFullSessionStack();

		// Make claude session active
		await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);

		// Insert hook event with null cwd
		const hookEvent = insertHookEvent.get(
			stack.claudeSession.id,
			"PermissionRequest",
			null, // no cwd
			null,
			null,
			JSON.stringify({
				tool_name: "ExitPlanMode",
				tool_input: { plan: "# Test Plan" },
			}),
		);

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("session:extract-prd", {
			sessionId: stack.terminalSession.id,
			hookEventId: hookEvent!.id,
		});

		expect(error).toBe("Hook event has no cwd");
	});
});
