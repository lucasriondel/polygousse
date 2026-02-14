/**
 * Generic Orchestrator Runner
 *
 * Provides the state machine framework, event bus, and state registry
 * used by all orchestrator flows.
 */

import { EventEmitter } from "node:events";
import type {
	OrchestratorState,
	OrchestratorStepName,
	OrchestratorStepStatus,
} from "@polygousse/database";
import { debugOrchestrator } from "./debug.js";
import { fileLog } from "./file-logger.js";
import { prettyLog } from "./pretty-log.js";
import { broadcast } from "./ws/index.js";

// ── Event bus ────────────────────────────────────────────────────────────

export interface HookPayload {
	session_id: string;
	hook_event_name: string;
	tool_name?: string;
	tool_input?: { plan?: string; [key: string]: unknown };
	terminal_session_id?: string;
	[key: string]: unknown;
}

class OrchestratorBus extends EventEmitter {}

export const orchestratorBus = new OrchestratorBus();

// ── Orchestrator state registry ──────────────────────────────────────────

export const orchestrators = new Map<string, OrchestratorState>();

export function getOrchestratorState(terminalSessionId: string) {
	return orchestrators.get(terminalSessionId) ?? null;
}

export function getAllOrchestratorStates() {
	return Array.from(orchestrators.values());
}

export function removeOrchestratorState(terminalSessionId: string) {
	orchestrators.delete(terminalSessionId);
}

// ── State machine types ──────────────────────────────────────────────────

export interface BaseContext {
	terminalSessionId: string;
	claudeSessionId: string;
	log: {
		info: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	};
}

/** What causes a state to advance. */
export type StateTrigger =
	| { type: "hook"; hookEventName: string; toolName?: string; notificationType?: string; timeoutMs?: number }
	| { type: "immediate" }
	| { type: "delay"; ms: number };

/** A single node in the state map. */
export interface StateNode<TCtx extends BaseContext> {
	stepName: OrchestratorStepName;
	trigger: StateTrigger;
	/** Runs when the trigger fires. Receives the hook payload for hook triggers. */
	action: (ctx: TCtx, event?: HookPayload) => Promise<void>;
	next: string;
}

// ── Hook event waiter ────────────────────────────────────────────────────

function waitForHook(
	claudeSessionId: string,
	hookEventName: string,
	toolName: string | undefined,
	notificationType: string | undefined,
	timeoutMs: number | undefined,
): Promise<HookPayload> {
	return new Promise((resolve, reject) => {
		let timer: ReturnType<typeof setTimeout> | undefined;

		function cleanup() {
			if (timer) clearTimeout(timer);
			orchestratorBus.removeListener("hook:received", handler);
			orchestratorBus.removeListener("hook:received", sessionEndHandler);
		}

		if (timeoutMs != null) {
			timer = setTimeout(() => {
				cleanup();
				debugOrchestrator(`Timeout waiting for ${hookEventName} (${timeoutMs}ms)`, claudeSessionId);
				reject(new Error(`Timeout waiting for ${hookEventName} (${timeoutMs}ms)`));
			}, timeoutMs);
		}

		function handler(event: HookPayload) {
			if (event.hook_event_name !== hookEventName) return;
			if (event.session_id !== claudeSessionId) return;
			if (toolName && event.tool_name !== toolName) return;
			if (notificationType && event.notification_type !== notificationType) return;
			cleanup();
			debugOrchestrator(`Hook matched: ${hookEventName}${toolName ? ` (tool: ${toolName})` : ""}`, claudeSessionId);
			resolve(event);
		}

		function sessionEndHandler(event: HookPayload) {
			if (event.hook_event_name !== "SessionEnd") return;
			if (event.session_id !== claudeSessionId) return;
			cleanup();
			debugOrchestrator(`Session ended while waiting for ${hookEventName}`, claudeSessionId);
			reject(new Error(`Session ended while waiting for ${hookEventName}`));
		}

		orchestratorBus.on("hook:received", handler);
		// Auto-cancel on session end (unless we're already waiting for SessionEnd)
		if (hookEventName !== "SessionEnd") {
			orchestratorBus.on("hook:received", sessionEndHandler);
		}
	});
}

