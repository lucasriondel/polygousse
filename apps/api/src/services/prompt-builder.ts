import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { getAttachmentsByTaskId, type Task } from "@polygousse/database";

export async function buildPrompt(task: Task, promptDir?: string): Promise<string> {
	let prompt = task.description ? `${task.title}\n\n${task.description}` : task.title;

	const attachments = getAttachmentsByTaskId.all(task.id);
	if (attachments.length > 0) {
		prompt += "\n\n---\nAttached files (use the Read tool to view them):";
		for (const a of attachments) {
			if (promptDir) {
				const destPath = join(promptDir, a.filename);
				await copyFile(a.stored_path, destPath);
				prompt += `\n- ${a.filename} (${a.mime_type}): ${destPath}`;
			} else {
				prompt += `\n- ${a.filename} (${a.mime_type}): ${a.stored_path}`;
			}
		}
	}

	return prompt;
}
