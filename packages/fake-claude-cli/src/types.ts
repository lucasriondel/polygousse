/**
 * Hook event types matching the Claude Code CLI hook contract.
 * These mirror the types in the API's resolve-status module.
 */

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
