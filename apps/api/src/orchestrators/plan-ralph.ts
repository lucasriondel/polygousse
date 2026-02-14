/**
 * Plan + Ralph Orchestrator
 *
 * Coordinates the two-phase flow:
 *   1. Run Claude in plan mode, wait for the ExitPlanMode permission request
 *   2. Extract the plan, write PRD.md, stop Claude, then start the ralph loop
 */

import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { OrchestratorState } from "@polygousse/database";
import { createRalphSession } from "@polygousse/database";
import {
	type BaseContext,
	type HookPayload,
	type StateNode,
	orchestrators,
	runStateMachine,
} from "../orchestrator.js";
import { prettyLog } from "../pretty-log.js";
import { tmuxSendKeys } from "../tmux.js";
import { broadcast } from "../ws/index.js";

// ── Context ─────────────────────────────────────────────────────────────

interface PlanRalphContext extends BaseContext {
	ralphSessionId: string;
	cwd: string;
	taskId: number;
	maxIterations: number;
	plan?: string;
}

// ── State definitions ────────────────────────────────────────────────────

const STATES: Record<string, StateNode<PlanRalphContext>> = {
	awaiting_exit_plan_mode: {
		stepName: "wait_for_exit_plan_mode",
		trigger: {
			type: "hook",
			hookEventName: "PermissionRequest",
			toolName: "ExitPlanMode",
		},
		action: async (ctx, event) => {
			const plan = event?.tool_input?.plan;
			if (!plan) throw new Error("ExitPlanMode event had no tool_input.plan");
			ctx.plan = plan;
			prettyLog("orchestrator", `Received plan (${plan.length} chars)`, ctx.claudeSessionId);
		},
		next: "extracting_plan",
	},

	extracting_plan: {
		stepName: "extract_plan",
		trigger: { type: "immediate" },
		action: async (ctx) => {
			if (!ctx.plan) throw new Error("No plan in context");
			prettyLog("orchestrator", `Plan validated (${ctx.plan.length} chars)`, ctx.claudeSessionId);
		},
		next: "writing_prd",
	},

	writing_prd: {
		stepName: "write_prd",
		trigger: { type: "immediate" },
		action: async (ctx) => {
			const prdPath = join(ctx.cwd, "PRD.md");
			const progressPath = join(ctx.cwd, "progress.txt");
			await unlink(progressPath).catch(() => {});
			await unlink(prdPath).catch(() => {});
			await writeFile(prdPath, ctx.plan!, "utf-8");
			prettyLog("orchestrator", `Wrote PRD.md (${ctx.plan!.length} chars)`, ctx.claudeSessionId);
		},
		next: "stopping_plan_session",
	},

	stopping_plan_session: {
		stepName: "stop_plan_session",
		trigger: { type: "immediate" },
		action: async (ctx) => {
			await tmuxSendKeys(ctx.terminalSessionId, "Escape", { noEnter: true });
			await new Promise((r) => setTimeout(r, 500));
			await tmuxSendKeys(ctx.terminalSessionId, "/exit");
		},
		next: "awaiting_session_end",
	},

	awaiting_session_end: {
		stepName: "wait_for_session_end",
		trigger: { type: "hook", hookEventName: "SessionEnd", timeoutMs: 30_000 },
		action: async (ctx) => {
			prettyLog("orchestrator", "Plan session ended", ctx.claudeSessionId);
		},
		next: "pausing_for_shell",
	},

	pausing_for_shell: {
		stepName: "pause_for_shell",
		trigger: { type: "delay", ms: 1_000 },
		action: async () => {},
		next: "starting_ralph",
	},

	starting_ralph: {
		stepName: "start_ralph_loop",
		trigger: { type: "immediate" },
		action: async (ctx) => {
			await tmuxSendKeys(
				ctx.terminalSessionId,
				`export POLYGOUSSE_RALPH_SESSION_ID=${ctx.ralphSessionId}`,
			);

			const ralphSession = createRalphSession.get(
				ctx.ralphSessionId,
				ctx.terminalSessionId,
				ctx.taskId,
				ctx.maxIterations,
			);
			if (ralphSession) {
				broadcast({ type: "ralph-session:created", session: ralphSession });
			}

			await tmuxSendKeys(
				ctx.terminalSessionId,
				`ralph --iterations ${ctx.maxIterations}`,
			);
			prettyLog("orchestrator", `Ralph started (${ctx.maxIterations} iterations)`, ctx.claudeSessionId);
		},
		next: "completed",
	},
};

const STATE_ORDER = [
	"awaiting_exit_plan_mode",
	"extracting_plan",
	"writing_prd",
	"stopping_plan_session",
	"awaiting_session_end",
	"pausing_for_shell",
	"starting_ralph",
] as const;

// ── Exported orchestrator ────────────────────────────────────────────────

export interface PlanPlusRalphParams {
	terminalSessionId: string;
	claudeSessionId: string;
	ralphSessionId: string;
	cwd: string;
	taskId: number;
	maxIterations: number;
	log: {
		info: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	};
}

export async function orchestratePlanPlusRalph(params: PlanPlusRalphParams) {
	const ctx: PlanRalphContext = { ...params };

	const orchState: OrchestratorState = {
		id: params.terminalSessionId,
		terminalSessionId: params.terminalSessionId,
		planClaudeSessionId: params.claudeSessionId,
		ralphSessionId: params.ralphSessionId,
		status: "running",
		steps: STATE_ORDER.map((s) => ({
			name: STATES[s]!.stepName,
			status: "pending" as const,
			detail: null,
		})),
		startedAt: new Date().toISOString(),
		completedAt: null,
	};

	orchestrators.set(params.terminalSessionId, orchState);
	broadcast({ type: "orchestrator:created", state: orchState });

	await runStateMachine(STATES, STATE_ORDER, ctx, orchState);
}
