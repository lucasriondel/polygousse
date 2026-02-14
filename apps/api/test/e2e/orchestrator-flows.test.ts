/**
 * End-to-End Orchestrator Flow Tests
 *
 * These tests exercise the full orchestrated flows:
 *   create task → start it → simulate Claude CLI events →
 *   orchestrator progresses → task completes.
 */

import {
	describe,
	test,
	expect,
	beforeAll,
	beforeEach,
	afterAll,
	afterEach,
	setDefaultTimeout,
} from "bun:test";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import {
	createTestApp,
	closeTestApp,
	cleanupDb,
	type TestAppContext,
} from "../helpers/setup.js";
import { TestWsClient } from "../helpers/ws-client.js";
import { MockClaudeCli } from "@polygousse/fake-claude-cli";
import {
	seedFullSessionStack,
	seedWorkspace,
	seedTask,
	seedTerminalSession,
	seedClaudeSession,
	resetSeedCounters,
} from "../helpers/seed.js";
import { execFileCalls, resetExecFileCalls } from "../preload.js";
import {
	getClaudeSessionById,
	getClaudeSessionsByTerminalId,
	getTaskById,
	getTerminalSessionById,
	createRalphSession,
	getRalphSessionById,
	insertHookEvent,
} from "@polygousse/database";
import { orchestrators } from "../../src/orchestrator.js";

