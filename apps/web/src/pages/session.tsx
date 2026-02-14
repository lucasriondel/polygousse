import { useNavigate } from "@tanstack/react-router";
import { CircleCheck, Columns2, GitBranch, GitCommit, Play, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HookEvent } from "@polygousse/types";
import { ErrorBoundary } from "@/components/error-boundary";
import { TerminalView } from "@/components/terminal-view";
import { Button } from "@/components/ui/button";
import { useAppSocket } from "@/hooks/use-app-socket";
import { useActiveSessions } from "@/hooks/use-sessions";
import type { Workspace } from "@/hooks/use-workspaces";
import { wsRequest } from "@/lib/ws-client";

interface SessionPageProps {
	sessionId: string;
	workspaceId: string;
	workspace: Workspace;
}

function getWorktreeBranch(sessionCwd: string, workspacePath: string): string | null {
	// If the session cwd differs from the workspace folder, it's a worktree
	if (sessionCwd === workspacePath) return null;
	// Extract the branch name from the worktree path
	// Worktree paths are: parentDir/parentBase-branchName
	const lastSegment = sessionCwd.split("/").pop() ?? "";
	const workspaceName = workspacePath.split("/").pop() ?? "";
	if (lastSegment.startsWith(`${workspaceName}-`)) {
		return lastSegment.slice(workspaceName.length + 1);
	}
	// Fallback: just show the last path segment
	return lastSegment;
}

