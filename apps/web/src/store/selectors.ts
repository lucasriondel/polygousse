import type { AppState } from "./index";
import type {
	ClaudeSession,
	ClaudeSessionStatus,
	LinearTaskLink,
	Task,
	TaskFolder,
	Workspace,
} from "./types";

// -- Workspaces --

export function selectWorkspaces(state: AppState): Workspace[] {
	return Array.from(state.workspaces.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function selectWorkspaceById(id: number): (state: AppState) => Workspace | undefined {
	return (state) => state.workspaces.get(id);
}

// -- Tasks --

export function selectWorkspaceTasks(workspaceId: number): (state: AppState) => Task[] {
	return (state) =>
		Array.from(state.tasks.values())
			.filter((t) => t.workspace_id === workspaceId)
			.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}

export interface WorkspaceWithTasks extends Workspace {
	tasks: Task[];
}

export function selectAllTasksByWorkspace(state: AppState): WorkspaceWithTasks[] {
	const workspaces = Array.from(state.workspaces.values()).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	const tasksByWs = new Map<number, Task[]>();

	for (const task of state.tasks.values()) {
		let arr = tasksByWs.get(task.workspace_id);
		if (!arr) {
			arr = [];
			tasksByWs.set(task.workspace_id, arr);
		}
		arr.push(task);
	}

	// Sort tasks within each workspace
	for (const arr of tasksByWs.values()) {
		arr.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
	}

	return workspaces.map((ws) => ({
		...ws,
		tasks: tasksByWs.get(ws.id) ?? [],
	}));
}

// -- Folders --

export function selectWorkspaceFolders(workspaceId: number): (state: AppState) => TaskFolder[] {
	return (state) =>
		Array.from(state.folders.values())
			.filter((f) => f.workspace_id === workspaceId)
			.sort((a, b) => a.position - b.position);
}

// -- Active Sessions (tasks with status "doing" + enriched with claude session info) --

export interface ActiveSessionTask extends Task {
	sessionStatus: ClaudeSessionStatus | null;
	claudeSessionId: string | null;
	ralphCurrentIteration: number | null;
	ralphMaxIterations: number | null;
}

export function selectActiveSessions(state: AppState): ActiveSessionTask[] {
	// Build terminalSessionId → ClaudeSession index to avoid O(tasks × claudeSessions)
	const activeByTerminal = new Map<string, ClaudeSession>();
	for (const cs of state.claudeSessions.values()) {
		if (cs.terminal_session_id) {
			activeByTerminal.set(cs.terminal_session_id, cs);
		}
	}

	const result: ActiveSessionTask[] = [];

	for (const task of state.tasks.values()) {
		if (task.status !== "doing" || !task.session_id) continue;

		const cs = activeByTerminal.get(task.session_id);
		const claudeSessionId = cs?.id ?? null;
		const sessionStatus = cs?.status ?? null;

		// Look up ralph session data
		const ralphSession = state.ralphSessions.get(task.session_id);
		const ralphCurrentIteration = ralphSession?.current_iteration ?? null;
		const ralphMaxIterations = ralphSession?.max_iterations ?? null;

		result.push({
			...task,
			claudeSessionId,
			sessionStatus,
			ralphCurrentIteration,
			ralphMaxIterations,
		});
	}

	return result.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
}

// -- Session status by terminal session id --

export function selectSessionStatus(
	terminalSessionId: string | null,
): (state: AppState) => ClaudeSessionStatus | null {
	return (state) => {
		if (!terminalSessionId) return null;
		for (const cs of state.claudeSessions.values()) {
			if (cs.terminal_session_id === terminalSessionId && cs.status !== "completed") {
				return cs.status;
			}
		}
		return null;
	};
}

// -- Claude Sessions --

export interface WaitingClaudeSessionWithTask extends ClaudeSession {
	task_id: number | null;
	task_title: string | null;
}

export function selectWaitingClaudeSessions(state: AppState): WaitingClaudeSessionWithTask[] {
	const waitingStatuses = new Set(["waiting_input", "error", "idle", "limit_hit", "auth_expired"]);

	// Build sessionId → Task index to avoid O(claudeSessions × tasks)
	const taskBySessionId = new Map<string, Task>();
	for (const task of state.tasks.values()) {
		if (task.session_id) {
			taskBySessionId.set(task.session_id, task);
		}
	}

	const result: WaitingClaudeSessionWithTask[] = [];

	for (const cs of state.claudeSessions.values()) {
		if (!waitingStatuses.has(cs.status)) continue;

		const task = cs.terminal_session_id ? taskBySessionId.get(cs.terminal_session_id) : undefined;
		const taskId = task?.id ?? null;
		const taskTitle = task?.title ?? null;

		result.push({ ...cs, task_id: taskId, task_title: taskTitle });
	}

	return result.sort((a, b) => b.last_event_at.localeCompare(a.last_event_at));
}

export function selectActiveClaudeSessions(state: AppState): ClaudeSession[] {
	return Array.from(state.claudeSessions.values())
		.filter((s) => s.status !== "completed")
		.sort((a, b) => b.last_event_at.localeCompare(a.last_event_at));
}

// -- Terminal --

export function selectTerminalTheme(state: AppState): string {
	return state.settings.get("terminal_theme") ?? "default";
}

// -- Notifications --

export function selectNotificationSoundEnabled(state: AppState): boolean {
	return state.settings.get("notification_sound") !== "off";
}

export function selectRalphLoopSoundEnabled(state: AppState): boolean {
	return state.settings.get("ralph_loop_sound") !== "off";
}

// -- Linear --

export function selectIsLinearConfigured(state: AppState): boolean {
	return state.settings.has("linear_api_token");
}

export function selectLinearTaskLink(
	taskId: number,
): (state: AppState) => LinearTaskLink | undefined {
	return (state) => state.linearTaskLinks.get(taskId);
}
