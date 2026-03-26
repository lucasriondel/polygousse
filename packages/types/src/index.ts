// Domain model types — single source of truth for both frontend and backend

// Status types
export type TaskStatus = "todo" | "doing" | "done" | "waiting_for_input";
export type ClaudeSessionStatus =
	| "preparing"
	| "ongoing"
	| "idle"
	| "waiting_input"
	| "error"
	| "limit_hit"
	| "auth_expired"
	| "completed";
export type TerminalSessionStatus = "active" | "completed";
export type RalphSessionStatus = "running" | "completed" | "failed" | "max_iterations_reached" | "limit_hit";

// Entity interfaces
export interface Workspace {
	id: number;
	name: string;
	folder_path: string;
	icon: string | null;
	parent_workspace_id: number | null;
	linear_team_id: string | null;
	linear_project_ids: string | null;
	created_at: string;
}

export interface Task {
	id: number;
	workspace_id: number;
	title: string;
	description: string | null;
	status: TaskStatus;
	session_id: string | null;
	position: number;
	folder_id: number | null;
	created_at: string;
	completed_at: string | null;
}

export interface TaskFolder {
	id: number;
	workspace_id: number;
	name: string;
	position: number;
	created_at: string;
}

export interface ClaudeSession {
	id: string;
	workspace_id: number | null;
	status: ClaudeSessionStatus;
	cwd: string;
	message: string | null;
	notification_type: string | null;
	terminal_session_id: string | null;
	last_event: string;
	last_event_at: string;
	started_at: string;
	ended_at: string | null;
}

export interface TerminalSession {
	id: string;
	workspace_id: number | null;
	cwd: string;
	status: TerminalSessionStatus;
	started_at: string;
	ended_at: string | null;
}

/** Enriched claude session with ralph iteration and hook events (returned by session debug endpoints) */
export interface AgentSession extends ClaudeSession {
	ralphIteration: number | null;
	hookEvents: HookEvent[];
}

export interface HookEvent {
	id: number;
	session_id: string | null;
	hook_event_name: string;
	cwd: string | null;
	notification_type: string | null;
	message: string | null;
	raw_body: string;
	received_at: string;
}

export interface RalphSession {
	id: string;
	terminal_session_id: string;
	task_id: number;
	max_iterations: number;
	current_iteration: number;
	status: RalphSessionStatus;
	created_at: string;
	completed_at: string | null;
}

export interface TaskAttachment {
	id: number;
	task_id: number;
	filename: string;
	stored_path: string;
	mime_type: string;
	size_bytes: number;
	created_at: string;
}

export interface Setting {
	key: string;
	value: string;
	updated_at: string;
}

export interface LinearTaskLink {
	id: number;
	task_id: number;
	linear_issue_id: string;
	linear_issue_identifier: string;
	linear_team_id: string;
	created_at: string;
}

export interface LinearTeam {
	id: string;
	name: string;
	key: string;
}

export interface LinearProject {
	id: string;
	name: string;
	state: string;
}

export interface LinearIssueState {
	id: string;
	name: string;
	type: string;
}

export interface LinearIssueAttachment {
	id: string;
	title: string | null;
	url: string;
	sourceType: string | null;
}

export interface LinearIssue {
	id: string;
	identifier: string;
	title: string;
	url: string;
	state: LinearIssueState;
	attachmentCount: number;
}

export interface LinearIssueDetail {
	description: string | null;
	attachments: LinearIssueAttachment[];
}

export interface LinearIssueDetailPayload {
	issueId: string;
}

// Claude Usage types
export interface ClaudeUsageData {
	currentSession: number;          // 0-100
	weeklyAllModels: number;         // 0-100
	weeklySonnetOnly: number;        // 0-100
	sessionResetLabel: string | null;
	weeklyResetLabel: string | null;
	fetchedAt: string;               // ISO timestamp
}

// Orchestrator types
export type OrchestratorStepName =
	| "wait_for_exit_plan_mode"
	| "extract_plan"
	| "write_prd"
	| "stop_plan_session"
	| "wait_for_session_end"
	| "pause_for_shell"
	| "start_ralph_loop"
	| "send_commit"
	| "wait_for_commit_stop"
	| "complete_task"
	| "write_prd_from_event"
	| "stop_session"
	| "wait_for_session_end_2"
	| "pause_for_shell_2"
	| "start_ralph_from_prd"
	| "send_login"
	| "wait_for_auth_success"
	| "send_resume";

