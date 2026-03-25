import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowLeft, Check, Pause, Play, Radio, Terminal, Trash2 } from "lucide-react";
import {
	AgentSessionCard,
	formatTime,
	OrchestratorAccordion,
	StatusBadge,
} from "@/components/debug/session-debug-shared";
import { type DisplayEvent, useSessionDebugEvents } from "@/hooks/use-session-debug-events";

// ── Exported constants ──────────────────────────────────────────────────

export type { DisplayEvent };

export const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
	"claude-session:created": { bg: "bg-violet-500/15", text: "text-violet-500" },
	"claude-session:updated": { bg: "bg-violet-500/15", text: "text-violet-500" },
	"terminal-session:created": {
		bg: "bg-purple-500/15",
		text: "text-purple-500",
	},
	"terminal-session:updated": {
		bg: "bg-purple-500/15",
		text: "text-purple-500",
	},
	"hook-event:raw": { bg: "bg-red-500/15", text: "text-red-400" },
	"task:updated": { bg: "bg-emerald-500/15", text: "text-emerald-500" },
};

// ── Exported helpers ────────────────────────────────────────────────────

export function TypeBadge({ type }: { type: string }) {
	const colors = EVENT_TYPE_COLORS[type] ?? {
		bg: "bg-zinc-500/15",
		text: "text-zinc-400",
	};
	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
		>
			{type}
		</span>
	);
}

export function formatTimestamp(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		fractionalSecondDigits: 3,
	});
}

export function getEventSummary(event: DisplayEvent): string | null {
	const p = event.payload as Record<string, unknown> | null;
	if (!p) return null;
	if (p.session && typeof p.session === "object") {
		const s = p.session as Record<string, unknown>;
		return `${s.id}`.slice(0, 12);
	}
	if (p.task && typeof p.task === "object") {
		const t = p.task as Record<string, unknown>;
		return `${t.title ?? t.id}`;
	}
	if (p.event && typeof p.event === "object") {
		const e = p.event as Record<string, unknown>;
		return `${e.hook_event_name ?? ""}`;
	}
	return null;
}

// ── Exported event row ──────────────────────────────────────────────────

export function EventRow({
	event,
	expanded,
	onToggle,
}: {
	event: DisplayEvent;
	expanded: boolean;
	onToggle: () => void;
}) {
	const summary = getEventSummary(event);

	return (
		<div
			role="button"
			tabIndex={0}
			className="border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors"
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onToggle();
				}
			}}
			onClick={onToggle}
		>
			<div className="flex items-center gap-3 px-3 py-2">
				<span className="shrink-0 text-xs text-muted-foreground font-mono">
					{formatTimestamp(event.timestamp)}
				</span>
				{event.source === "live" && (
					<span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-green-500/15 text-green-500">
						LIVE
					</span>
				)}
				<TypeBadge type={event.type} />
				{summary && (
					<span className="text-xs font-mono text-muted-foreground truncate max-w-[300px]">
						{summary}
					</span>
				)}
			</div>
			{expanded && (
				<pre
					className="mx-3 mb-2 rounded-md bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all cursor-text"
					onClick={(e) => e.stopPropagation()}
				>
					{JSON.stringify(event.payload, null, 2)}
				</pre>
			)}
		</div>
	);
}

// ── Main page ──────────────────────────────────────────────────────────

interface SessionDebugPageProps {
	sessionId: string;
	workspaceId: string;
}

