import crypto from "node:crypto";
import { getTaskById, getWorkspaceById } from "@polygousse/database";
import { debugTaskLifecycle } from "../../debug.js";
import { fileLog } from "../../file-logger.js";
import { createTmuxSession } from "./create-tmux.js";
import { startPlanRalph } from "./plan-ralph.js";
import { startRalphOnly } from "./ralph-only.js";
import { startStandard } from "./standard.js";

export interface StartTaskParams {
	taskId: number;
	permissionMode?: string;
	planMode?: boolean;
	cwd?: string;
	ralphMode?: boolean;
	maxIterations?: number;
}

interface StartTaskContext {
	log: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
}

export async function startTask(params: StartTaskParams, ctx: StartTaskContext) {
	const { taskId, permissionMode, planMode, cwd: cwdOverride, ralphMode, maxIterations } = params;
	debugTaskLifecycle(`startTask entry: taskId=${taskId}, planMode=${planMode}, ralphMode=${ralphMode}`);

	const task = getTaskById.get(taskId);
	if (!task) throw new StartTaskError(404, "Task not found");

	if (task.status === "doing") {
		throw new StartTaskError(409, "Task is already in progress");
	}
	if (task.status === "done") {
		throw new StartTaskError(409, "Task is already completed");
	}

	const workspace = getWorkspaceById.get(task.workspace_id);
	if (!workspace) throw new StartTaskError(404, "Workspace not found");

	const terminalSessionId = crypto.randomUUID();
	debugTaskLifecycle(`Terminal session UUID: ${terminalSessionId}`);
	fileLog({ level: "info", cat: "task", event: "start-entry", taskId, tid: terminalSessionId, msg: `Starting task #${taskId}`, data: { planMode, ralphMode } });
	const cwd = cwdOverride ?? workspace.folder_path;

	try {
		await createTmuxSession(terminalSessionId, cwd);
	} catch (err) {
		ctx.log.error(err, "Failed to create tmux session");
		throw new StartTaskError(500, "Failed to create tmux session");
	}

	const shared = { task, workspace, terminalSessionId, cwd, log: ctx.log };

	if (planMode && ralphMode) {
		debugTaskLifecycle("Routing to plan-ralph start variant");
		fileLog({ level: "info", cat: "task", event: "routing", taskId, tid: terminalSessionId, msg: "Routing to plan-ralph" });
		return startPlanRalph({ ...shared, maxIterations: maxIterations ?? 50 });
	}

	if (ralphMode) {
		debugTaskLifecycle("Routing to ralph-only start variant");
		fileLog({ level: "info", cat: "task", event: "routing", taskId, tid: terminalSessionId, msg: "Routing to ralph-only" });
		return startRalphOnly({ ...shared, maxIterations: maxIterations ?? 50 });
	}

	debugTaskLifecycle("Routing to standard start variant");
	fileLog({ level: "info", cat: "task", event: "routing", taskId, tid: terminalSessionId, msg: "Routing to standard" });
	return startStandard({ ...shared, permissionMode, planMode });
}

export class StartTaskError extends Error {
	constructor(
		public statusCode: number,
		message: string,
	) {
		super(message);
	}
}
