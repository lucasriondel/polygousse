/**
 * Commit + Complete Orchestrator
 *
 * Coordinates the commit-and-complete flow:
 *   1. Send "commit this" to the active Claude session
 *   2. Wait for the Stop hook event (Claude finishes committing)
 *   3. Tear down the session and mark the task as done
 */

import {
	getTaskBySessionId,
	updateTask,
} from "@polygousse/database";
import type { OrchestratorState } from "@polygousse/database";
import {
	type BaseContext,
	type StateNode,
	orchestrators,
	runStateMachine,
} from "../orchestrator.js";
import { teardownSession } from "../services/task-completion.js";
import { fileLog } from "../file-logger.js";
import { prettyLog } from "../pretty-log.js";
import { tmuxSendKeys } from "../tmux.js";
import { broadcast } from "../ws/index.js";

// ── Context ─────────────────────────────────────────────────────────────

type CommitCompleteContext = BaseContext;

// ── State definitions ────────────────────────────────────────────────────

const STATES: Record<string, StateNode<CommitCompleteContext>> = {
	sending_commit: {
		stepName: "send_commit",
		trigger: { type: "immediate" },
		action: async (ctx) => {
			await tmuxSendKeys(ctx.terminalSessionId, "commit this", {
				literal: true,
			});
			prettyLog("orchestrator", "Sent 'commit this' to terminal", ctx.claudeSessionId);
			fileLog({ level: "info", cat: "orchestrator", event: "commit-send", sid: ctx.claudeSessionId, tid: ctx.terminalSessionId, msg: "Sent 'commit this' to terminal" });
		},
		next: "awaiting_commit_stop",
	},

	awaiting_commit_stop: {
		stepName: "wait_for_commit_stop",
		trigger: {
			type: "hook",
			hookEventName: "Stop",
			timeoutMs: 120_000,
		},
		action: async (ctx) => {
			prettyLog("orchestrator", "Claude finished committing", ctx.claudeSessionId);
			fileLog({ level: "info", cat: "orchestrator", event: "commit-stop-received", sid: ctx.claudeSessionId, tid: ctx.terminalSessionId, msg: "Claude finished committing" });
		},
		next: "completing_task",
	},

	completing_task: {
		stepName: "complete_task",
		trigger: { type: "immediate" },
		action: async (ctx) => {
			const terminalSession = await teardownSession(
				ctx.terminalSessionId,
				ctx.log,
			);

			const task = getTaskBySessionId.get(ctx.terminalSessionId);
			if (task) {
				const updatedTask = updateTask.get(
					task.title,
					task.description,
					"done",
					null,
					new Date().toISOString(),
					task.id,
				);
				if (updatedTask) {
					broadcast({ type: "task:updated", task: updatedTask });
				}
			}

			if (terminalSession) {
				broadcast({
					type: "terminal-session:updated",
					session: terminalSession,
				});
			}

			prettyLog("orchestrator", "Task completed and session torn down", ctx.claudeSessionId);
			fileLog({ level: "info", cat: "orchestrator", event: "commit-complete-done", sid: ctx.claudeSessionId, tid: ctx.terminalSessionId, msg: "Task completed and session torn down" });
		},
		next: "completed",
	},
};

const STATE_ORDER = [
	"sending_commit",
	"awaiting_commit_stop",
	"completing_task",
] as const;

// ── Exported orchestrator ────────────────────────────────────────────────

export interface CommitAndCompleteParams {
	terminalSessionId: string;
	claudeSessionId: string;
	log: {
		info: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	};
}

export async function orchestrateCommitAndComplete(
	params: CommitAndCompleteParams,
) {
	const ctx: CommitCompleteContext = { ...params };

	const orchState: OrchestratorState = {
		id: params.terminalSessionId,
		terminalSessionId: params.terminalSessionId,
		planClaudeSessionId: "",
		ralphSessionId: "",
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
