import { Link } from "@tanstack/react-router";
import {
	Bot,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Circle,
	FileText,
	Loader2,
	Square,
	XCircle,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { wsRequest } from "@/lib/ws-client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { OrchestratorState, OrchestratorStepStatus } from "@/store/types";

// ── Types ──────────────────────────────────────────────────────────────

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

export interface AgentSession {
	id: string;
	workspace_id: number | null;
	status: string;
	cwd: string;
	message: string | null;
	terminal_session_id: string | null;
	last_event: string;
	last_event_at: string;
	started_at: string;
	ended_at: string | null;
	ralphIteration: number | null;
	hookEvents: HookEvent[];
}

export interface TerminalSessionDebug {
	id: string;
	workspace_id: number | null;
	cwd: string;
	status: string;
	taskTitle: string | null;
	ralphSession: {
		id: string;
		max_iterations: number;
		current_iteration: number;
		status: string;
	} | null;
	orchestrator: OrchestratorState | null;
	started_at: string;
	ended_at: string | null;
	agentSessions: AgentSession[];
}

// ── Constants ──────────────────────────────────────────────────────────

export const ALL_EVENT_NAMES = [
	"SessionStart",
	"UserPromptSubmit",
	"PreToolUse",
	"PermissionRequest",
	"PostToolUse",
	"PostToolUseFailure",
	"Notification",
	"SubagentStart",
	"SubagentStop",
	"Stop",
	"TeammateIdle",
	"TaskCompleted",
	"PreCompact",
	"SessionEnd",
] as const;

export const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
	SessionStart: { bg: "bg-green-500/15", text: "text-green-500" },
	UserPromptSubmit: { bg: "bg-blue-500/15", text: "text-blue-500" },
	PreToolUse: { bg: "bg-cyan-500/15", text: "text-cyan-500" },
	PermissionRequest: { bg: "bg-orange-500/15", text: "text-orange-500" },
	PostToolUse: { bg: "bg-teal-500/15", text: "text-teal-500" },
	PostToolUseFailure: { bg: "bg-rose-500/15", text: "text-rose-500" },
	Notification: { bg: "bg-amber-500/15", text: "text-amber-500" },
	SubagentStart: { bg: "bg-violet-500/15", text: "text-violet-500" },
	SubagentStop: { bg: "bg-purple-500/15", text: "text-purple-500" },
	Stop: { bg: "bg-red-500/15", text: "text-red-500" },
	TeammateIdle: { bg: "bg-indigo-500/15", text: "text-indigo-500" },
	TaskCompleted: { bg: "bg-emerald-500/15", text: "text-emerald-500" },
	PreCompact: { bg: "bg-sky-500/15", text: "text-sky-500" },
	SessionEnd: { bg: "bg-zinc-500/15", text: "text-zinc-400" },
};

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
	active: { bg: "bg-green-500/15", text: "text-green-500" },
	preparing: { bg: "bg-blue-500/15", text: "text-blue-500" },
	ongoing: { bg: "bg-cyan-500/15", text: "text-cyan-500" },
	idle: { bg: "bg-amber-500/15", text: "text-amber-500" },
	waiting_input: { bg: "bg-orange-500/15", text: "text-orange-500" },
	error: { bg: "bg-red-500/15", text: "text-red-500" },
	limit_hit: { bg: "bg-orange-500/15", text: "text-orange-500" },
	auth_expired: { bg: "bg-red-500/15", text: "text-red-500" },
	completed: { bg: "bg-zinc-500/15", text: "text-zinc-400" },
};

// ── Utilities ──────────────────────────────────────────────────────────