export type OrchestratorStepStatus = "pending" | "active" | "completed" | "error";

export interface OrchestratorStep {
	name: OrchestratorStepName;
	status: OrchestratorStepStatus;
	detail: string | null;
}

export type OrchestratorStatus = "running" | "completed" | "error";

export interface OrchestratorState {
	id: string;
	terminalSessionId: string;
	planClaudeSessionId: string;
	ralphSessionId: string;
	status: OrchestratorStatus;
	steps: OrchestratorStep[];
	startedAt: string;
	completedAt: string | null;
}

// WebSocket event types
export type WorkspaceCreatedEvent = {
	type: "workspace:created";
	workspace: Workspace;
};

export type WorkspaceUpdatedEvent = {
	type: "workspace:updated";
	workspace: Workspace;
};

export type WorkspaceDeletedEvent = {
	type: "workspace:deleted";
	id: number;
};

export type TaskCreatedEvent = {
	type: "task:created";
	task: Task;
};

export type TaskUpdatedEvent = {
	type: "task:updated";
	task: Task;
};

export type TaskDeletedEvent = {
	type: "task:deleted";
	id: number;
	workspace_id: number;
};

export type TaskReorderedEvent = {
	type: "task:reordered";
	workspace_id: number;
	tasks: { id: number; position: number; folder_id: number | null }[];
};

export type FolderCreatedEvent = {
	type: "folder:created";
	folder: TaskFolder;
};

export type FolderUpdatedEvent = {
	type: "folder:updated";
	folder: TaskFolder;
};

export type FolderDeletedEvent = {
	type: "folder:deleted";
	id: number;
	workspace_id: number;
};

export type FolderReorderedEvent = {
	type: "folder:reordered";
	workspace_id: number;
	folders: { id: number; position: number }[];
};

export type ClaudeSessionCreatedEvent = {
	type: "claude-session:created";
	session: ClaudeSession;
};

export type ClaudeSessionUpdatedEvent = {
	type: "claude-session:updated";
	session: ClaudeSession;
};

export type TerminalSessionCreatedEvent = {
	type: "terminal-session:created";
	session: TerminalSession;
};

export type TerminalSessionUpdatedEvent = {
	type: "terminal-session:updated";
	session: TerminalSession;
};

export type HookEventRawEvent = {
	type: "hook-event:raw";
	event: HookEvent;
};

export type RalphSessionCreatedEvent = {
	type: "ralph-session:created";
	session: RalphSession;
};

export type RalphSessionUpdatedEvent = {
	type: "ralph-session:updated";
	session: RalphSession;
};

export type OrchestratorCreatedEvent = {
	type: "orchestrator:created";
	state: OrchestratorState;
};

export type OrchestratorUpdatedEvent = {
	type: "orchestrator:updated";
	state: OrchestratorState;
};

export type TaskAttachmentCreatedEvent = {
	type: "task:attachment:created";
	attachment: TaskAttachment;
};

export type TaskAttachmentDeletedEvent = {
	type: "task:attachment:deleted";
	id: number;
	task_id: number;
};

export type SettingUpdatedEvent = {
	type: "setting:updated";
	setting: Setting;
};

export type SettingDeletedEvent = {
	type: "setting:deleted";
	key: string;
};

export type LinearTaskLinkCreatedEvent = {
	type: "linear-task-link:created";
	link: LinearTaskLink;
};

export type ClaudeUsageUpdatedEvent = {
	type: "claude-usage:updated";
	usage: ClaudeUsageData | null;
	status: "initializing" | "ready" | "error";
};

