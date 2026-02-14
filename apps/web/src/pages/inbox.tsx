import { useNavigate } from "@tanstack/react-router";
import { Inbox, X } from "lucide-react";
import { type ClaudeSession, useWaitingClaudeSessions } from "@/hooks/use-claude-sessions";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useStore } from "@/store";

function formatRelativeTime(dateStr: string): string {
	const now = Date.now();
	const then = new Date(`${dateStr}Z`).getTime();
	const diffMs = now - then;
	const diffSec = Math.floor(diffMs / 1000);

	if (diffSec < 60) return "just now";
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	const diffDays = Math.floor(diffHr / 24);
	return `${diffDays}d ago`;
}

function StatusBadge({ status }: { status: ClaudeSession["status"] }) {
	if (status === "waiting_input") {
		return (
			<span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500">
				Waiting for input
			</span>
		);
	}
	if (status === "error") {
		return (
			<span className="inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-500">
				Error
			</span>
		);
	}
	if (status === "limit_hit") {
		return (
			<span className="inline-flex items-center rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-500">
				Limit hit
			</span>
		);
	}
	if (status === "auth_expired") {
		return (
			<span className="inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-500">
				Login expired
			</span>
		);
	}
	return (
		<span className="inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-500">
			Idle
		</span>
	);
}

export function InboxPage() {
	const { sessions } = useWaitingClaudeSessions();
	const { workspaces } = useWorkspaces();
	const navigate = useNavigate();
	const dismissClaudeSession = useStore((s) => s.dismissClaudeSession);

	const workspaceMap = new Map(workspaces.map((w) => [w.id, w.name]));

	if (sessions.length === 0) {
		return (
			<div className="mx-auto max-w-2xl px-4 py-16 text-center">
				<Inbox className="mx-auto h-12 w-12 text-blue-400/50" />
				<h2 className="mt-4 text-lg font-semibold">No sessions need attention</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					When a Claude session is waiting for input, it will appear here.
				</p>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-2xl px-4 py-16">
			<h1 className="text-4xl font-bold tracking-tight mb-8">Inbox</h1>

			<div className="space-y-2">
				{sessions.map((session) => (
					<div
						key={session.id}
						role="button"
						tabIndex={0}
						className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								if (session.workspace_id && session.terminal_session_id) {
									navigate({
										to: "/workspaces/$workspaceId/sessions/$sessionId",
										params: {
											workspaceId: String(session.workspace_id),
											sessionId: session.terminal_session_id,
										},
									});
								}
							}
						}}
						onClick={() => {
							if (session.workspace_id && session.terminal_session_id) {
								navigate({
									to: "/workspaces/$workspaceId/sessions/$sessionId",
									params: {
										workspaceId: String(session.workspace_id),
										sessionId: session.terminal_session_id,
									},
								});
							}
						}}
					>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<StatusBadge status={session.status} />
								{session.workspace_id && (
									<span className="text-sm font-medium">
										{workspaceMap.get(session.workspace_id) ?? "Unknown workspace"}
									</span>
								)}
							</div>
							{session.task_title && (
								<p className="mt-1 truncate text-sm font-medium">{session.task_title}</p>
							)}
							{session.message && (
								<p className="mt-1 truncate text-sm text-muted-foreground">{session.message}</p>
							)}
						</div>
						<span className="shrink-0 text-xs text-muted-foreground">
							{formatRelativeTime(session.last_event_at)}
						</span>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								dismissClaudeSession(session.id);
							}}
							className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
							title="Dismiss"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