export function formatTime(dateStr: string): string {
	const d = new Date(`${dateStr}Z`);
	return d.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

export function getEventDetail(event: HookEvent): string | null {
	try {
		const body = JSON.parse(event.raw_body);
		switch (event.hook_event_name) {
			case "PreToolUse":
			case "PostToolUse":
			case "PostToolUseFailure":
			case "PermissionRequest":
				return body.tool_name ?? null;
			case "SubagentStart":
			case "SubagentStop":
				return body.agent_type ?? null;
			case "UserPromptSubmit":
				return body.prompt
					? body.prompt.length > 60
						? `${body.prompt.slice(0, 60)}...`
						: body.prompt
					: null;
			case "TaskCompleted":
				return body.task_subject ?? null;
			case "TeammateIdle":
				return body.teammate_name ?? null;
			case "PreCompact":
				return body.trigger ?? null;
			case "SessionStart":
				return body.source ?? null;
			case "SessionEnd":
				return body.reason ?? null;
			default:
				return null;
		}
	} catch {
		return null;
	}
}

// ── Components ─────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
	const colors = STATUS_COLORS[status] ?? {
		bg: "bg-zinc-500/15",
		text: "text-zinc-400",
	};
	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
		>
			{status}
		</span>
	);
}

export function EventBadge({ name }: { name: string }) {
	const colors = EVENT_COLORS[name] ?? {
		bg: "bg-zinc-500/15",
		text: "text-zinc-400",
	};
	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
		>
			{name}
		</span>
	);
}

export function HookEventRow({ event }: { event: HookEvent }) {
	const [expanded, setExpanded] = useState(false);
	const detail = getEventDetail(event);
	return (
		<div
			role="button"
			tabIndex={0}
			className="border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors"
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					setExpanded(!expanded);
				}
			}}
			onClick={() => setExpanded(!expanded)}
		>
			<div className="flex items-center gap-3 px-3 py-1.5">
				<span className="shrink-0 text-xs text-muted-foreground font-mono">
					{formatTime(event.received_at)}
				</span>
				<EventBadge name={event.hook_event_name} />
				{detail && (
					<span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">
						{detail}
					</span>
				)}
				{event.message && !detail && (
					<span className="text-xs text-muted-foreground truncate max-w-[300px]">
						{event.message}
					</span>
				)}
			</div>
			{expanded && (
				<pre
					className="mx-3 mb-2 rounded-md bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all cursor-text"
					onClick={(e) => e.stopPropagation()}
				>
					{JSON.stringify(JSON.parse(event.raw_body), null, 2)}
				</pre>
			)}
		</div>
	);
}

