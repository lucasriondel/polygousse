import type { ClaudeSessionStatus } from "@polygousse/database";

export type HookEventName =
	| "SessionStart"
	| "UserPromptSubmit"
	| "PreToolUse"
	| "PermissionRequest"
	| "PostToolUse"
	| "PostToolUseFailure"
	| "Notification"
	| "SubagentStart"
	| "SubagentStop"
	| "Stop"
	| "TeammateIdle"
	| "TaskCompleted"
	| "PreCompact"
	| "SessionEnd";

export interface HookEventBody {
	session_id: string;
	hook_event_name: HookEventName;
	cwd: string;
	notification_type?: string;
	message?: string;
	tool_name?: string;
	agent_type?: string;
	[key: string]: unknown;
}

const AUTH_EXPIRED_RE = /OAuth token has expired|authentication_error/i;

export function resolveStatus(
	hookEvent: HookEventName,
	notificationType?: string,
	lastAssistantMessage?: string,
): ClaudeSessionStatus | null {
	switch (hookEvent) {
		case "SessionStart":
			return "ongoing";
		case "UserPromptSubmit":
			return "ongoing";
		case "Notification":
			if (notificationType === "permission_prompt" || notificationType === "idle_prompt") {
				return "waiting_input";
			}
			if (notificationType === "auth_success") {
				return "ongoing";
			}
			return null;
		case "Stop":
			if (AUTH_EXPIRED_RE.test(lastAssistantMessage ?? "")) {
				return "auth_expired";
			}
			return "idle";
		case "SessionEnd":
			return "completed";
		default:
			return null;
	}
}