// ── UI state helpers ─────────────────────────────────────────────────────

function setStep(
	orchState: OrchestratorState,
	stepName: OrchestratorStepName,
	status: OrchestratorStepStatus,
	detail?: string,
) {
	const step = orchState.steps.find((s) => s.name === stepName);
	if (step) {
		step.status = status;
		step.detail = detail ?? null;
	}
	broadcast({ type: "orchestrator:updated", state: orchState });
}

// ── Generic state machine runner ─────────────────────────────────────────

export async function runStateMachine<TCtx extends BaseContext>(
	states: Record<string, StateNode<TCtx>>,
	stateOrder: readonly string[],
	ctx: TCtx,
	orchState: OrchestratorState,
): Promise<void> {
	let currentState: string = stateOrder[0]!;
	debugOrchestrator(`Starting state machine at "${currentState}"`, ctx.claudeSessionId);
	fileLog({ level: "info", cat: "orchestrator", event: "start", sid: ctx.claudeSessionId, tid: ctx.terminalSessionId, msg: `Starting state machine at "${currentState}"` });

	while (currentState !== "completed" && currentState !== "error") {
		const node = states[currentState];
		if (!node) {
			orchState.status = "error";
			orchState.completedAt = new Date().toISOString();
			broadcast({ type: "orchestrator:updated", state: orchState });
			prettyLog("orchestrator", `Unknown state: ${currentState}`, ctx.claudeSessionId);
			ctx.log.error(`[orchestrator] Unknown state: ${currentState}`);
			return;
		}

		debugOrchestrator(`Entering state "${currentState}" (step: ${node.stepName})`, ctx.claudeSessionId);
		fileLog({ level: "info", cat: "orchestrator", event: "state-enter", sid: ctx.claudeSessionId, tid: ctx.terminalSessionId, msg: `Entering "${currentState}" (step: ${node.stepName})` });
		setStep(orchState, node.stepName, "active");

		try {
			let event: HookPayload | undefined;
			const { trigger } = node;

			switch (trigger.type) {
				case "hook":
					debugOrchestrator(`Waiting for hook ${trigger.hookEventName}${trigger.toolName ? ` (tool: ${trigger.toolName})` : ""}${trigger.notificationType ? ` (notification: ${trigger.notificationType})` : ""}`, ctx.claudeSessionId);
					event = await waitForHook(
						ctx.claudeSessionId,
						trigger.hookEventName,
						trigger.toolName,
						trigger.notificationType,
						trigger.timeoutMs,
					);
					break;
				case "delay":
					await new Promise((r) => setTimeout(r, trigger.ms));
					break;
				case "immediate":
					break;
			}

			await node.action(ctx, event);
			setStep(orchState, node.stepName, "completed");
			debugOrchestrator(`Transitioning "${currentState}" → "${node.next}"`, ctx.claudeSessionId);
			fileLog({ level: "info", cat: "orchestrator", event: "transition", sid: ctx.claudeSessionId, tid: ctx.terminalSessionId, msg: `"${currentState}" → "${node.next}"` });
			currentState = node.next;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setStep(orchState, node.stepName, "error", message);
			currentState = "error";
			fileLog({ level: "error", cat: "orchestrator", event: "step-error", sid: ctx.claudeSessionId, tid: ctx.terminalSessionId, msg: `Failed at ${node.stepName}: ${message}` });
			prettyLog("orchestrator", `Failed at ${node.stepName}: ${message}`, ctx.claudeSessionId);
			ctx.log.error(err, `[orchestrator] Failed at ${node.stepName}`);
		}
	}

	orchState.status = currentState === "completed" ? "completed" : "error";
	orchState.completedAt = new Date().toISOString();
	broadcast({ type: "orchestrator:updated", state: orchState });
}
