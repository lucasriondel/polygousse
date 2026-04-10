import crypto from "node:crypto";
import {
	createRalphSession,
	createTerminalSession,
	type Task,
	updateTask,
	type Workspace,
} from "@polygousse/database";
import { debugTaskLifecycle } from "../../debug.js";
import { fileLog } from "../../file-logger.js";
import { tmuxSendKeys } from "../../tmux.js";
import { broadcast } from "../../ws/index.js";
import { killTmuxSession } from "./create-tmux.js";

interface RalphOnlyParams {
	task: Task;
	workspace: Workspace;
	terminalSessionId: string;
	cwd: string;
	maxIterations: number;
	log: { error: (...args: unknown[]) => void };
}

export async function startRalphOnly(params: RalphOnlyParams) {
	const { task, workspace, terminalSessionId, cwd, maxIterations, log } = params;
	debugTaskLifecycle(`ralph-only start: task #${task.id}, maxIterations=${maxIterations}`, terminalSessionId);

	const ralphSessionId = crypto.randomUUID();
	fileLog({ level: "info", cat: "task", event: "ralph-only-start", taskId: task.id, tid: terminalSessionId, msg: `Ralph-only start: task #${task.id}`, data: { cwd, maxIterations, ralphSessionId } });

	// Export ralph session ID so hooks can link back
	await tmuxSendKeys(terminalSessionId, `export POLYGOUSSE_RALPH_SESSION_ID=${ralphSessionId}`);

	// Create terminal_sessions row
	const terminalSession = createTerminalSession.get(terminalSessionId, task.workspace_id, cwd);

	// Create ralph_sessions DB record
	const ralphSession = createRalphSession.get(
		ralphSessionId,
		terminalSessionId,
		task.id,
		maxIterations,
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

	// Send the ralph command to tmux
	const ralphCommand = `ralph --iterations ${maxIterations}${workspace.nested_repos ? " --nested-repos" : ""}`;
	try {
		await tmuxSendKeys(terminalSessionId, ralphCommand);
	} catch (err) {
		log.error(err, "Failed to send ralph command to tmux session");
		await killTmuxSession(terminalSessionId);
		throw new Error("Failed to start ralph in tmux session");
	}

	if (updatedTask) {
		broadcast({ type: "task:updated", task: updatedTask });
	}
	if (terminalSession) {
		broadcast({ type: "terminal-session:created", session: terminalSession });
	}
	if (ralphSession) {
		broadcast({ type: "ralph-session:created", session: ralphSession });
	}

	return updatedTask;
}