export function SessionPage({ sessionId, workspaceId, workspace }: SessionPageProps) {
	const navigate = useNavigate();
	const [completing, setCompleting] = useState(false);
	const [terminating, setTerminating] = useState(false);
	const [committing, setCommitting] = useState(false);
	const [commitAndComplete, setCommitAndComplete] = useState(false);
	const [worktreeBranch, setWorktreeBranch] = useState<string | null>(null);
	const [extractingPrd, setExtractingPrd] = useState(false);
	const [exitPlanModeEventId, setExitPlanModeEventId] = useState<number | null>(null);
	const { sessions: activeSessions } = useActiveSessions();
	const { subscribe } = useAppSocket();

	// Look up the claudeSessionId for this terminal session from active tasks
	const activeTask = activeSessions.find((t) => t.session_id === sessionId);
	const claudeSessionId = activeTask?.claudeSessionId ?? null;
	// Auto-navigate back to workspace when task completes during commit+complete flow
	useEffect(() => {
		if (commitAndComplete && !activeTask) {
			navigate({ to: "/workspaces/$workspaceId", params: { workspaceId } });
		}
	}, [commitAndComplete, activeTask, navigate, workspaceId]);

	useEffect(() => {
		if (!claudeSessionId) return;
		wsRequest("hook:session-get", { id: claudeSessionId })
			.then((session) => {
				setWorktreeBranch(getWorktreeBranch(session.cwd, workspace.folder_path));
			})
			.catch(() => {
				// Session may not exist yet if still preparing
			});
	}, [claudeSessionId, workspace.folder_path]);

	// Helper to check if a hook event is an ExitPlanMode permission request for this session
	const isExitPlanModeEvent = useCallback(
		(event: HookEvent): boolean => {
			if (event.hook_event_name !== "PermissionRequest") return false;
			if (event.session_id !== claudeSessionId) return false;
			try {
				const body = JSON.parse(event.raw_body);
				return body.tool_name === "ExitPlanMode";
			} catch {
				return false;
			}
		},
		[claudeSessionId],
	);

	// On mount: fetch recent hook events to detect an existing ExitPlanMode event
	useEffect(() => {
		if (!claudeSessionId) return;
		wsRequest("hook:events-recent", { limit: 50 })
			.then((events) => {
				const match = events.find(isExitPlanModeEvent);
				if (match) setExitPlanModeEventId(match.id);
			})
			.catch(() => {});
	}, [claudeSessionId, isExitPlanModeEvent]);

	// Realtime: subscribe to hook-event:raw to detect ExitPlanMode events
	useEffect(() => {
		return subscribe("hook-event:raw", (data: unknown) => {
			const { event } = data as { event: HookEvent };
			if (isExitPlanModeEvent(event)) {
				setExitPlanModeEventId(event.id);
			}
		});
	}, [subscribe, isExitPlanModeEvent]);

	// Clear exitPlanModeEventId when the active task disappears (session ended)
	const prevActiveTaskRef = useRef(activeTask);
	useEffect(() => {
		if (prevActiveTaskRef.current && !activeTask) {
			setExitPlanModeEventId(null);
		}
		prevActiveTaskRef.current = activeTask;
	}, [activeTask]);

	async function handleExtractPrd() {
		if (!exitPlanModeEventId) return;
		setExtractingPrd(true);
		try {
			await wsRequest("session:extract-prd", {
				sessionId,
				hookEventId: exitPlanModeEventId,
			});
			navigate({ to: "/workspaces/$workspaceId", params: { workspaceId } });
		} catch {
			setExtractingPrd(false);
		}
	}

	async function handleCommit() {
		setCommitting(true);
		try {
			await wsRequest("session:send-message", {
				sessionId,
				message: "commit this",
			});
		} finally {
			setCommitting(false);
		}
	}

	async function handleComplete() {
		setCompleting(true);
		try {
			await wsRequest("session:complete-task", { sessionId });
			navigate({ to: "/workspaces/$workspaceId", params: { workspaceId } });
		} catch {
			setCompleting(false);
		}
	}

	async function handleTerminate() {
		setTerminating(true);
		try {
			await wsRequest("session:terminate", { sessionId });
		} catch {
			setTerminating(false);
		}
	}

	async function handleSplitTerminal() {
		await wsRequest("session:split-terminal", { sessionId });
	}

	async function handleCommitAndComplete() {
		setCommitAndComplete(true);
		try {
			await wsRequest("session:commit-and-complete", { sessionId });
		} catch {
			setCommitAndComplete(false);
		}
	}

	return (
		<div className="flex h-full w-full flex-col">
			<div className="relative min-h-0 flex-1 overflow-hidden">
				<ErrorBoundary
					fallback={
						<div className="flex h-full items-center justify-center text-muted-foreground text-sm">
							Terminal renderer crashed. Try refreshing the page.
						</div>
					}
				>
					<TerminalView sessionId={sessionId} />
				</ErrorBoundary>
			</div>
			<div className="flex shrink-0 items-center gap-2 border-t px-3 py-1.5">
				{worktreeBranch && (
					<div className="flex items-center gap-1.5 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-400">
						<GitBranch className="size-3.5" />
						{worktreeBranch}
					</div>
				)}
				<Button size="sm" variant="outline" onClick={handleSplitTerminal}>
					<Columns2 className="size-4" />
					Split
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={terminating}
					onClick={handleTerminate}
					className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-500"
				>
					<Square className="size-4" />
					{terminating ? "Terminating..." : "Terminate"}
				</Button>
				{exitPlanModeEventId !== null && activeTask?.sessionStatus === "waiting_input" && (
					<Button
						size="sm"
						variant="outline"
						disabled={extractingPrd}
						onClick={handleExtractPrd}
						className="border-blue-500/30 text-blue-500 hover:bg-blue-500/10 hover:text-blue-500"
					>
						<Play className="size-4" />
						{extractingPrd ? "Extracting PRD..." : "Extract PRD & Start Ralph"}
					</Button>
				)}
				<div className="flex-1" />

				<Button
					size="sm"
					variant="outline"
					disabled={committing || commitAndComplete}
					onClick={handleCommit}
				>
					<GitCommit className="size-4 text-orange-500" />
					{committing ? "Sending..." : "Commit"}
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={completing || commitAndComplete}
					onClick={handleComplete}
					className="text-green-600 border-green-500/30 hover:bg-green-500/10 hover:text-green-600"
				>
					<CircleCheck className="size-4" />
					{completing ? "Completing..." : "Mark task as completed"}
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={commitAndComplete || committing || completing}
					onClick={handleCommitAndComplete}
					className="border-orange-500/30 text-orange-500 hover:bg-orange-500/10 hover:text-orange-500"
				>
					<GitCommit className="size-4" />
					<CircleCheck className="size-4 text-green-500" />
					{commitAndComplete ? "Committing & completing..." : "Commit + Complete"}
				</Button>
			</div>
		</div>
	);
}
