import { playNotificationSound } from "@/lib/notification-sound";
import { wsRequest } from "@/lib/ws-client";
import { useStore } from "@/store";
import {
	selectNotificationSoundEnabled,
	selectRalphLoopSoundEnabled,
	type WaitingClaudeSessionWithTask,
} from "@/store/selectors";
import { type useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

function getTitle(status: WaitingClaudeSessionWithTask["status"]): string {
	switch (status) {
		case "waiting_input":
			return "Claude is waiting for input";
		case "error":
			return "Claude session error";
		case "limit_hit":
			return "Claude hit its usage limit";
		case "auth_expired":
			return "Claude login expired — run /login";
		default:
			return "Claude session idle";
	}
}

function getStatusColor(status: WaitingClaudeSessionWithTask["status"]): {
	border: string;
	title: string;
} {
	switch (status) {
		case "error":
		case "auth_expired":
			return { border: "border-red-500", title: "text-red-500" };
		case "waiting_input":
			return { border: "border-amber-500", title: "text-amber-500" };
		case "limit_hit":
			return { border: "border-orange-500", title: "text-orange-500" };
		default:
			return { border: "border-blue-500", title: "text-blue-500" };
	}
}

function getBody(session: WaitingClaudeSessionWithTask): string {
	if (session.task_title && session.message) {
		const full = `${session.task_title} — ${session.message}`;
		return full.length > 120 ? `${full.slice(0, 117)}...` : full;
	}
	if (session.task_title) return session.task_title;
	if (session.message) {
		return session.message.length > 120 ? `${session.message.slice(0, 117)}...` : session.message;
	}
	return "A session needs your attention.";
}

function showSessionToast(
	session: WaitingClaudeSessionWithTask,
	navigate: ReturnType<typeof useNavigate>,
) {
	const canCommit =
		(session.status === "waiting_input" || session.status === "idle") &&
		session.notification_type !== "permission_prompt";
	const title = getTitle(session.status);
	const description = getBody(session);
	const colors = getStatusColor(session.status);

	const handleNavigate = () => {
		if (session.workspace_id && session.terminal_session_id) {
			toast.dismiss(session.id);
			navigate({
				to: "/workspaces/$workspaceId/sessions/$sessionId",
				params: {
					workspaceId: String(session.workspace_id),
					sessionId: session.terminal_session_id,
				},
			});
		}
	};

	toast.custom(
		(id) => (
			<div
				className={`relative flex flex-col gap-2 w-[356px] rounded-lg border ${colors.border} bg-popover p-4 text-popover-foreground shadow-lg cursor-pointer`}
				onClick={handleNavigate}
				onKeyDown={(e) => {
					if (e.key === "Enter") handleNavigate();
				}}
			>
				<button
					type="button"
					className="absolute top-2 right-2 inline-flex items-center justify-center rounded-md text-xs font-medium h-6 w-6 hover:bg-accent hover:text-accent-foreground text-muted-foreground"
					onClick={(e) => {
						e.stopPropagation();
						toast.dismiss(id);
						wsRequest("hook:session-dismiss", { id: session.id });
					}}
					title="Dismiss"
				>
					<X className="h-3.5 w-3.5" />
				</button>
				<div className={`font-medium text-sm ${colors.title} pr-6`}>{title}</div>
				<div className="text-sm text-muted-foreground">{description}</div>
				{canCommit && (
					<div className="flex gap-2 mt-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
						<button
							type="button"
							className="inline-flex items-center justify-center rounded-md text-xs font-medium h-7 px-3 bg-primary text-primary-foreground hover:bg-primary/90"
							onClick={() => {
								toast.dismiss(id);
								wsRequest("session:commit-and-complete", { sessionId: session.terminal_session_id });
							}}
						>
							Commit + Complete
						</button>
					</div>
				)}
				{session.status === "auth_expired" && (
					<div className="flex gap-2 mt-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
						<button
							type="button"
							className="inline-flex items-center justify-center rounded-md text-xs font-medium h-7 px-3 bg-primary text-primary-foreground hover:bg-primary/90"
							onClick={() => {
								toast.dismiss(id);
								wsRequest("session:relogin", { sessionId: session.terminal_session_id });
							}}
						>
							Login
						</button>
					</div>
				)}
			</div>
		),
		{
			id: session.id,
			duration: Number.POSITIVE_INFINITY,
		},
	);
}

export function useBrowserNotifications(
	waitingSessions: WaitingClaudeSessionWithTask[],
	navigate: ReturnType<typeof useNavigate>,
) {
	const notifiedIds = useRef<Set<string> | null>(null);
	const soundEnabled = useStore(selectNotificationSoundEnabled);
	const ralphSoundEnabled = useStore(selectRalphLoopSoundEnabled);
	const ralphSessions = useStore((s) => s.ralphSessions);

	// Request permission on mount
	useEffect(() => {
		if (typeof Notification !== "undefined" && Notification.permission === "default") {
			Notification.requestPermission();
		}
	}, []);

	useEffect(() => {
		// Seed on first load — don't notify for pre-existing sessions
		if (notifiedIds.current === null) {
			notifiedIds.current = new Set(waitingSessions.map((s) => s.id));
			return;
		}

		const currentIds = new Set(waitingSessions.map((s) => s.id));

		for (const session of waitingSessions) {
			if (notifiedIds.current.has(session.id)) continue;

			notifiedIds.current.add(session.id);

			const isRalphSession =
				session.terminal_session_id != null &&
				ralphSessions.has(session.terminal_session_id);
			const shouldPlaySound = isRalphSession ? ralphSoundEnabled : soundEnabled;
			if (shouldPlaySound) {
				playNotificationSound();
			}

			// Show in-app toast (always, regardless of tab visibility)
			showSessionToast(session, navigate);

			// Skip firing the browser notification if the tab is visible
			if (document.visibilityState === "visible") continue;

			if (typeof Notification !== "undefined" && Notification.permission === "granted") {
				new Notification(getTitle(session.status), {
					body: getBody(session),
					tag: session.id,
				});
			}
		}

		// Prune IDs for sessions that left the list so they re-notify if they come back
		for (const id of notifiedIds.current) {
			if (!currentIds.has(id)) {
				notifiedIds.current.delete(id);
				toast.dismiss(id);
			}
		}
	}, [waitingSessions, navigate, soundEnabled, ralphSoundEnabled, ralphSessions]);
}
