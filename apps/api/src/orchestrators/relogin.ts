/**
 * Re-login Orchestrator
 *
 * Automates the re-auth flow when a Claude session's OAuth token expires:
 *   1. Send "/login" + Enter to the terminal
 *   2. Wait for the auth_success notification
 *   3. Dismiss the success message and send "resume"
 */

import type { OrchestratorState } from "@polygousse/database";
import {
	type BaseContext,
	type StateNode,
	orchestrators,
	runStateMachine,
} from "../orchestrator.js";
import { fileLog } from "../file-logger.js";
import { prettyLog } from "../pretty-log.js";
import { tmuxSendKeys } from "../tmux.js";
import { broadcast } from "../ws/index.js";

// ── Context ─────────────────────────────────────────────────────────────

type ReloginContext = BaseContext;

// ── State definitions ────────────────────────────────────────────────────

const STATES: Record<string, StateNode<ReloginContext>> = {
	sending_login: {
		stepName: "send_login",
		trigger: { type: "immediate" },
		action: async (ctx) => {
			await tmuxSendKeys(ctx.terminalSessionId, "/login", { literal: true });
			await new Promise((r) => setTimeout(r, 1000));
			await tmuxSendKeys(ctx.terminalSessionId, "Enter");
			prettyLog("orchestrator", "Sent '/login' + Enter to terminal", ctx.claudeSessionId);
			fileLog({ level: "info", cat: "orchestrator", event: "relogin-send-login", sid: ctx.claudeSessionId, tid: ctx.terminalSessionId, msg: "Sent '/login' + Enter to terminal" });
		},
		next: "awaiting_auth_success",
	},

	awaiting_auth_success: {
		stepName: "wait_for_auth_success",
		trigger: {
			type: "hook",
			hookEventName: "Notification",
			notificationType: "auth_success",
			timeoutMs: 120_000,
		},
		action: async (ctx) => {
			prettyLog("orchestrator", "Auth success received", ctx.claudeSessionId);
			fileLog({ level: "info", cat: "orchestrator", event: "relogin-auth-success", sid: ctx.claudeSessionId, tid: ctx.terminalSessionId, msg: "Auth success received" });
		},
		next: "sending_resume",
	},

	sending_resume: {
		stepName: "send_resume",
		trigger: { type: "immediate" },
		action: async (ctx) => {
			await tmuxSendKeys(ctx.terminalSessionId, "Enter");
			await new Promise((r) => setTimeout(r, 1000));
			await tmuxSendKeys(ctx.terminalSessionId, "resume", { literal: true });
			prettyLog("orchestrator", "Sent Enter + 'resume' to terminal", ctx.claudeSessionId);
			fileLog({ level: "info", cat: "orchestrator", event: "relogin-send-resume", sid: ctx.claudeSessionId, tid: ctx.terminalSessionId, msg: "Sent Enter + 'resume' to terminal" });
		},
		next: "completed",
	},
};

const STATE_ORDER = [
	"sending_login",
	"awaiting_auth_success",
	"sending_resume",
] as const;

// ── Exported orchestrator ────────────────────────────────────────────────

export interface ReloginParams {
	terminalSessionId: string;
	claudeSessionId: string;
	log: {
		info: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	};
}

export async function orchestrateRelogin(params: ReloginParams) {
	const ctx: ReloginContext = { ...params };

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
