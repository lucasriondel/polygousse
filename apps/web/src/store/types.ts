import type { AppState } from "./index";

/** Zustand `set` with devtools action name. Replaces the per-file `Set` aliases. */
export type StoreSet = (
	updater: Partial<AppState> | ((state: AppState) => Partial<AppState>),
	replace: boolean,
	action: string,
) => void;

// Re-export all domain types from the shared types package
export type {
	ClaudeSession,
	ClaudeSessionCreatedEvent,
	ClaudeSessionStatus,
	ClaudeSessionUpdatedEvent,
	ClaudeUsageData,
	ClaudeUsageUpdatedEvent,
	FolderCreatedEvent,
	FolderDeletedEvent,
	FolderReorderedEvent,
	FolderUpdatedEvent,
	HookEvent,
	HookEventRawEvent,
	// Linear types
	LinearIssue,
	LinearIssueAttachment,
	LinearIssueDetail,
	LinearIssueState,
	LinearProject,
	LinearTaskLink,
	LinearTaskLinkCreatedEvent,
	LinearTeam,
	OrchestratorCreatedEvent,
	OrchestratorState,
	OrchestratorStatus,
	OrchestratorStep,
	// Orchestrator types
	OrchestratorStepName,
	OrchestratorStepStatus,
	OrchestratorUpdatedEvent,
	RalphSession,
	RalphSessionCreatedEvent,
	RalphSessionStatus,
	RalphSessionUpdatedEvent,
	// Settings types
	Setting,
	SettingDeletedEvent,
	SettingUpdatedEvent,
	Task,
	TaskAttachment,
	TaskAttachmentCreatedEvent,
	TaskAttachmentDeletedEvent,
	TaskCreatedEvent,
	TaskDeletedEvent,
	TaskFolder,
	TaskReorderedEvent,
	// Status types
	TaskStatus,
	TaskUpdatedEvent,
	TerminalSession,
	TerminalSessionCreatedEvent,
	TerminalSessionStatus,
	TerminalSessionUpdatedEvent,
	// Entity interfaces
	Workspace,
	// Event types
	WorkspaceCreatedEvent,
	WorkspaceDeletedEvent,
	WorkspaceUpdatedEvent,
	WsEvent,
} from "@polygousse/types";