export function EventFilter({
	events,
	hiddenEvents,
	onToggle,
}: {
	events: HookEvent[];
	hiddenEvents: Set<string>;
	onToggle: (name: string) => void;
}) {
	const presentEventNames = useMemo(() => {
		const names = new Set<string>();
		for (const e of events) names.add(e.hook_event_name);
		return names;
	}, [events]);

	const visible = ALL_EVENT_NAMES.filter((name) => presentEventNames.has(name));

	if (visible.length === 0) return null;

	return (
		<div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-border">
			{visible.map((name) => {
				const checked = !hiddenEvents.has(name);
				const colors = EVENT_COLORS[name] ?? {
					bg: "bg-zinc-500/15",
					text: "text-zinc-400",
				};
				return (
					<button
						type="button"
						key={name}
						onClick={(e) => {
							e.stopPropagation();
							onToggle(name);
						}}
						className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer border ${
							checked
								? `${colors.bg} ${colors.text} border-transparent`
								: "bg-transparent text-muted-foreground/40 border-transparent hover:text-muted-foreground"
						}`}
					>
						<Check className={`h-3 w-3 ${checked ? "opacity-100" : "opacity-0"}`} />
						{name}
					</button>
				);
			})}
		</div>
	);
}

// ── Orchestrator Panel ──────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
	wait_for_exit_plan_mode: "Wait for ExitPlanMode",
	extract_plan: "Extract plan",
	write_prd: "Write PRD",
	stop_plan_session: "Stop plan session",
	wait_for_session_end: "Wait for session end",
	pause_for_shell: "Pause for shell",
	start_ralph_loop: "Start Ralph loop",
	send_commit: "Send commit",
	wait_for_commit_stop: "Wait for commit to finish",
	complete_task: "Complete task",
};

const ORCHESTRATOR_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
	running: { bg: "bg-blue-500/15", text: "text-blue-500" },
	completed: { bg: "bg-green-500/15", text: "text-green-500" },
	error: { bg: "bg-red-500/15", text: "text-red-500" },
};

function StepIcon({ status }: { status: OrchestratorStepStatus }) {
	switch (status) {
		case "pending":
			return <Circle className="size-3.5 text-muted-foreground/40" />;
		case "active":
			return <Loader2 className="size-3.5 text-blue-500 animate-spin" />;
		case "completed":
			return <CheckCircle2 className="size-3.5 text-green-500" />;
		case "error":
			return <XCircle className="size-3.5 text-red-500" />;
	}
}

export function OrchestratorPanel({ state }: { state: OrchestratorState }) {
	const colors = ORCHESTRATOR_STATUS_COLORS[state.status] ?? {
		bg: "bg-zinc-500/15",
		text: "text-zinc-400",
	};

	return (
		<div className="rounded-lg border border-border bg-card overflow-hidden">
			<div className="px-4 py-3 flex items-center gap-3 border-b border-border">
				<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Orchestrator
				</span>
				<span
					className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
				>
					{state.status}
				</span>
				<div className="ml-auto flex items-center gap-2">
					{state.planClaudeSessionId && (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
										plan {state.planClaudeSessionId.slice(0, 8)}
									</span>
								</TooltipTrigger>
								<TooltipContent>
									<span className="font-mono text-xs">
										Plan session: {state.planClaudeSessionId}
									</span>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					)}
					{state.ralphSessionId && (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
										ralph {state.ralphSessionId.slice(0, 8)}
									</span>
								</TooltipTrigger>
								<TooltipContent>
									<span className="font-mono text-xs">Ralph session: {state.ralphSessionId}</span>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					)}
				</div>
			</div>

			<div className="px-4 py-3 flex flex-col gap-1">
				{state.steps.map((step, _i) => (
					<div
						key={step.name}
						className={cn(
							"flex items-start gap-2.5 py-1 rounded-md px-2 -mx-2",
							step.status === "active" && "bg-blue-500/5",
						)}
					>
						<div className="mt-0.5 shrink-0">
							<StepIcon status={step.status} />
						</div>
						<div className="flex flex-col gap-0.5 min-w-0">
							<span
								className={cn(
									"text-xs font-medium",
									step.status === "pending" && "text-muted-foreground/50",
									step.status === "active" && "text-blue-500",
									step.status === "completed" && "text-foreground",
									step.status === "error" && "text-red-500",
								)}
							>
								{STEP_LABELS[step.name] ?? step.name}
							</span>
							{step.detail && (
								<span className="text-xs text-muted-foreground truncate">{step.detail}</span>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function OrchestratorAccordion({ state }: { state: OrchestratorState }) {
	const [open, setOpen] = useState(true);
	const colors = ORCHESTRATOR_STATUS_COLORS[state.status] ?? {
		bg: "bg-zinc-500/15",
		text: "text-zinc-400",
	};

	return (
		<div className="border border-t-0 border-border bg-card rounded-b-lg -mt-px overflow-hidden">
			<div
				role="button"
				tabIndex={0}
				className="px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors"
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						setOpen(!open);
					}
				}}
				onClick={() => setOpen(!open)}
			>
				<ChevronRight
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-90",
					)}
				/>
				<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Orchestrator
				</span>
				<span
					className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
				>
					{state.status}
				</span>
				<div className="ml-auto flex items-center gap-2">
					{state.ralphSessionId && (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
										ralph {state.ralphSessionId.slice(0, 8)}
									</span>
								</TooltipTrigger>
								<TooltipContent>
									<span className="font-mono text-xs">Ralph session: {state.ralphSessionId}</span>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					)}
				</div>
			</div>

			{open && (
				<div className="px-4 py-2 border-t border-border flex flex-col gap-1">
					{state.steps.map((step) => (
						<div
							key={step.name}
							className={cn(
								"flex items-start gap-2.5 py-1 rounded-md px-2 -mx-2",
								step.status === "active" && "bg-blue-500/5",
							)}
						>
							<div className="mt-0.5 shrink-0">
								<StepIcon status={step.status} />
							</div>
							<div className="flex flex-col gap-0.5 min-w-0">
								<span
									className={cn(
										"text-xs font-medium",
										step.status === "pending" && "text-muted-foreground/50",
										step.status === "active" && "text-blue-500",
										step.status === "completed" && "text-foreground",
										step.status === "error" && "text-red-500",
									)}
								>
									{STEP_LABELS[step.name] ?? step.name}
								</span>
								{step.detail && (
									<span className="text-xs text-muted-foreground truncate">{step.detail}</span>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function AgentSessionCard({
	session,
	ralphSession,
	hasOrchestratorBelow,
}: {
	session: AgentSession;
	ralphSession?: {
		id: string;
		max_iterations: number;
		current_iteration: number;
		status: string;
	} | null;
	hasOrchestratorBelow?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [hiddenEvents, setHiddenEvents] = useState<Set<string>>(
		() => new Set(["PreToolUse", "PostToolUse"]),
	);

	const sortedEvents = useMemo(
		() =>
			[...session.hookEvents].sort(
				(a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
			),
		[session.hookEvents],
	);

	const filteredEvents = useMemo(
		() => sortedEvents.filter((e) => !hiddenEvents.has(e.hook_event_name)),
		[sortedEvents, hiddenEvents],
	);

	const toggleEvent = useCallback((name: string) => {
		setHiddenEvents((prev) => {
			const next = new Set(prev);
			if (next.has(name)) {
				next.delete(name);
			} else {
				next.add(name);
			}
			return next;
		});
	}, []);

	return (
		<div
			className={cn(
				"rounded-lg border border-border bg-card overflow-hidden",
				hasOrchestratorBelow && "rounded-b-none",
			)}
		>
			<div
				role="button"
				tabIndex={0}
				className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3 cursor-pointer"
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						setOpen(!open);
					}
				}}
				onClick={() => setOpen(!open)}
			>
				<Bot className="size-4 shrink-0 text-muted-foreground" />
				<span className="font-mono text-xs">{session.id.slice(0, 8)}</span>
				<StatusBadge status={session.status} />
				{session.ralphIteration != null && ralphSession && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-violet-500/15 text-violet-500 font-mono tabular-nums">
									ralph {session.ralphIteration}/{ralphSession.max_iterations}
								</span>
							</TooltipTrigger>
							<TooltipContent>
								<span className="font-mono">{ralphSession.id}</span>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
				<EventBadge name={session.last_event} />
				<span className="text-xs text-muted-foreground ml-auto">
					{formatTime(session.started_at)}
				</span>
				<Link
					to="/transcript/$sessionId"
					params={{ sessionId: session.id }}
					search={{ cwd: session.cwd }}
					className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground bg-muted hover:bg-muted/80 transition-colors"
					onClick={(e) => e.stopPropagation()}
				>
					<FileText className="size-3.5" />
					Transcript
				</Link>
				<ChevronDown
					className={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
				/>
			</div>

			{open && (
				<div className="border-t border-border">
					<EventFilter events={sortedEvents} hiddenEvents={hiddenEvents} onToggle={toggleEvent} />
					{filteredEvents.length === 0 ? (
						<p className="text-xs text-muted-foreground px-4 py-3">No hook events</p>
					) : (
						<div className="border-t border-border">
							{filteredEvents.map((event) => (
								<HookEventRow key={event.id} event={event} />
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ── Compact Agent Row (for table inside TerminalSessionCard) ───────────

export function AgentSessionRow({
	session,
}: {
	session: AgentSession;
}) {
	const [open, setOpen] = useState(false);
	const [hiddenEvents, setHiddenEvents] = useState<Set<string>>(
		() => new Set(["PreToolUse", "PostToolUse"]),
	);

	const statusColors = STATUS_COLORS[session.status] ?? {
		bg: "bg-zinc-500/15",
		text: "text-zinc-400",
	};
	const eventColors = EVENT_COLORS[session.last_event] ?? {
		bg: "bg-zinc-500/15",
		text: "text-zinc-400",
	};

	const sortedEvents = useMemo(
		() =>
			[...session.hookEvents].sort(
				(a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
			),
		[session.hookEvents],
	);

	const filteredEvents = useMemo(
		() => sortedEvents.filter((e) => !hiddenEvents.has(e.hook_event_name)),
		[sortedEvents, hiddenEvents],
	);

	const toggleEvent = useCallback((name: string) => {
		setHiddenEvents((prev) => {
			const next = new Set(prev);
			if (next.has(name)) next.delete(name);
			else next.add(name);
			return next;
		});
	}, []);

	return (
		<div className="border-t border-border first:border-t-0">
			<div
				role="button"
				tabIndex={0}
				className="flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-muted/50 transition-colors cursor-pointer"
				onClick={() => setOpen(!open)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						setOpen(!open);
					}
				}}
			>
				<span className="font-mono text-muted-foreground shrink-0">{session.id.slice(0, 8)}</span>
				<span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusColors.bg} ${statusColors.text}`}>
					{session.status}
				</span>
				<span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${eventColors.bg} ${eventColors.text}`}>
					{session.last_event}
				</span>
				<span className="ml-auto font-mono text-muted-foreground shrink-0">
					{formatTime(session.started_at)}
				</span>
				<Link
					to="/transcript/$sessionId"
					params={{ sessionId: session.id }}
					search={{ cwd: session.cwd }}
					className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground bg-muted hover:bg-muted/80 transition-colors"
					onClick={(e) => e.stopPropagation()}
				>
					<FileText className="size-3" />
				</Link>
				<ChevronDown
					className={cn(
						"size-3 shrink-0 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
				/>
			</div>

			{open && (
				<div className="border-t border-border bg-background">
					<EventFilter events={sortedEvents} hiddenEvents={hiddenEvents} onToggle={toggleEvent} />
					{filteredEvents.length === 0 ? (
						<p className="text-[11px] text-muted-foreground px-3 py-2">No hook events</p>
					) : (
						<div className="border-t border-border">
							{filteredEvents.map((event) => (
								<HookEventRow key={event.id} event={event} />
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ── Terminal Session Card (compact) ────────────────────────────────────

export function TerminalSessionCard({ terminal, workspaceNameMap }: { terminal: TerminalSessionDebug; workspaceNameMap?: Map<number, string> }) {
	const [terminating, setTerminating] = useState(false);

	const handleTerminate = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		setTerminating(true);
		try {
			await wsRequest("session:complete-task", {
				sessionId: terminal.id,
			});
		} catch {
			// Session may already be dead or task unlinked
		} finally {
			setTerminating(false);
		}
	}, [terminal.id]);

	const statusColors = STATUS_COLORS[terminal.status] ?? {
		bg: "bg-zinc-500/15",
		text: "text-zinc-400",
	};

	return (
		<div className="rounded-lg border border-border bg-card overflow-hidden">
			{/* Terminal header row */}
			<div className="flex items-center gap-2 px-3 py-2">
				{terminal.workspace_id != null && (
					<>
						<span className="text-xs text-muted-foreground truncate max-w-[100px]">
							{workspaceNameMap?.get(terminal.workspace_id) ?? `#${terminal.workspace_id}`}
						</span>
						<span className="text-xs text-muted-foreground/50">&gt;</span>
					</>
				)}
				<span className="text-xs font-medium truncate min-w-0">
					{terminal.taskTitle ?? terminal.id.slice(0, 8)}
				</span>
				<span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusColors.bg} ${statusColors.text}`}>
					{terminal.status}
				</span>
				<span className="ml-auto font-mono text-[11px] text-muted-foreground shrink-0">
					{formatTime(terminal.started_at)}
				</span>
				{terminal.status === "active" && (
					<button
						type="button"
						onClick={handleTerminate}
						disabled={terminating}
						className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer disabled:opacity-50"
					>
						<Square className="size-2.5" />
						{terminating ? "..." : "Stop"}
					</button>
				)}
			</div>

			{/* Agent session rows */}
			{terminal.agentSessions.length > 0 && (
				<div className="border-t border-border bg-muted/30">
					{terminal.agentSessions.map((as) => (
						<AgentSessionRow key={as.id} session={as} />
					))}
				</div>
			)}

			{/* Orchestrator accordion if present */}
			{terminal.orchestrator && (
				<OrchestratorAccordion state={terminal.orchestrator} />
			)}
		</div>
	);
}

// ── Completed Section ──────────────────────────────────────────────────

export function CompletedSection({ completed, workspaceNameMap }: { completed: TerminalSessionDebug[]; workspaceNameMap?: Map<number, string> }) {
	return (
		<div className="opacity-50">
			{completed.map((ts) => <TerminalSessionCard key={ts.id} terminal={ts} workspaceNameMap={workspaceNameMap} />)}
		</div>
	);
}