describe("orchestrator flows", () => {
	let ctx: TestAppContext;
	let cli: MockClaudeCli;
	let client: TestWsClient;

	setDefaultTimeout(15_000);

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
		orchestrators.clear();
	});

	afterAll(async () => {
		if (ctx) await closeTestApp(ctx);
	});

	// ── Block 1: Standard Flow ──────────────────────────────────────

	describe("standard flow", () => {
		test("task:start creates sessions and CLI events transition status correctly", async () => {
			const workspace = seedWorkspace();
			const task = seedTask(workspace.id);

			client = new TestWsClient();
			await client.connect(ctx.baseUrl);

			// Start the task
			const updatedTask = await client.sendOk("task:start", {
				taskId: task.id,
			});

			expect(updatedTask.status).toBe("doing");

			// Verify tmux new-session was called
			const tmuxNewSession = execFileCalls.find(
				(c) => c.command === "tmux" && c.args[0] === "new-session",
			);
			expect(tmuxNewSession).toBeDefined();

			// Verify claude command was sent via tmux send-keys
			const claudeCmd = execFileCalls.find(
				(c) =>
					c.command === "tmux" &&
					c.args[0] === "send-keys" &&
					c.args.some((a: string) => a.includes("claude")),
			);
			expect(claudeCmd).toBeDefined();

			// Find the terminal session ID from the task
			const dbTask = getTaskById.get(task.id);
			expect(dbTask!.session_id).toBeDefined();
			const terminalSessionId = dbTask!.session_id!;

			// Look up the claude session via terminal ID
			const claudeSessions = getClaudeSessionsByTerminalId.all(terminalSessionId);
			expect(claudeSessions.length).toBe(1);
			const claudeSession = claudeSessions[0]!;
			expect(claudeSession.status).toBe("preparing");

			// SessionStart → ongoing
			await cli.sendSessionStart(claudeSession.id, workspace.folder_path);
			expect(getClaudeSessionById.get(claudeSession.id)!.status).toBe("ongoing");

			// Stop → idle
			await cli.sendStop(claudeSession.id, workspace.folder_path);
			expect(getClaudeSessionById.get(claudeSession.id)!.status).toBe("idle");

			// SessionEnd → completed
			await cli.sendSessionEnd(claudeSession.id, workspace.folder_path);
			expect(getClaudeSessionById.get(claudeSession.id)!.status).toBe("completed");
		});

		test("session:complete-task after full lifecycle marks task done", async () => {
			const stack = seedFullSessionStack();

			client = new TestWsClient();
			await client.connect(ctx.baseUrl);

			// Simulate CLI lifecycle to bring session to completed
			await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
			await cli.sendStop(stack.claudeSession.id, stack.workspace.folder_path);
			await cli.sendSessionEnd(stack.claudeSession.id, stack.workspace.folder_path);
			client.clearBroadcasts();

			// Complete the task
			const updatedTask = await client.sendOk("session:complete-task", {
				sessionId: stack.terminalSession.id,
			});

			expect(updatedTask.status).toBe("done");
			expect(updatedTask.session_id).toBeNull();

			// Verify broadcasts
			const taskBroadcast = await client.waitForBroadcast("task:updated");
			expect(taskBroadcast.task.status).toBe("done");

			const terminalBroadcast = await client.waitForBroadcast("terminal-session:updated");
			expect(terminalBroadcast.session.status).toBe("completed");

			// Verify tmux kill-session was called
			const tmuxKill = execFileCalls.find(
				(c) => c.command === "tmux" && c.args[0] === "kill-session",
			);
			expect(tmuxKill).toBeDefined();
			expect(tmuxKill!.args).toContain(stack.terminalSession.id);
		});
	});

	// ── Block 2: Commit & Complete Orchestrator ─────────────────────

	describe("commit and complete orchestrator", () => {
		test("commit-and-complete progresses through all steps on Stop event", async () => {
			const stack = seedFullSessionStack();

			client = new TestWsClient();
			await client.connect(ctx.baseUrl);

			// Make claude session "ongoing" so it's found as active
			await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
			client.clearBroadcasts();

			// Start commit-and-complete
			await client.sendOk("session:commit-and-complete", {
				sessionId: stack.terminalSession.id,
			});

			// Verify orchestrator:created broadcast with 3 pending steps
			const orchCreated = await client.waitForBroadcast("orchestrator:created");
			expect(orchCreated.state.steps).toHaveLength(3);
			expect(orchCreated.state.steps.every((s: any) => s.status === "pending")).toBe(true);

			// Wait for the orchestrator to reach wait_for_commit_stop (active)
			let orchUpdated: any;
			// The first updates are for sending_commit (active then completed)
			// We need to wait for wait_for_commit_stop to become active
			const waitForStopActive = async () => {
				for (let i = 0; i < 10; i++) {
					const orch = orchestrators.get(stack.terminalSession.id);
					if (orch) {
						const waitStep = orch.steps.find((s) => s.name === "wait_for_commit_stop");
						if (waitStep && waitStep.status === "active") return orch;
					}
					await new Promise((r) => setTimeout(r, 100));
				}
				throw new Error("Timed out waiting for wait_for_commit_stop to become active");
			};

			await waitForStopActive();
			client.clearBroadcasts();

			// Send Stop event to trigger the awaiting step
			await cli.sendStop(stack.claudeSession.id, stack.workspace.folder_path);

			// Wait for the final orchestrator:updated broadcast with "completed" status.
			// The orchestrator removes itself from the Map after teardown, so we rely
			// on broadcasts instead of polling the Map.
			const waitForOrchestratorCompleted = async () => {
				for (let i = 0; i < 50; i++) {
					const updates = client.getBroadcasts("orchestrator:updated");
					const completed = updates.find((u: any) => u.state.status === "completed");
					if (completed) return completed;
					await new Promise((r) => setTimeout(r, 100));
				}
				throw new Error("Timed out waiting for orchestrator completed broadcast");
			};

			const finalUpdate = await waitForOrchestratorCompleted();
			expect((finalUpdate as any).state.status).toBe("completed");
			expect(
				(finalUpdate as any).state.steps.every((s: any) => s.status === "completed"),
			).toBe(true);

			// Verify task is done
			const dbTask = getTaskById.get(stack.task.id);
			expect(dbTask!.status).toBe("done");

			// Verify execFileCalls: tmux send-keys "commit this" + tmux kill-session
			const commitCmd = execFileCalls.find(
				(c) =>
					c.command === "tmux" &&
					c.args[0] === "send-keys" &&
					c.args.some((a: string) => a.includes("commit this")),
			);
			expect(commitCmd).toBeDefined();

			const killCmd = execFileCalls.find(
				(c) => c.command === "tmux" && c.args[0] === "kill-session",
			);
			expect(killCmd).toBeDefined();
		});

		test("commit-and-complete with no active claude session returns error", async () => {
			const stack = seedFullSessionStack();

			client = new TestWsClient();
			await client.connect(ctx.baseUrl);

			// End the claude session first so there's no active one
			await cli.sendSessionEnd(stack.claudeSession.id, stack.workspace.folder_path);
			client.clearBroadcasts();

			// Should fail
			const error = await client.sendError("session:commit-and-complete", {
				sessionId: stack.terminalSession.id,
			});

			expect(error).toBe("No active Claude session found");
		});
	});

	// ── Block 3: Ralph-Only Flow ────────────────────────────────────

	describe("ralph-only flow", () => {
		test("ralph-only task:start creates ralph session and iterations progress", async () => {
			const workspace = seedWorkspace();
			const task = seedTask(workspace.id);

			client = new TestWsClient();
			await client.connect(ctx.baseUrl);

			// Start in ralph mode
			const updatedTask = await client.sendOk("task:start", {
				taskId: task.id,
				ralphMode: true,
				maxIterations: 3,
			});

			expect(updatedTask.status).toBe("doing");

			// Verify ralph session was created (broadcast)
			const ralphCreated = await client.waitForBroadcast("ralph-session:created");
			expect(ralphCreated.session.max_iterations).toBe(3);
			expect(ralphCreated.session.status).toBe("running");
			const ralphSessionId = ralphCreated.session.id;

			// Verify tmux commands include ralph env var and ralph command
			const envExport = execFileCalls.find(
				(c) =>
					c.command === "tmux" &&
					c.args[0] === "send-keys" &&
					c.args.some((a: string) => a.includes("POLYGOUSSE_RALPH_SESSION_ID")),
			);
			expect(envExport).toBeDefined();

			const ralphCmd = execFileCalls.find(
				(c) =>
					c.command === "tmux" &&
					c.args[0] === "send-keys" &&
					c.args.some((a: string) => a.includes("ralph --iterations 3")),
			);
			expect(ralphCmd).toBeDefined();

			// Simulate iteration 1
			const iter1SessionId = "ralph-iter-1-session";
			client.clearBroadcasts();
			await cli.sendSessionStartWithRalph(
				iter1SessionId,
				workspace.folder_path,
				ralphSessionId,
				1,
			);

			// Verify ralph session iteration updated
			const dbRalph1 = getRalphSessionById.get(ralphSessionId);
			expect(dbRalph1!.current_iteration).toBe(1);

			// Simulate iteration 2
			const iter2SessionId = "ralph-iter-2-session";
			await cli.sendSessionStartWithRalph(
				iter2SessionId,
				workspace.folder_path,
				ralphSessionId,
				2,
			);

			const dbRalph2 = getRalphSessionById.get(ralphSessionId);
			expect(dbRalph2!.current_iteration).toBe(2);
		});

		test("ralph:done completes ralph session", async () => {
			const stack = seedFullSessionStack();

			// Create ralph session manually
			const ralphSessionId = "ralph-done-test";
			createRalphSession.get(
				ralphSessionId,
				stack.terminalSession.id,
				stack.task.id,
				5,
			);

			client = new TestWsClient();
			await client.connect(ctx.baseUrl);

			// Make claude session ongoing
			await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
			client.clearBroadcasts();

			// Send ralph:done
			await cli.sendRalphDone(stack.claudeSession.id, stack.workspace.folder_path, ralphSessionId);

			// Verify ralph session completed
			const dbRalph = getRalphSessionById.get(ralphSessionId);
			expect(dbRalph!.status).toBe("completed");
		});
	});

	// ── Block 4: Ralph Limit Hit ────────────────────────────────────

	describe("ralph limit hit", () => {
		test("limit hit marks both ralph and claude sessions as limit_hit", async () => {
			const stack = seedFullSessionStack();

			// Create ralph session
			const ralphSessionId = "ralph-limit-test";
			createRalphSession.get(
				ralphSessionId,
				stack.terminalSession.id,
				stack.task.id,
				5,
			);

			client = new TestWsClient();
			await client.connect(ctx.baseUrl);

			// Make claude session ongoing
			await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
			client.clearBroadcasts();

			// Send limit hit with ralph session ID
			await cli.sendLimitHit(stack.claudeSession.id, stack.workspace.folder_path, ralphSessionId);

			// Verify ralph session is limit_hit
			const dbRalph = getRalphSessionById.get(ralphSessionId);
			expect(dbRalph!.status).toBe("limit_hit");

			// Verify claude session is limit_hit
			const dbClaude = getClaudeSessionById.get(stack.claudeSession.id);
			expect(dbClaude!.status).toBe("limit_hit");
		});
	});

	// ── Block 5: Plan+Ralph Orchestrator ────────────────────────────

	describe("plan+ralph orchestrator", () => {
		const PLAN_RALPH_DIR = "/tmp/test-plan-ralph";

		test("plan+ralph orchestrator completes full flow", async () => {
			// Create temp directory for PRD.md
			mkdirSync(PLAN_RALPH_DIR, { recursive: true });

			try {
				const workspace = seedWorkspace({ folderPath: PLAN_RALPH_DIR });
				const task = seedTask(workspace.id);

				client = new TestWsClient();
				await client.connect(ctx.baseUrl);

				// Start in plan+ralph mode
				const updatedTask = await client.sendOk("task:start", {
					taskId: task.id,
					planMode: true,
					ralphMode: true,
					maxIterations: 5,
				});

				expect(updatedTask.status).toBe("doing");

				// Verify orchestrator:created with 7 steps
				const orchCreated = await client.waitForBroadcast("orchestrator:created");
				expect(orchCreated.state.steps).toHaveLength(7);
				expect(orchCreated.state.status).toBe("running");

				// Find the claude session ID from the terminal
				const dbTask = getTaskById.get(task.id);
				const terminalSessionId = dbTask!.session_id!;
				const claudeSessions = getClaudeSessionsByTerminalId.all(terminalSessionId);
				const claudeSessionId = claudeSessions[0]!.id;

				// Wait for orchestrator to reach wait_for_exit_plan_mode
				const waitForPlanWait = async () => {
					for (let i = 0; i < 20; i++) {
						const orch = orchestrators.get(terminalSessionId);
						if (orch) {
							const step = orch.steps.find((s) => s.name === "wait_for_exit_plan_mode");
							if (step && step.status === "active") return;
						}
						await new Promise((r) => setTimeout(r, 100));
					}
					throw new Error("Timed out waiting for wait_for_exit_plan_mode");
				};
				await waitForPlanWait();

				client.clearBroadcasts();

				// Send PermissionRequest (ExitPlanMode) with plan text
				const planText = "# My Test Plan\n\n## Steps\n1. Do something\n2. Do another thing";
				await cli.sendPermissionRequest(claudeSessionId, PLAN_RALPH_DIR, "ExitPlanMode", {
					plan: planText,
				});

				// Wait for orchestrator to reach wait_for_session_end
				const waitForSessionEnd = async () => {
					for (let i = 0; i < 20; i++) {
						const orch = orchestrators.get(terminalSessionId);
						if (orch) {
							const step = orch.steps.find((s) => s.name === "wait_for_session_end");
							if (step && step.status === "active") return;
						}
						await new Promise((r) => setTimeout(r, 100));
					}
					throw new Error("Timed out waiting for wait_for_session_end");
				};
				await waitForSessionEnd();

				// Verify PRD.md was written
				const prdContent = readFileSync(`${PLAN_RALPH_DIR}/PRD.md`, "utf-8");
				expect(prdContent).toBe(planText);

				// Verify tmux send-keys with Escape and /exit
				const escapeCmd = execFileCalls.find(
					(c) =>
						c.command === "tmux" &&
						c.args[0] === "send-keys" &&
						c.args.some((a: string) => a === "Escape"),
				);
				expect(escapeCmd).toBeDefined();

				const exitCmd = execFileCalls.find(
					(c) =>
						c.command === "tmux" &&
						c.args[0] === "send-keys" &&
						c.args.some((a: string) => a.includes("/exit")),
				);
				expect(exitCmd).toBeDefined();

				client.clearBroadcasts();

				// Send SessionEnd → orchestrator pauses 1s then starts ralph
				await cli.sendSessionEnd(claudeSessionId, PLAN_RALPH_DIR);

				// Wait for orchestrator completion
				const waitForCompletion = async () => {
					for (let i = 0; i < 30; i++) {
						const orch = orchestrators.get(terminalSessionId);
						if (orch && orch.status === "completed") return orch;
						await new Promise((r) => setTimeout(r, 200));
					}
					throw new Error("Timed out waiting for orchestrator completion");
				};

				const finalOrch = await waitForCompletion();
				expect(finalOrch!.status).toBe("completed");

				// Verify ralph-session:created broadcast
				const ralphCreated = await client.waitForBroadcast("ralph-session:created", 5000);
				expect(ralphCreated.session.max_iterations).toBe(5);

				// Verify execFileCalls include ralph --iterations 5
				const ralphCmd = execFileCalls.find(
					(c) =>
						c.command === "tmux" &&
						c.args[0] === "send-keys" &&
						c.args.some((a: string) => a.includes("ralph --iterations 5")),
				);
				expect(ralphCmd).toBeDefined();
			} finally {
				// Cleanup temp directory
				rmSync(PLAN_RALPH_DIR, { recursive: true, force: true });
			}
		});
	});

	// ── Block 6: Extract PRD + Ralph Orchestrator ──────────────────

	describe("extract-prd-ralph orchestrator", () => {
		const EXTRACT_PRD_DIR = "/tmp/test-extract-prd-ralph";

		test("session:extract-prd triggers orchestrator that writes PRD, stops session, and starts ralph", async () => {
			mkdirSync(EXTRACT_PRD_DIR, { recursive: true });

			try {
				const workspace = seedWorkspace({ folderPath: EXTRACT_PRD_DIR });
				const terminalSession = seedTerminalSession(workspace.id, EXTRACT_PRD_DIR);
				const task = seedTask(workspace.id, {
					sessionId: terminalSession.id,
					status: "doing",
				});
				const claudeSession = seedClaudeSession(
					workspace.id,
					terminalSession.id,
					EXTRACT_PRD_DIR,
				);

				client = new TestWsClient();
				await client.connect(ctx.baseUrl);

				// Make claude session active
				await cli.sendSessionStart(claudeSession.id, EXTRACT_PRD_DIR);
				client.clearBroadcasts();

				// Insert a valid ExitPlanMode PermissionRequest hook event
				const planText = "# Extracted Plan\n\n## Steps\n1. Build feature\n2. Write tests";
				const hookEvent = insertHookEvent.get(
					claudeSession.id,
					"PermissionRequest",
					EXTRACT_PRD_DIR,
					null,
					null,
					JSON.stringify({
						tool_name: "ExitPlanMode",
						tool_input: { plan: planText },
					}),
				);

				// Trigger extract-prd
				await client.sendOk("session:extract-prd", {
					sessionId: terminalSession.id,
					hookEventId: hookEvent!.id,
					maxIterations: 3,
				});

				// Verify orchestrator:created broadcast with 5 steps
				const orchCreated = await client.waitForBroadcast("orchestrator:created");
				expect(orchCreated.state.steps).toHaveLength(5);
				expect(orchCreated.state.status).toBe("running");
				expect(orchCreated.state.steps.map((s: any) => s.name)).toEqual([
					"write_prd_from_event",
					"stop_session",
					"wait_for_session_end_2",
					"pause_for_shell_2",
					"start_ralph_from_prd",
				]);

				// Wait for orchestrator to reach wait_for_session_end_2
				const waitForSessionEndStep = async () => {
					for (let i = 0; i < 20; i++) {
						const orch = orchestrators.get(terminalSession.id);
						if (orch) {
							const step = orch.steps.find((s) => s.name === "wait_for_session_end_2");
							if (step && step.status === "active") return;
						}
						await new Promise((r) => setTimeout(r, 100));
					}
					throw new Error("Timed out waiting for wait_for_session_end_2");
				};
				await waitForSessionEndStep();

				// Verify PRD.md was written
				const prdContent = readFileSync(`${EXTRACT_PRD_DIR}/PRD.md`, "utf-8");
				expect(prdContent).toBe(planText);

				// Verify tmux send-keys with Escape and /exit
				const escapeCmd = execFileCalls.find(
					(c) =>
						c.command === "tmux" &&
						c.args[0] === "send-keys" &&
						c.args.some((a: string) => a === "Escape"),
				);
				expect(escapeCmd).toBeDefined();

				const exitCmd = execFileCalls.find(
					(c) =>
						c.command === "tmux" &&
						c.args[0] === "send-keys" &&
						c.args.some((a: string) => a.includes("/exit")),
				);
				expect(exitCmd).toBeDefined();

				client.clearBroadcasts();

				// Send SessionEnd → orchestrator pauses then starts ralph
				await cli.sendSessionEnd(claudeSession.id, EXTRACT_PRD_DIR);

				// Wait for orchestrator completion
				const waitForCompletion = async () => {
					for (let i = 0; i < 30; i++) {
						const orch = orchestrators.get(terminalSession.id);
						if (orch && orch.status === "completed") return orch;
						await new Promise((r) => setTimeout(r, 200));
					}
					throw new Error("Timed out waiting for orchestrator completion");
				};

				const finalOrch = await waitForCompletion();
				expect(finalOrch!.status).toBe("completed");

				// Verify ralph-session:created broadcast
				const ralphCreated = await client.waitForBroadcast("ralph-session:created", 5000);
				expect(ralphCreated.session.max_iterations).toBe(3);

				// Verify execFileCalls include ralph --iterations 3
				const ralphCmd = execFileCalls.find(
					(c) =>
						c.command === "tmux" &&
						c.args[0] === "send-keys" &&
						c.args.some((a: string) => a.includes("ralph --iterations 3")),
				);
				expect(ralphCmd).toBeDefined();

				// Verify POLYGOUSSE_RALPH_SESSION_ID was exported
				const envExport = execFileCalls.find(
					(c) =>
						c.command === "tmux" &&
						c.args[0] === "send-keys" &&
						c.args.some((a: string) => a.includes("POLYGOUSSE_RALPH_SESSION_ID")),
				);
				expect(envExport).toBeDefined();
			} finally {
				rmSync(EXTRACT_PRD_DIR, { recursive: true, force: true });
			}
		});

		test("session:extract-prd uses default maxIterations of 50", async () => {
			mkdirSync(EXTRACT_PRD_DIR, { recursive: true });

			try {
				const workspace = seedWorkspace({ folderPath: EXTRACT_PRD_DIR });
				const terminalSession = seedTerminalSession(workspace.id, EXTRACT_PRD_DIR);
				const task = seedTask(workspace.id, {
					sessionId: terminalSession.id,
					status: "doing",
				});
				const claudeSession = seedClaudeSession(
					workspace.id,
					terminalSession.id,
					EXTRACT_PRD_DIR,
				);

				client = new TestWsClient();
				await client.connect(ctx.baseUrl);

				// Make claude session active
				await cli.sendSessionStart(claudeSession.id, EXTRACT_PRD_DIR);
				client.clearBroadcasts();

				const planText = "# Default Iterations Plan";
				const hookEvent = insertHookEvent.get(
					claudeSession.id,
					"PermissionRequest",
					EXTRACT_PRD_DIR,
					null,
					null,
					JSON.stringify({
						tool_name: "ExitPlanMode",
						tool_input: { plan: planText },
					}),
				);

				// Trigger without specifying maxIterations
				await client.sendOk("session:extract-prd", {
					sessionId: terminalSession.id,
					hookEventId: hookEvent!.id,
				});

				// Send SessionEnd to let orchestrator complete
				// Wait for orchestrator to reach wait_for_session_end_2
				const waitForSessionEndStep = async () => {
					for (let i = 0; i < 20; i++) {
						const orch = orchestrators.get(terminalSession.id);
						if (orch) {
							const step = orch.steps.find((s) => s.name === "wait_for_session_end_2");
							if (step && step.status === "active") return;
						}
						await new Promise((r) => setTimeout(r, 100));
					}
					throw new Error("Timed out waiting for wait_for_session_end_2");
				};
				await waitForSessionEndStep();

				await cli.sendSessionEnd(claudeSession.id, EXTRACT_PRD_DIR);

				// Wait for completion
				const waitForCompletion = async () => {
					for (let i = 0; i < 30; i++) {
						const orch = orchestrators.get(terminalSession.id);
						if (orch && orch.status === "completed") return orch;
						await new Promise((r) => setTimeout(r, 200));
					}
					throw new Error("Timed out waiting for orchestrator completion");
				};
				await waitForCompletion();

				// Verify ralph was started with 50 iterations (default)
				const ralphCmd = execFileCalls.find(
					(c) =>
						c.command === "tmux" &&
						c.args[0] === "send-keys" &&
						c.args.some((a: string) => a.includes("ralph --iterations 50")),
				);
				expect(ralphCmd).toBeDefined();
			} finally {
				rmSync(EXTRACT_PRD_DIR, { recursive: true, force: true });
			}
		});

		test("session:extract-prd with already running orchestrator returns error", async () => {
			const stack = seedFullSessionStack();

			client = new TestWsClient();
			await client.connect(ctx.baseUrl);

			// Make claude session active
			await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);
			client.clearBroadcasts();

			const planText = "# Plan";
			const hookEvent = insertHookEvent.get(
				stack.claudeSession.id,
				"PermissionRequest",
				stack.workspace.folder_path,
				null,
				null,
				JSON.stringify({
					tool_name: "ExitPlanMode",
					tool_input: { plan: planText },
				}),
			);

			// Start first orchestrator
			await client.sendOk("session:extract-prd", {
				sessionId: stack.terminalSession.id,
				hookEventId: hookEvent!.id,
			});

			// Insert another hook event for a second attempt
			const hookEvent2 = insertHookEvent.get(
				stack.claudeSession.id,
				"PermissionRequest",
				stack.workspace.folder_path,
				null,
				null,
				JSON.stringify({
					tool_name: "ExitPlanMode",
					tool_input: { plan: "# Another plan" },
				}),
			);

			// Try to start a second orchestrator — should fail
			const error = await client.sendError("session:extract-prd", {
				sessionId: stack.terminalSession.id,
				hookEventId: hookEvent2!.id,
			});

			expect(error).toBe("An orchestrator is already running for this session");
		});
	});

	// ── Block 7: Relogin Orchestrator ───────────────────────────────

	describe("relogin orchestrator", () => {
		test("happy path: session:relogin sends /login, waits for auth_success, sends resume", async () => {
			const stack = seedFullSessionStack();

			client = new TestWsClient();
			await client.connect(ctx.baseUrl);

			// Make claude session ongoing
			await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);

			// Simulate auth expiry via Stop with auth_expired message
			await cli.sendStop(stack.claudeSession.id, stack.workspace.folder_path, {
				last_assistant_message: "OAuth token has expired",
			});

			// Verify session is auth_expired
			expect(getClaudeSessionById.get(stack.claudeSession.id)!.status).toBe("auth_expired");
			client.clearBroadcasts();
			resetExecFileCalls();

			// Trigger relogin orchestrator
			await client.sendOk("session:relogin", {
				sessionId: stack.terminalSession.id,
			});

			// Verify orchestrator:created broadcast with 3 pending steps
			const orchCreated = await client.waitForBroadcast("orchestrator:created");
			expect(orchCreated.state.steps).toHaveLength(3);
			expect(orchCreated.state.steps.map((s: any) => s.name)).toEqual([
				"send_login",
				"wait_for_auth_success",
				"send_resume",
			]);

			// Wait for orchestrator to reach awaiting_auth_success
			const waitForAuthWait = async () => {
				for (let i = 0; i < 20; i++) {
					const orch = orchestrators.get(stack.terminalSession.id);
					if (orch) {
						const step = orch.steps.find((s) => s.name === "wait_for_auth_success");
						if (step && step.status === "active") return;
					}
					await new Promise((r) => setTimeout(r, 100));
				}
				throw new Error("Timed out waiting for wait_for_auth_success to become active");
			};
			await waitForAuthWait();

			// Verify /login and Enter were sent
			const loginCmd = execFileCalls.find(
				(c) =>
					c.command === "tmux" &&
					c.args[0] === "send-keys" &&
					c.args.some((a: string) => a.includes("/login")),
			);
			expect(loginCmd).toBeDefined();

			client.clearBroadcasts();

			// Send auth_success notification
			await cli.sendAuthSuccess(
				stack.claudeSession.id,
				stack.workspace.folder_path,
				stack.terminalSession.id,
			);

			// Wait for orchestrator completion
			const waitForCompletion = async () => {
				for (let i = 0; i < 50; i++) {
					const updates = client.getBroadcasts("orchestrator:updated");
					const completed = updates.find((u: any) => u.state.status === "completed");
					if (completed) return completed;
					await new Promise((r) => setTimeout(r, 100));
				}
				throw new Error("Timed out waiting for orchestrator completed broadcast");
			};

			const finalUpdate = await waitForCompletion();
			expect((finalUpdate as any).state.status).toBe("completed");
			expect(
				(finalUpdate as any).state.steps.every((s: any) => s.status === "completed"),
			).toBe(true);

			// Verify resume was sent
			const resumeCmd = execFileCalls.find(
				(c) =>
					c.command === "tmux" &&
					c.args[0] === "send-keys" &&
					c.args.some((a: string) => a.includes("resume")),
			);
			expect(resumeCmd).toBeDefined();
		});

		test("relogin with no active claude session returns error", async () => {
			const stack = seedFullSessionStack();

			client = new TestWsClient();
			await client.connect(ctx.baseUrl);

			// End the claude session so there's no active one
			await cli.sendSessionEnd(stack.claudeSession.id, stack.workspace.folder_path);
			client.clearBroadcasts();

			const error = await client.sendError("session:relogin", {
				sessionId: stack.terminalSession.id,
			});

			expect(error).toBe("No active Claude session found");
		});

		test("relogin with already running orchestrator returns error", async () => {
			const stack = seedFullSessionStack();

			client = new TestWsClient();
			await client.connect(ctx.baseUrl);

			// Make claude session ongoing
			await cli.sendSessionStart(stack.claudeSession.id, stack.workspace.folder_path);

			// Simulate auth expiry
			await cli.sendStop(stack.claudeSession.id, stack.workspace.folder_path, {
				last_assistant_message: "OAuth token has expired",
			});
			client.clearBroadcasts();

			// Start first relogin
			await client.sendOk("session:relogin", {
				sessionId: stack.terminalSession.id,
			});

			// Try to start a second — should fail
			const error = await client.sendError("session:relogin", {
				sessionId: stack.terminalSession.id,
			});

			expect(error).toBe("An orchestrator is already running for this session");
		});
	});

	// ── Block 8: Worktree Flows ─────────────────────────────────────

	describe("worktree flows", () => {
		test("session:complete-task with worktree cwd calls git worktree remove", async () => {
			const workspace = seedWorkspace({ folderPath: "/tmp/test-ws-main" });
			// Seed terminal session with a different cwd (worktree path)
			const terminalSession = seedTerminalSession(
				workspace.id,
				"/tmp/test-ws-main-feature-branch",
			);
			const task = seedTask(workspace.id, {
				sessionId: terminalSession.id,
				status: "doing",
			});
			seedClaudeSession(
				workspace.id,
				terminalSession.id,
				"/tmp/test-ws-main-feature-branch",
			);

			client = new TestWsClient();
			await client.connect(ctx.baseUrl);

			await client.sendOk("session:complete-task", {
				sessionId: terminalSession.id,
			});

			// Verify git worktree remove was called with the worktree path
			const worktreeRemove = execFileCalls.find(
				(c) =>
					c.command === "git" &&
					c.args[0] === "worktree" &&
					c.args[1] === "remove" &&
					c.args[2] === "/tmp/test-ws-main-feature-branch",
			);
			expect(worktreeRemove).toBeDefined();
			expect(worktreeRemove!.options?.cwd).toBe("/tmp/test-ws-main");
		});

		test("task:start with cwd override uses custom path", async () => {
			const workspace = seedWorkspace();
			const task = seedTask(workspace.id);

			client = new TestWsClient();
			await client.connect(ctx.baseUrl);

			const updatedTask = await client.sendOk("task:start", {
				taskId: task.id,
				cwd: "/tmp/custom-worktree-path",
			});

			expect(updatedTask.status).toBe("doing");

			// Find the terminal session created
			const dbTask = getTaskById.get(task.id);
			const terminalSessionId = dbTask!.session_id!;
			const dbTerminal = getTerminalSessionById.get(terminalSessionId);
			expect(dbTerminal!.cwd).toBe("/tmp/custom-worktree-path");

			// Verify tmux new-session was created with custom cwd
			const tmuxNewSession = execFileCalls.find(
				(c) =>
					c.command === "tmux" &&
					c.args[0] === "new-session" &&
					c.args.includes("/tmp/custom-worktree-path"),
			);
			expect(tmuxNewSession).toBeDefined();
		});
	});
});