export function SessionDebugPage({ sessionId, workspaceId }: SessionDebugPageProps) {
	const {
		session,
		filtered,
		paused,
		togglePause,
		handleClear,
		filter,
		setFilter,
		hiddenTypes,
		toggleType,
		presentTypes,
		expandedIds,
		setExpandedIds,
		listRef,
		handleScroll,
		scrollToBottom,
		showScrollBtn,
		loading,
		error,
		bufferRef,
	} = useSessionDebugEvents(sessionId);

	if (loading) {
		return (
			<div className="mx-auto max-w-2xl px-4 py-16 text-center">
				<p className="text-muted-foreground">Loading session debug...</p>
			</div>
		);
	}

	if (error || !session) {
		return (
			<div className="mx-auto max-w-2xl px-4 py-16 text-center">
				<p className="text-red-500">{error ?? "Session not found"}</p>
				<Link
					to="/workspaces/$workspaceId/sessions/$sessionId"
					params={{ workspaceId, sessionId }}
					className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="size-4" />
					Back to session
				</Link>
			</div>
		);
	}

	return (
		<div className="flex h-[calc(100vh-3rem)] flex-col">
			{/* Header */}
			<div className="shrink-0 border-b border-border px-5 py-4">
				<div className="flex items-center gap-3">
					<Link
						to="/workspaces/$workspaceId/sessions/$sessionId"
						params={{ workspaceId, sessionId }}
						className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						<ArrowLeft className="size-4" />
					</Link>
					<Terminal className="size-5 shrink-0 text-purple-400" />
					<div className="flex items-center gap-2 min-w-0">
						{session.taskTitle && (
							<span className="text-sm font-medium truncate">{session.taskTitle}</span>
						)}
						<span className="font-mono text-xs text-muted-foreground">
							{session.id.slice(0, 8)}
						</span>
						<StatusBadge status={session.status} />
					</div>
					<div className="ml-auto flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
						<span className="truncate max-w-[300px]">{session.cwd}</span>
						<span>Started {formatTime(session.started_at)}</span>
						{session.ended_at && <span>Ended {formatTime(session.ended_at)}</span>}
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
				{/* Agent Sessions (collapsible) */}
				{session.agentSessions.length > 0 && (
					<div className="shrink-0 border-b border-border p-4 overflow-y-auto max-h-[40vh]">
						<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
							Agent Sessions ({session.agentSessions.length})
						</span>
						<div className="flex flex-col gap-3 mt-3">
							{session.agentSessions.map((as) => {
								const isOrchestratorPlan =
									!!session.orchestrator && session.orchestrator.planClaudeSessionId === as.id;
								return (
									<div key={as.id} className="flex flex-col">
										<AgentSessionCard
											session={as}
											ralphSession={session.ralphSession}
											hasOrchestratorBelow={isOrchestratorPlan}
										/>
										{isOrchestratorPlan && <OrchestratorAccordion state={session.orchestrator!} />}
									</div>
								);
							})}
						</div>
					</div>
				)}

				{/* Session Events toolbar */}
				<div className="shrink-0 flex items-center gap-2 border-b border-border px-4 py-2">
					<input
						type="text"
						placeholder="Filter events..."
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						className="h-8 rounded-md border border-border bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					/>
					<button
						type="button"
						onClick={togglePause}
						className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted transition-colors cursor-pointer"
						title={paused ? "Resume" : "Pause"}
					>
						{paused ? (
							<Play className="h-3.5 w-3.5 text-green-500" />
						) : (
							<Pause className="h-3.5 w-3.5 text-amber-500" />
						)}
						{paused && bufferRef.current.length > 0 && (
							<span className="text-xs text-muted-foreground">({bufferRef.current.length})</span>
						)}
					</button>
					<button
						type="button"
						onClick={handleClear}
						className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-red-500/10 hover:text-red-500 transition-colors cursor-pointer"
						title="Clear all events"
					>
						<Trash2 className="h-3.5 w-3.5" />
					</button>
					<span className="ml-auto text-xs text-muted-foreground">
						{filtered.length} event{filtered.length !== 1 ? "s" : ""}
					</span>
				</div>

				{/* Type filter chips */}
				{presentTypes.size > 0 && (
					<div className="shrink-0 flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2">
						{[...presentTypes].sort().map((type) => {
							const checked = !hiddenTypes.has(type);
							const colors = EVENT_TYPE_COLORS[type] ?? {
								bg: "bg-zinc-500/15",
								text: "text-zinc-400",
							};
							return (
								<button
									type="button"
									key={type}
									onClick={() => toggleType(type)}
									className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer border ${
										checked
											? `${colors.bg} ${colors.text} border-transparent`
											: "bg-transparent text-muted-foreground/40 border-transparent hover:text-muted-foreground"
									}`}
								>
									<Check className={`h-3 w-3 ${checked ? "opacity-100" : "opacity-0"}`} />
									{type}
								</button>
							);
						})}
					</div>
				)}

				{/* Event list */}
				<div className="relative flex-1 overflow-hidden">
					{filtered.length === 0 ? (
						<div className="flex h-full flex-col items-center justify-center text-center">
							<Radio className="h-12 w-12 text-purple-400/50" />
							<h2 className="mt-4 text-lg font-semibold">No session events yet</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								Historical and real-time events for this session will appear here.
							</p>
						</div>
					) : (
						<div ref={listRef} onScroll={handleScroll} className="h-full overflow-y-auto">
							{filtered.map((event) => (
								<EventRow
									key={event.id}
									event={event}
									expanded={expandedIds.has(event.id)}
									onToggle={() =>
										setExpandedIds((prev) => {
											const next = new Set(prev);
											if (next.has(event.id)) next.delete(event.id);
											else next.add(event.id);
											return next;
										})
									}
								/>
							))}
						</div>
					)}

					{showScrollBtn && (
						<button
							type="button"
							onClick={scrollToBottom}
							className="absolute bottom-4 right-4 inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs shadow-md hover:bg-muted transition-colors cursor-pointer"
						>
							<ArrowDown className="h-3.5 w-3.5" />
							Scroll to bottom
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
