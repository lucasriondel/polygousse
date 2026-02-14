import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";
import {
	createClaudeSessionPreparing,
	createTerminalSession,
	type Task,
	updateTask,
	type Workspace,
} from "@polygousse/database";
import { debugTaskLifecycle } from "../../debug.js";
import { fileLog } from "../../file-logger.js";
import { tmuxSendKeys } from "../../tmux.js";
import { broadcast } from "../../ws/index.js";
import { buildPrompt } from "../prompt-builder.js";
import { killTmuxSession } from "./create-tmux.js";

interface StandardParams {
	task: Task;
	workspace: Workspace;
	terminalSessionId: string;
	cwd: string;
	permissionMode?: string;
	planMode?: boolean;
	log: { error: (...args: unknown[]) => void };
}

export async function startStandard(params: StandardParams) {
	const { task, terminalSessionId, cwd, permissionMode, planMode, log } = params;
	debugTaskLifecycle(`standard start: task #${task.id}, cwd=${cwd}`, terminalSessionId);

	const claudeSessionId = crypto.randomUUID();
	fileLog({ level: "info", cat: "task", event: "standard-start", taskId: task.id, tid: terminalSessionId, sid: claudeSessionId, msg: `Standard start: task #${task.id}`, data: { cwd, planMode } });

	// Write prompt to a temp dir and use $(cat ...) to avoid terminal buffer issues
	const promptDir = join(os.tmpdir(), `polygousse-prompt-${claudeSessionId}`);
	await mkdir(promptDir, { recursive: true });
	const prompt = await buildPrompt(task, promptDir);
	const promptFile = join(promptDir, "prompt.md");
	await writeFile(promptFile, prompt, "utf-8");

	const flags: string[] = [];
	if (planMode) {
		flags.push("--permission-mode", "plan", "--allow-dangerously-skip-permissions");
	} else if (permissionMode === "dangerously-skip-permissions") {
		flags.push("--dangerously-skip-permissions");
	}
	const claudeCommand =
		`claude ${flags.join(" ")} --session-id ${claudeSessionId} "$(cat ${promptFile})"`.replace(
			/ {2,}/g,
			" ",
		);

	try {
		await tmuxSendKeys(terminalSessionId, claudeCommand);
		debugTaskLifecycle("Tmux command sent", terminalSessionId);
	} catch (err) {
		log.error(err, "Failed to send command to tmux session");
		await killTmuxSession(terminalSessionId);
		throw new Error("Failed to start Claude in tmux session");
	}

	// Create terminal_sessions row
	const terminalSession = createTerminalSession.get(terminalSessionId, task.workspace_id, cwd);

	// Create claude_sessions row in 'preparing' status
	const claudeSession = createClaudeSessionPreparing.get(
		claudeSessionId,
		task.workspace_id,
		cwd,
		terminalSessionId,
	);

	// Update task status
	const updatedTask = updateTask.get(
		task.title,
		task.description,
		"doing",
		terminalSessionId,
		null,
		task.id,
	);

	// Broadcast typed events
	if (updatedTask) {
		broadcast({ type: "task:updated", task: updatedTask });
	}
	if (terminalSession) {
		broadcast({ type: "terminal-session:created", session: terminalSession });
	}
	if (claudeSession) {
		broadcast({ type: "claude-session:created", session: claudeSession });
	}

	return updatedTask;
}
