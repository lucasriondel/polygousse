import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createAttachment } from "@polygousse/database";
import { buildPrompt } from "../../src/services/prompt-builder.js";
import { cleanupDb } from "../helpers/setup.js";
import { seedTask, seedWorkspace, resetSeedCounters } from "../helpers/seed.js";

describe("buildPrompt", () => {
	let workspaceId: number;

	beforeEach(() => {
		cleanupDb();
		resetSeedCounters();
		const ws = seedWorkspace();
		workspaceId = ws.id;
	});

	afterEach(() => {
		cleanupDb();
	});

	test("title only → returns title", async () => {
		const task = seedTask(workspaceId, { title: "Fix the login bug" });
		expect(await buildPrompt(task)).toBe("Fix the login bug");
	});

	test("title + description → returns title\\n\\ndescription", async () => {
		const task = seedTask(workspaceId, {
			title: "Add dark mode",
			description: "Implement a toggle in the settings page.",
		});
		expect(await buildPrompt(task)).toBe(
			"Add dark mode\n\nImplement a toggle in the settings page.",
		);
	});

	test("null description treated same as no description", async () => {
		const task = seedTask(workspaceId, {
			title: "Refactor utils",
			description: undefined,
		});
		expect(await buildPrompt(task)).toBe("Refactor utils");
	});

	test("empty string description is included", async () => {
		const task = seedTask(workspaceId, {
			title: "Empty desc task",
			description: "",
		});
		// empty string is truthy for `task.description ? ...` → actually "" is falsy
		expect(await buildPrompt(task)).toBe("Empty desc task");
	});

	test("single attachment appended", async () => {
		const task = seedTask(workspaceId, { title: "Review screenshot" });
		createAttachment.get(
			task.id,
			"screenshot.png",
			"/data/attachments/screenshot.png",
			"image/png",
			1024,
		);

		const result = await buildPrompt(task);
		expect(result).toBe(
			"Review screenshot\n\n---\nAttached files (use the Read tool to view them):\n- screenshot.png (image/png): /data/attachments/screenshot.png",
		);
	});

	test("multiple attachments appended in order", async () => {
		const task = seedTask(workspaceId, {
			title: "Process files",
			description: "Handle these uploads",
		});
		createAttachment.get(
			task.id,
			"doc.pdf",
			"/data/attachments/doc.pdf",
			"application/pdf",
			2048,
		);
		createAttachment.get(
			task.id,
			"image.jpg",
			"/data/attachments/image.jpg",
			"image/jpeg",
			4096,
		);

		const result = await buildPrompt(task);
		expect(result).toBe(
			[
				"Process files",
				"",
				"Handle these uploads",
				"",
				"---",
				"Attached files (use the Read tool to view them):",
				"- doc.pdf (application/pdf): /data/attachments/doc.pdf",
				"- image.jpg (image/jpeg): /data/attachments/image.jpg",
			].join("\n"),
		);
	});

	test("no attachments → no separator appended", async () => {
		const task = seedTask(workspaceId, { title: "Simple task" });
		const result = await buildPrompt(task);
		expect(result).not.toContain("---");
		expect(result).not.toContain("Attached files");
	});

	test("attachments from different task not included", async () => {
		const task1 = seedTask(workspaceId, { title: "Task one" });
		const task2 = seedTask(workspaceId, { title: "Task two" });
		createAttachment.get(
			task1.id,
			"belongs-to-task1.txt",
			"/data/attachments/belongs-to-task1.txt",
			"text/plain",
			100,
		);

		const result = await buildPrompt(task2);
		expect(result).toBe("Task two");
		expect(result).not.toContain("belongs-to-task1.txt");
	});
});