// Discriminated union of all WS events
export type WsEvent =
	| WorkspaceCreatedEvent
	| WorkspaceUpdatedEvent
	| WorkspaceDeletedEvent
	| TaskCreatedEvent
	| TaskUpdatedEvent
	| TaskDeletedEvent
	| TaskReorderedEvent
	| FolderCreatedEvent
	| FolderUpdatedEvent
	| FolderDeletedEvent
	| FolderReorderedEvent
	| ClaudeSessionCreatedEvent
	| ClaudeSessionUpdatedEvent
	| TerminalSessionCreatedEvent
	| TerminalSessionUpdatedEvent
	| HookEventRawEvent
	| RalphSessionCreatedEvent
	| RalphSessionUpdatedEvent
	| OrchestratorCreatedEvent
	| OrchestratorUpdatedEvent
	| TaskAttachmentCreatedEvent
	| TaskAttachmentDeletedEvent
	| SettingUpdatedEvent
	| SettingDeletedEvent
	| LinearTaskLinkCreatedEvent
	| ClaudeUsageUpdatedEvent;

// ── WebSocket Request/Response Protocol ─────────────────────────────

export interface WsRequest<A extends WsActionName = WsActionName> {
	id: string;
	action: A;
	payload: WsActionMap[A]["payload"];
}

export interface WsResponseOk<A extends WsActionName = WsActionName> {
	id: string;
	ok: true;
	data: WsActionMap[A]["response"];
}

export interface WsResponseError {
	id: string;
	ok: false;
	error: string;
}

export type WsResponse<A extends WsActionName = WsActionName> = WsResponseOk<A> | WsResponseError;

// ── Debug session types (used by sessions/debug endpoints) ──────────

export interface TerminalSessionDebug extends TerminalSession {
	taskTitle: string | null;
	agentSessions: AgentSession[];
	ralphSession: RalphSession | null;
	orchestrator: OrchestratorState | null;
}

export interface SessionEvent {
	id: number;
	terminal_session_id: string;
	event_type: string;
	payload: string;
	created_at: string;
}

// ── Transcript types ────────────────────────────────────────────────

export interface TranscriptContentBlock {
	type: string;
	text?: string;
	id?: string;
	name?: string;
	input?: unknown;
	tool_use_id?: string;
	content?: unknown;
	[key: string]: unknown;
}

