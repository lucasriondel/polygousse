import { type Static, Type } from "@sinclair/typebox";

// --- Shared param patterns ---

export const IdParams = Type.Object({ id: Type.String() });
export type IdParams = Static<typeof IdParams>;

// --- Hooks ---

const HookEventName = Type.Union([
	Type.Literal("SessionStart"),
	Type.Literal("UserPromptSubmit"),
	Type.Literal("PreToolUse"),
	Type.Literal("PermissionRequest"),
	Type.Literal("PostToolUse"),
	Type.Literal("PostToolUseFailure"),
	Type.Literal("Notification"),
	Type.Literal("SubagentStart"),
	Type.Literal("SubagentStop"),
	Type.Literal("Stop"),
	Type.Literal("TeammateIdle"),
	Type.Literal("TaskCompleted"),
	Type.Literal("PreCompact"),
	Type.Literal("SessionEnd"),
]);

export const HookEventBody = Type.Object(
	{
		session_id: Type.String({ minLength: 1 }),
		hook_event_name: HookEventName,
		cwd: Type.String({ minLength: 1 }),
		notification_type: Type.Optional(Type.String()),
		message: Type.Optional(Type.String()),
		tool_name: Type.Optional(Type.String()),
		agent_type: Type.Optional(Type.String()),
	},
	{ additionalProperties: true },
);
export type HookEventBodySchema = Static<typeof HookEventBody>;

export const RecentEventsQuery = Type.Object({
	limit: Type.Optional(Type.String()),
});
export type RecentEventsQuery = Static<typeof RecentEventsQuery>;
