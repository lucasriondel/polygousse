/**
 * Extract PRD + Ralph Orchestrator
 *
 * Simplified version of plan-ralph.ts for when the plan is already extracted
 * from an ExitPlanMode hook event. Writes PRD.md, stops the session, and
 * starts the ralph loop.
 */

import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { OrchestratorState } from "@polygousse/database";
import { createRalphSession } from "@polygousse/database";
import {
	type BaseContext,
	type StateNode,
	orchestrators,
	runStateMachine,
} from "../orchestrator.js";
import { prettyLog } from "../pretty-log.js";
import { tmuxSendKeys } from "../tmux.js";
import { broadcast } from "../ws/index.js";

// ── Context ─────────────────────────────────────────────────────────────

interface ExtractPrdRalphContext extends BaseContext {
	ralphSessionId: string;
	cwd: string;
	taskId: number;
	maxIterations: number;
	plan: string;
}

// ── State definitions ────────────────────────────────────────────────────

const STATES: Record<string, StateNode<ExtractPrdRalphContext>> = {
	writing_prd: {
		stepName: "write_prd_from_event",
		trigger: { type: "immediate" },
		action: async (ctx) => {
			const prdPath = join(ctx.cwd, "PRD.md");
			const progressPath = join(ctx.cwd, "progress.txt");
			await unlink(progressPath).catch(() => {});
			await unlink(prdPath).catch(() => {});
			await writeFile(prdPath, ctx.plan, "utf-8");
			prettyLog("orchestrator", `Wrote PRD.md (${ctx.plan.length} chars)`, ctx.claudeSessionId);
		},
		next: "stopping_session",
	},

	stopping_session: {
		stepName: "stop_session",
		trigger: { type: "immediate" },
		action: async (ctx) => {
			await tmuxSendKeys(ctx.terminalSessionId, "Escape", { noEnter: true });
			await new Promise((r) => setTimeout(r, 500));
			await tmuxSendKeys(ctx.terminalSessionId, "/exit");
		},
		next: "awaiting_session_end",
	},

	awaiting_session_end: {
		stepName: "wait_for_session_end_2",
		trigger: { type: "hook", hookEventName: "SessionEnd", timeoutMs: 30_000 },
		action: async (ctx) => {
			prettyLog("orchestrator", "Session ended", ctx.claudeSessionId);
		},
		next: "pausing_for_shell",
	},

	pausing_for_shell: {
		stepName: "pause_for_shell_2",
		trigger: { type: "delay", ms: 1_000 },
		action: async () => {},
		next: "starting_ralph",
	},

	starting_ralph: {
		stepName: "start_ralph_from_prd",
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
	"writing_prd",
	"stopping_session",
	"awaiting_session_end",
	"pausing_for_shell",
	"starting_ralph",
] as const;

// ── Exported orchestrator ────────────────────────────────────────────────

export interface ExtractPrdAndStartRalphParams {
	terminalSessionId: string;
	claudeSessionId: string;
	ralphSessionId: string;
	cwd: string;
	taskId: number;
	maxIterations: number;
	plan: string;
	log: {
		info: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	};
}

export async function orchestrateExtractPrdAndStartRalph(
	params: ExtractPrdAndStartRalphParams,
) {
	const ctx: ExtractPrdRalphContext = { ...params };

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