export interface TranscriptEntry {
	type: "user" | "assistant" | "system" | "progress";
	uuid?: string;
	timestamp?: string;
	isSidechain?: boolean;
	message?: {
		role?: string;
		content?: string | TranscriptContentBlock[];
	};
	data?: {
		type?: string;
		hookEvent?: string;
		hookName?: string;
		command?: string;
		prompt?: string;
		agentId?: string;
		message?: unknown;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

// ── Filesystem browse types ─────────────────────────────────────────

export interface BrowseResult {
	path: string;
	parent: string | null;
	directories: { name: string; path: string }[];
}

// ── WS Action Payload & Response types ──────────────────────────────

// Hydration
export interface HydrateResponse {
	workspaces: Workspace[];
	tasks: Task[];
	folders: TaskFolder[];
	attachments: TaskAttachment[];
	claudeSessions: ClaudeSession[];
	ralphSessions: RalphSession[];
	settings: Setting[];
	linearTaskLinks: LinearTaskLink[];
}

// Workspaces
export interface WorkspaceCreatePayload {
	name: string;
	folder_path: string;
	icon?: string | null;
	linear_team_id?: string | null;
	linear_project_ids?: string[] | null;
}

export interface WorkspaceUpdatePayload {
	id: number;
	name: string;
	folder_path: string;
	icon?: string | null;
	linear_team_id?: string | null;
	linear_project_ids?: string[] | null;
}

export interface WorkspaceDeletePayload {
	id: number;
}

export interface WorkspaceCheckPathPayload {
	folder_path: string;
}

export interface WorkspaceCheckPathResponse {
	exists: boolean;
	is_git: boolean;
}

export interface WorkspaceInitRepoPayload {
	folder_path: string;
}

export interface WorktreeCreatePayload {
	workspaceId: number;
	branchName: string;
}

export interface WorktreeCreateResponse {
	path: string;
	branch: string;
}

// Tasks
export interface TaskCreatePayload {
	workspaceId: number;
	title: string;
	description?: string;
	folderId?: number | null;
}

export interface TaskUpdatePayload {
	id: number;
	title?: string;
	description?: string | null;
	status?: TaskStatus;
}

export interface TaskDeletePayload {
	id: number;
}

export interface TaskReorderPayload {
	workspaceId: number;
	taskIds: number[];
}

export interface TaskMoveToFolderPayload {
	taskId: number;
	folderId: number | null;
}

export interface TaskStartPayload {
	taskId: number;
	permissionMode?: string;
	planMode?: boolean;
	cwd?: string;
	ralphMode?: boolean;
	maxIterations?: number;
}

// Folders
export interface FolderCreatePayload {
	workspaceId: number;
	name: string;
}

export interface FolderUpdatePayload {
	id: number;
	name: string;
}

export interface FolderDeletePayload {
	id: number;
}

export interface FolderReorderPayload {
	workspaceId: number;
	folderIds: number[];
}

// Attachments
export interface AttachmentUploadPayload {
	taskId: number;
	filename: string;
	mime_type: string;
	data: string;
}

export interface AttachmentDeletePayload {
	id: number;
}

// Settings
export interface SettingUpdatePayload {
	key: string;
	value: string;
}

export interface SettingDeletePayload {
	key: string;
}

export interface SettingGetPayload {
	key: string;
}

// Sessions
export interface SessionCompletePayload {
	sessionId: string;
}

export interface SessionCommitAndCompletePayload {
	sessionId: string;
}

export interface SessionReloginPayload {
	sessionId: string;
}

export interface SessionSendMessagePayload {
	sessionId: string;
	message: string;
}

export interface SessionSplitTerminalPayload {
	sessionId: string;
	direction?: "vertical" | "horizontal";
}

export interface SessionExtractPrdPayload {
	sessionId: string;
	hookEventId: number;
	maxIterations?: number;
}

export interface SessionDebugDetailPayload {
	terminalSessionId: string;
}

export interface SessionDebugDetailResponse extends TerminalSessionDebug {
	events: SessionEvent[];
}

export interface SessionDebugResponse {
	active: TerminalSessionDebug[];
	completed: TerminalSessionDebug[];
}

// Hooks
export interface HookEventsRecentPayload {
	limit?: number;
}

export interface HookSessionDismissPayload {
	id: string;
}

export interface HookSessionGetPayload {
	id: string;
}

export interface HookSessionsWaitingResponse {
	id: string;
	workspace_id: number | null;
	status: ClaudeSessionStatus;
	cwd: string;
	message: string | null;
	notification_type: string | null;
	terminal_session_id: string | null;
	last_event: string;
	last_event_at: string;
	started_at: string;
	ended_at: string | null;
	task_id: number | null;
	task_title: string | null;
}

// Linear
export interface LinearTeamIssuesPayload {
	teamId: string;
	projectIds?: string;
}

export interface LinearTeamProjectsPayload {
	teamId: string;
}

export interface LinearIssueDonePayload {
	issueId: string;
}

export interface LinearImportPayload {
	issueId: string;
	issueIdentifier: string;
	issueTitle: string;
	teamId: string;
	workspaceId: number;
}

export interface LinearImportResponse {
	task: Task;
	link: LinearTaskLink;
}

export interface LinearCreateAndStartPayload {
	issueId: string;
	issueIdentifier: string;
	issueTitle: string;
	teamId: string;
	workspaceId: number;
	permissionMode?: string;
	planMode?: boolean;
	worktreePath?: string;
	ralphMode?: boolean;
	maxIterations?: number;
}

export interface LinearCreateAndStartResponse {
	task: Task;
	link: LinearTaskLink;
}

// Filesystem
export interface FilesystemBrowsePayload {
	path?: string;
}

// Transcripts
export interface TranscriptGetPayload {
	sessionId: string;
	cwd: string;
}

// ── WsActionMap — maps action name → { payload, response } ─────────

export interface WsActionMap {
	// Hydration
	"hydrate": { payload: Record<string, never>; response: HydrateResponse };

	// Workspaces
	"workspace:create": { payload: WorkspaceCreatePayload; response: Workspace };
	"workspace:update": { payload: WorkspaceUpdatePayload; response: Workspace };
	"workspace:delete": { payload: WorkspaceDeletePayload; response: void };
	"workspace:check-path": { payload: WorkspaceCheckPathPayload; response: WorkspaceCheckPathResponse };
	"workspace:init-repo": { payload: WorkspaceInitRepoPayload; response: void };
	"worktree:create": { payload: WorktreeCreatePayload; response: WorktreeCreateResponse };

	// Tasks
	"task:create": { payload: TaskCreatePayload; response: Task };
	"task:update": { payload: TaskUpdatePayload; response: Task };
	"task:delete": { payload: TaskDeletePayload; response: void };
	"task:reorder": { payload: TaskReorderPayload; response: Task[] };
	"task:move-to-folder": { payload: TaskMoveToFolderPayload; response: Task };
	"task:start": { payload: TaskStartPayload; response: Task };

	// Folders
	"folder:create": { payload: FolderCreatePayload; response: TaskFolder };
	"folder:update": { payload: FolderUpdatePayload; response: TaskFolder };
	"folder:delete": { payload: FolderDeletePayload; response: void };
	"folder:reorder": { payload: FolderReorderPayload; response: TaskFolder[] };

	// Attachments
	"attachment:upload": { payload: AttachmentUploadPayload; response: TaskAttachment };
	"attachment:delete": { payload: AttachmentDeletePayload; response: void };

	// Settings
	"setting:update": { payload: SettingUpdatePayload; response: Setting };
	"setting:delete": { payload: SettingDeletePayload; response: void };
	"setting:get": { payload: SettingGetPayload; response: Setting };

	// Sessions
	"session:terminate": { payload: SessionCompletePayload; response: TerminalSession };
	"session:complete-task": { payload: SessionCompletePayload; response: Task };
	"session:commit-and-complete": { payload: SessionCommitAndCompletePayload; response: void };
	"session:relogin": { payload: SessionReloginPayload; response: void };
	"session:send-message": { payload: SessionSendMessagePayload; response: void };
	"session:split-terminal": { payload: SessionSplitTerminalPayload; response: void };
	"session:debug": { payload: Record<string, never>; response: SessionDebugResponse };
	"session:debug-detail": { payload: SessionDebugDetailPayload; response: SessionDebugDetailResponse };
	"session:ralph-running": { payload: Record<string, never>; response: RalphSession[] };
	"session:extract-prd": { payload: SessionExtractPrdPayload; response: void };

	// Hooks
	"hook:events-recent": { payload: HookEventsRecentPayload; response: HookEvent[] };
	"hook:events-clear": { payload: Record<string, never>; response: void };
	"hook:sessions": { payload: Record<string, never>; response: ClaudeSession[] };
	"hook:sessions-waiting": { payload: Record<string, never>; response: HookSessionsWaitingResponse[] };
	"hook:session-get": { payload: HookSessionGetPayload; response: ClaudeSession };
	"hook:session-dismiss": { payload: HookSessionDismissPayload; response: ClaudeSession };

	// Linear
	"linear:configured": { payload: Record<string, never>; response: { configured: boolean } };
	"linear:teams": { payload: Record<string, never>; response: LinearTeam[] };
	"linear:team-issues": { payload: LinearTeamIssuesPayload; response: LinearIssue[] };
	"linear:team-projects": { payload: LinearTeamProjectsPayload; response: LinearProject[] };
	"linear:issue-detail": { payload: LinearIssueDetailPayload; response: LinearIssueDetail };
	"linear:issue-done": { payload: LinearIssueDonePayload; response: { success: true } };
	"linear:import": { payload: LinearImportPayload; response: LinearImportResponse };
	"linear:create-and-start": { payload: LinearCreateAndStartPayload; response: LinearCreateAndStartResponse };
	"linear:task-links": { payload: Record<string, never>; response: LinearTaskLink[] };

	// Filesystem
	"filesystem:browse": { payload: FilesystemBrowsePayload; response: BrowseResult };

	// Transcripts
	"transcript:get": { payload: TranscriptGetPayload; response: TranscriptEntry[] };

	// Claude Usage
	"claude-usage:get": { payload: Record<string, never>; response: { usage: ClaudeUsageData | null; status: string } };
}

export type WsActionName = keyof WsActionMap;
