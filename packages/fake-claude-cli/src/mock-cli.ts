/**
 * Mock Claude CLI — sends HTTP requests to POST /api/hooks/event exactly
 * like the real Claude Code CLI does. Provides convenience methods for
 * common hook event sequences used in tests.
 */

import type { HookEventName, HookEventBody } from "./types.js";

export class MockClaudeCli {
	private baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl;
	}

	/**
	 * Sends a raw hook event payload to the server.
	 * Returns the parsed JSON response (or null for 204).
	 */
	async sendEvent(
		payload: HookEventBody,
	): Promise<{ status: number; body: unknown }> {
		const res = await fetch(`${this.baseUrl}/api/hooks/event`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (res.status === 204) {
			return { status: 204, body: null };
		}

		const body = await res.json();
		return { status: res.status, body };
	}

	/**
	 * Simulates a complete session lifecycle:
	 * SessionStart → UserPromptSubmit → Stop → SessionEnd
	 */
	async simulateSessionLifecycle(
		sessionId: string,
		cwd: string,
		extra: Record<string, unknown> = {},
	): Promise<void> {
		const events: HookEventName[] = [
			"SessionStart",
			"UserPromptSubmit",
			"Stop",
			"SessionEnd",
		];

		for (const hook_event_name of events) {
			await this.sendEvent({
				session_id: sessionId,
				hook_event_name,
				cwd,
				...extra,
			});
		}
	}

	/**
	 * Sends a Notification event with `notification_type: "permission_prompt"`.
	 * This should transition the session to "waiting_input".
	 */
	async sendPermissionPrompt(
		sessionId: string,
		cwd: string,
	): Promise<{ status: number; body: unknown }> {
		return this.sendEvent({
			session_id: sessionId,
			hook_event_name: "Notification",
			cwd,
			notification_type: "permission_prompt",
		});
	}

	/**
	 * Sends a Notification event with `notification_type: "auth_success"`.
	 * This signals that the user has successfully re-authenticated.
	 */
	async sendAuthSuccess(
		sessionId: string,
		cwd: string,
		terminalSessionId: string,
	): Promise<{ status: number; body: unknown }> {
		return this.sendEvent({
			session_id: sessionId,
			hook_event_name: "Notification",
			cwd,
			notification_type: "auth_success",
			message: "Claude Code login successful",
			terminal_session_id: terminalSessionId,
		});
	}

	/**
	 * Sends a Stop event with `<ralph:done/>` marker in the last assistant message.
	 * This signals that a Ralph loop iteration completed successfully.
	 */
	async sendRalphDone(
		sessionId: string,
		cwd: string,
		ralphSessionId: string,
	): Promise<{ status: number; body: unknown }> {
		return this.sendEvent({
			session_id: sessionId,
			hook_event_name: "Stop",
			cwd,
			ralph_session_id: ralphSessionId,
			last_assistant_message: "Task completed successfully.\n<ralph:done/>",
		});
	}

	/**
	 * Sends a Stop event with a "you've hit your limit" message.
	 * This triggers the limit_hit status override.
	 */
	async sendLimitHit(
		sessionId: string,
		cwd: string,
		ralphSessionId?: string,
	): Promise<{ status: number; body: unknown }> {
		return this.sendEvent({
			session_id: sessionId,
			hook_event_name: "Stop",
			cwd,
			...(ralphSessionId ? { ralph_session_id: ralphSessionId } : {}),
			last_assistant_message:
				"Sorry, you've hit your limit for Claude messages. Please wait before trying again.",
		});
	}

	/**
	 * Sends a PermissionRequest event with a specific tool name and input.
	 * Used to simulate ExitPlanMode in plan+ralph orchestrator tests.
	 */
	async sendPermissionRequest(
		sessionId: string,
		cwd: string,
		toolName: string,
		toolInput: Record<string, unknown> = {},
	): Promise<{ status: number; body: unknown }> {
		return this.sendEvent({
			session_id: sessionId,
			hook_event_name: "PermissionRequest",
			cwd,
			tool_name: toolName,
			tool_input: toolInput,
		});
	}

	/**
	 * Sends a SessionStart event with ralph session ID and iteration number.
	 * Used to simulate ralph loop iteration tracking.
	 */
	async sendSessionStartWithRalph(
		sessionId: string,
		cwd: string,
		ralphSessionId: string,
		iteration: number,
		extra: Record<string, unknown> = {},
	): Promise<{ status: number; body: unknown }> {
		return this.sendEvent({
			session_id: sessionId,
			hook_event_name: "SessionStart",
			cwd,
			ralph_session_id: ralphSessionId,
			ralph_iteration: iteration,
			...extra,
		});
	}

	// ── Convenience: individual events ────────────────────────────────

	async sendSessionStart(
		sessionId: string,
		cwd: string,
		extra: Record<string, unknown> = {},
	): Promise<{ status: number; body: unknown }> {
		return this.sendEvent({
			session_id: sessionId,
			hook_event_name: "SessionStart",
			cwd,
			...extra,
		});
	}

	async sendUserPromptSubmit(
		sessionId: string,
		cwd: string,
	): Promise<{ status: number; body: unknown }> {
		return this.sendEvent({
			session_id: sessionId,
			hook_event_name: "UserPromptSubmit",
			cwd,
		});
	}

	async sendStop(
		sessionId: string,
		cwd: string,
		extra: Record<string, unknown> = {},
	): Promise<{ status: number; body: unknown }> {
		return this.sendEvent({
			session_id: sessionId,
			hook_event_name: "Stop",
			cwd,
			...extra,
		});
	}

	async sendSessionEnd(
		sessionId: string,
		cwd: string,
	): Promise<{ status: number; body: unknown }> {
		return this.sendEvent({
			session_id: sessionId,
			hook_event_name: "SessionEnd",
			cwd,
		});
	}
}
