import { describe, expect, test } from "bun:test";
import {
	resolveStatus,
	type HookEventName,
} from "../../src/services/hook-processing/resolve-status.js";

describe("resolveStatus", () => {
	test("SessionStart → ongoing", () => {
		expect(resolveStatus("SessionStart")).toBe("ongoing");
	});

	test("UserPromptSubmit → ongoing", () => {
		expect(resolveStatus("UserPromptSubmit")).toBe("ongoing");
	});

	test("Stop → idle", () => {
		expect(resolveStatus("Stop")).toBe("idle");
	});

	test("SessionEnd → completed", () => {
		expect(resolveStatus("SessionEnd")).toBe("completed");
	});

	test("Notification with permission_prompt → waiting_input", () => {
		expect(resolveStatus("Notification", "permission_prompt")).toBe(
			"waiting_input",
		);
	});

	test("Notification with idle_prompt → waiting_input", () => {
		expect(resolveStatus("Notification", "idle_prompt")).toBe(
			"waiting_input",
		);
	});

	test("Notification with auth_success → ongoing", () => {
		expect(resolveStatus("Notification", "auth_success")).toBe("ongoing");
	});

	test("Notification with other type → null", () => {
		expect(resolveStatus("Notification", "some_other_type")).toBeNull();
	});

	test("Notification with no type → null", () => {
		expect(resolveStatus("Notification")).toBeNull();
	});

	describe("non-status-changing events → null", () => {
		const noChangeEvents: HookEventName[] = [
			"PreToolUse",
			"PermissionRequest",
			"PostToolUse",
			"PostToolUseFailure",
			"SubagentStart",
			"SubagentStop",
			"TeammateIdle",
			"TaskCompleted",
			"PreCompact",
		];

		for (const event of noChangeEvents) {
			test(`${event} → null`, () => {
				expect(resolveStatus(event)).toBeNull();
			});
		}
	});
});
