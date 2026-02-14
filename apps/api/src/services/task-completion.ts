import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	getTaskBySessionId,
	getTerminalSessionById,
	getWorkspaceById,
	teardownSessionDb,
} from "@polygousse/database";
import { debugTaskLifecycle } from "../debug.js";
import { fileLog } from "../file-logger.js";
import { removeOrchestratorState } from "../orchestrator.js";
import { broadcast } from "../ws/index.js";

const execFileAsync = promisify(execFile);

type Log = { error: (...args: unknown[]) => void };

export async function removeWorktreeIfNeeded(sessionId: string, log: Log) {
	const terminalSession = getTerminalSessionById.get(sessionId);
	if (!terminalSession) return;

	const task = getTaskBySessionId.get(sessionId);
	if (!task) return;

	const workspace = getWorkspaceById.get(task.workspace_id);
	if (!workspace) return;

	// If the session cwd differs from the workspace folder, it's a worktree
	if (terminalSession.cwd === workspace.folder_path) return;

	try {
		await execFileAsync("git", ["worktree", "remove", terminalSession.cwd], {
			cwd: workspace.folder_path,
		});
	} catch (err) {
		log.error(err, `Failed to remove worktree at ${terminalSession.cwd}`);
	}
}

/**
 * Unified teardown for a terminal session: kill tmux, remove worktree,
 * complete terminal/claude/ralph sessions, and clean up session events.
 * Returns the completed terminal session (for broadcasting by the caller).
 *
 * External side effects (tmux kill, worktree removal) are best-effort.
 * All DB operations are wrapped in a transaction to prevent partial state
 * on failure (e.g., crash mid-way through completing sessions).
 */
export async function teardownSession(terminalSessionId: string, log: Log) {
	debugTaskLifecycle(`Teardown entry: ${terminalSessionId}`);
	fileLog({ level: "info", cat: "task", event: "teardown", tid: terminalSessionId, msg: `Teardown entry: ${terminalSessionId}` });
	// Best-effort external cleanup (not transactional)
	try {
		await execFileAsync("tmux", ["kill-session", "-t", terminalSessionId]);
		debugTaskLifecycle("Tmux session killed", terminalSessionId);
	} catch {
		// Session may already be dead — that's fine
	}
	await removeWorktreeIfNeeded(terminalSessionId, log);
	debugTaskLifecycle("Worktree removal checked", terminalSessionId);

	// Atomically complete all DB state in a single transaction
	const { terminalSession, completedClaudeSessions, completedRalphSession } =
		teardownSessionDb(terminalSessionId);
	debugTaskLifecycle("DB teardown complete", terminalSessionId);
	fileLog({ level: "info", cat: "task", event: "teardown-complete", tid: terminalSessionId, msg: "DB teardown complete" });

	// Clean up in-memory orchestrator state to prevent unbounded Map growth
	removeOrchestratorState(terminalSessionId);

	// Broadcast updates after the transaction commits successfully
	for (const session of completedClaudeSessions) {
		broadcast({ type: "claude-session:updated", session });
	}
	if (completedRalphSession) {
		broadcast({ type: "ralph-session:updated", session: completedRalphSession });
	}

	return terminalSession;
}
