import crypto from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
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
import { orchestratePlanPlusRalph } from "../../orchestrators/plan-ralph.js";
import { tmuxSendKeys } from "../../tmux.js";
import { broadcast } from "../../ws/index.js";
import { buildPrompt } from "../prompt-builder.js";
import { killTmuxSession } from "./create-tmux.js";

interface PlanRalphParams {
	task: Task;
	workspace: Workspace;
	terminalSessionId: string;
	cwd: string;
	maxIterations: number;
	log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

export async function startPlanRalph(params: PlanRalphParams) {
	const { task, terminalSessionId, cwd, maxIterations, log } = params;
	debugTaskLifecycle(`plan-ralph start: task #${task.id}, maxIterations=${maxIterations}`, terminalSessionId);

	const claudeSessionId = crypto.randomUUID();
	const ralphSessionId = crypto.randomUUID();
	fileLog({ level: "info", cat: "task", event: "plan-ralph-start", taskId: task.id, tid: terminalSessionId, sid: claudeSessionId, msg: `Plan-ralph start: task #${task.id}`, data: { cwd, maxIterations, ralphSessionId } });

	// Delete PRD.md and progress.txt if they exist
	await unlink(join(cwd, "PRD.md")).catch(() => {});
	await unlink(join(cwd, "progress.txt")).catch(() => {});

	// Write prompt to a temp dir and use $(cat ...) to avoid terminal buffer issues
	const promptDir = join(os.tmpdir(), `polygousse-prompt-${claudeSessionId}`);
	await mkdir(promptDir, { recursive: true });
	const prompt = await buildPrompt(task, promptDir);
	const promptFile = join(promptDir, "prompt.md");
	await writeFile(promptFile, prompt, "utf-8");

	const claudeCommand =
		`claude --permission-mode plan --allow-dangerously-skip-permissions --session-id ${claudeSessionId} "$(cat ${promptFile})"`.replace(
			/ {2,}/g,
			" ",
		);
	try {
		await tmuxSendKeys(terminalSessionId, claudeCommand);
	} catch (err) {
		log.error(err, "Failed to send plan command to tmux session");
		await killTmuxSession(terminalSessionId);
		throw new Error("Failed to start Claude in plan mode");
	}

	// Create DB records
	const terminalSession = createTerminalSession.get(terminalSessionId, task.workspace_id, cwd);
	const claudeSession = createClaudeSessionPreparing.get(
		claudeSessionId,
		task.workspace_id,
		cwd,
		terminalSessionId,
	);
	const updatedTask = updateTask.get(
		task.title,
		task.description,
		"doing",
		terminalSessionId,
		null,
		task.id,
	);

	// Broadcast initial events
	if (updatedTask) {
		broadcast({ type: "task:updated", task: updatedTask });
	}
	if (terminalSession) {
		broadcast({ type: "terminal-session:created", session: terminalSession });
	}
	if (claudeSession) {
		broadcast({ type: "claude-session:created", session: claudeSession });
	}

	// Fire-and-forget the background orchestration
	debugTaskLifecycle("Firing orchestration (plan+ralph)", terminalSessionId);
	orchestratePlanPlusRalph({
		terminalSessionId,
		claudeSessionId,
		ralphSessionId,
		cwd,
		taskId: task.id,
		maxIterations,
		log,
	});

	return updatedTask;
}
