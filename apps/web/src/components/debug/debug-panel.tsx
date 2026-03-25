import {
	ArrowDown,
	ArrowDownLeft,
	ArrowUpRight,
	Check,
	GripVertical,
	Monitor,
	Pause,
	Play,
	Radio,
	Server,
	Smartphone,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebugPanel, type DebugTab } from "@/components/debug/debug-panel-context";
import {
	AgentSessionCard,
	CompletedSection,
	formatTime,
	StatusBadge,
	TerminalSessionCard,
	type AgentSession,
	type TerminalSessionDebug,
} from "@/components/debug/session-debug-shared";
import { useAppSocket } from "@/hooks/use-app-socket";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useSocketDebugEvents } from "@/hooks/use-socket-debug-events";
import type { SocketEvent } from "@/lib/api-events";
import { cn } from "@/lib/utils";
import { wsRequest } from "@/lib/ws-client";

// ── Constants ──────────────────────────────────────────────────────────

const STORAGE_KEY_WIDTH = "debug-panel-width";
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 280;

const TABS: { id: DebugTab; label: string }[] = [
	{ id: "sessions", label: "Sessions" },
	{ id: "agents", label: "Agents" },
	{ id: "socket", label: "Socket" },
];

// ── Socket event colors ────────────────────────────────────────────────

const SOCKET_EVENT_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
	"workspace:created": { bg: "bg-amber-500/15", text: "text-amber-500" },
	"workspace:updated": { bg: "bg-amber-500/15", text: "text-amber-500" },
	"workspace:deleted": { bg: "bg-amber-500/15", text: "text-amber-500" },
	"task:created": { bg: "bg-emerald-500/15", text: "text-emerald-500" },
	"task:updated": { bg: "bg-emerald-500/15", text: "text-emerald-500" },
	"task:deleted": { bg: "bg-emerald-500/15", text: "text-emerald-500" },
	"task:reordered": { bg: "bg-emerald-500/15", text: "text-emerald-500" },
	"folder:created": { bg: "bg-cyan-500/15", text: "text-cyan-500" },
	"folder:updated": { bg: "bg-cyan-500/15", text: "text-cyan-500" },
	"folder:deleted": { bg: "bg-cyan-500/15", text: "text-cyan-500" },
	"folder:reordered": { bg: "bg-cyan-500/15", text: "text-cyan-500" },
	"claude-session:created": { bg: "bg-violet-500/15", text: "text-violet-500" },
	"claude-session:updated": { bg: "bg-violet-500/15", text: "text-violet-500" },
	"terminal-session:created": { bg: "bg-purple-500/15", text: "text-purple-500" },
	"terminal-session:updated": { bg: "bg-purple-500/15", text: "text-purple-500" },
	"hook-event:raw": { bg: "bg-red-500/15", text: "text-red-400" },
	"task:attachment:created": { bg: "bg-emerald-500/15", text: "text-emerald-500" },
	"task:attachment:deleted": { bg: "bg-emerald-500/15", text: "text-emerald-500" },
	"ralph-session:created": { bg: "bg-orange-500/15", text: "text-orange-500" },
	"ralph-session:updated": { bg: "bg-orange-500/15", text: "text-orange-500" },
	"orchestrator:created": { bg: "bg-pink-500/15", text: "text-pink-500" },
	"orchestrator:updated": { bg: "bg-pink-500/15", text: "text-pink-500" },
	"setting:updated": { bg: "bg-zinc-500/15", text: "text-zinc-400" },
	"setting:deleted": { bg: "bg-zinc-500/15", text: "text-zinc-400" },
	"claude-usage:updated": { bg: "bg-violet-500/15", text: "text-violet-500" },
	"linear-task-link:created": { bg: "bg-indigo-500/15", text: "text-indigo-500" },
};

const DIRECTION_COLORS: Record<
	string,
	{ bg: string; text: string; icon: typeof ArrowDownLeft }
> = {
	in: { bg: "bg-green-500/15", text: "text-green-500", icon: ArrowDownLeft },
	out: { bg: "bg-blue-500/15", text: "text-blue-500", icon: ArrowUpRight },
};

// ── Main Panel ─────────────────────────────────────────────────────────

export function DebugPanel() {
	const { open, activeTab, setActiveTab } = useDebugPanel();
	const [width, setWidth] = useState(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY_WIDTH);
			if (stored) {
				const n = Number(stored);
				if (n >= MIN_WIDTH) return n;
			}
		} catch {}
		return DEFAULT_WIDTH;
	});
	const isDragging = useRef(false);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			isDragging.current = true;
			document.body.style.userSelect = "none";
			const startX = e.clientX;
			const startWidth = width;

			const onPointerMove = (ev: PointerEvent) => {
				if (!isDragging.current) return;
				const delta = startX - ev.clientX;
				const maxWidth = window.innerWidth * 0.5;
				const newWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth + delta));
				setWidth(newWidth);
			};

			const onPointerUp = () => {
				isDragging.current = false;
				document.body.style.userSelect = "";
				// Persist width
				try {
					localStorage.setItem(STORAGE_KEY_WIDTH, String(width));
				} catch {}
				document.removeEventListener("pointermove", onPointerMove);
				document.removeEventListener("pointerup", onPointerUp);
			};

			document.addEventListener("pointermove", onPointerMove);
			document.addEventListener("pointerup", onPointerUp);
		},
		[width],
	);

	// Persist width when it changes (debounced via drag end above, but also on unmount)
	useEffect(() => {
		return () => {
			try {
				localStorage.setItem(STORAGE_KEY_WIDTH, String(width));
			} catch {}
		};
	}, [width]);

	if (!open) return null;

	return (
		<div
			style={{ width }}
			className="shrink-0 border-l border-border bg-background flex flex-col h-full relative"
		>
			{/* Resize handle */}
			<div
				onPointerDown={handlePointerDown}
				className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors z-10 flex items-center justify-center group"
			>
				<GripVertical className="h-4 w-4 text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-colors" />
			</div>

			{/* Tab bar */}
			<div className="shrink-0 flex items-center border-b border-border">
				{TABS.map((tab) => (
					<button
						type="button"
						key={tab.id}
						onClick={() => setActiveTab(tab.id)}
						className={cn(
							"flex-1 px-3 py-2 text-xs font-medium transition-colors cursor-pointer",
							activeTab === tab.id
								? "text-foreground border-b-2 border-primary"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{tab.label}
					</button>
				))}
			</div>

			{/* Tab content */}
			<div className="flex-1 min-h-0 overflow-hidden">
				{activeTab === "sessions" && <TerminalSessionsTab />}
				{activeTab === "agents" && <AgentSessionsTab />}
				{activeTab === "socket" && <SocketEventsTab />}
			</div>
		</div>
	);
}

// ── Sessions Tab ───────────────────────────────────────────────────────

function TerminalSessionsTab() {
	const [active, setActive] = useState<TerminalSessionDebug[]>([]);
	const [completed, setCompleted] = useState<TerminalSessionDebug[]>([]);
	const [loading, setLoading] = useState(true);
	const { subscribe } = useAppSocket();
	const { workspaces } = useWorkspaces();
	const workspaceNameMap = new Map(workspaces.map((w) => [w.id, w.name]));

	const fetchData = useCallback(() => {
		wsRequest("session:debug", {})
			.then((data) => {
				setActive(data.active);
				setCompleted(data.completed);
			})
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	useEffect(() => {
		const unsub1 = subscribe("terminal-sessions:changed", fetchData);
		const unsub2 = subscribe("claude-sessions:changed", fetchData);
		const unsub3 = subscribe("hook-event:raw", fetchData);
		const unsub4 = subscribe("orchestrator:created", fetchData);
		const unsub5 = subscribe("orchestrator:updated", fetchData);
		return () => {
			unsub1();
			unsub2();
			unsub3();
			unsub4();
			unsub5();
		};
	}, [subscribe, fetchData]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full">
				<p className="text-xs text-muted-foreground">Loading sessions...</p>
			</div>
		);
	}

	if (active.length === 0 && completed.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center text-center px-4">
				<Monitor className="h-10 w-10 text-purple-400/50" />
				<h2 className="mt-3 text-sm font-semibold">No terminal sessions</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Sessions will appear here when tasks are running.
				</p>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto">
			<div className="p-3 flex flex-col gap-3">
				{active.map((ts) => (
					<TerminalSessionCard key={ts.id} terminal={ts} workspaceNameMap={workspaceNameMap} />
				))}
				{completed.length > 0 && <CompletedSection completed={completed} workspaceNameMap={workspaceNameMap} />}
			</div>
		</div>
	);
}

// ── Agents Tab ─────────────────────────────────────────────────────────

function AgentSessionsTab() {
	const [sessions, setSessions] = useState<
		{ agent: AgentSession; ralphSession: TerminalSessionDebug["ralphSession"] }[]
	>([]);
	const [loading, setLoading] = useState(true);
	const { subscribe } = useAppSocket();

	const fetchData = useCallback(() => {
		wsRequest("session:debug", {})
			.then((data) => {
				const all: { agent: AgentSession; ralphSession: TerminalSessionDebug["ralphSession"] }[] = [];
				for (const ts of [...data.active, ...data.completed]) {
					for (const as of ts.agentSessions) {
						all.push({ agent: as, ralphSession: ts.ralphSession });
					}
				}
				// Sort by started_at descending (newest first)
				all.sort(
					(a, b) =>
						new Date(b.agent.started_at).getTime() - new Date(a.agent.started_at).getTime(),
				);
				setSessions(all);
			})
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	useEffect(() => {
		const unsub1 = subscribe("terminal-sessions:changed", fetchData);
		const unsub2 = subscribe("claude-sessions:changed", fetchData);
		const unsub3 = subscribe("hook-event:raw", fetchData);
		return () => {
			unsub1();
			unsub2();
			unsub3();
		};
	}, [subscribe, fetchData]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full">
				<p className="text-xs text-muted-foreground">Loading agents...</p>
			</div>
		);
	}

	if (sessions.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center text-center px-4">
				<Monitor className="h-10 w-10 text-purple-400/50" />
				<h2 className="mt-3 text-sm font-semibold">No agent sessions</h2>
				<p className="mt-1 text-xs text-muted-foreground">
					Agent sessions will appear here when tasks are running.
				</p>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto">
			<div className="px-3 py-2 border-b border-border">
				<span className="text-xs text-muted-foreground">{sessions.length} agent sessions</span>
			</div>
			<div className="p-3 flex flex-col gap-3">
				{sessions.map(({ agent, ralphSession }) => (
					<AgentSessionCard key={agent.id} session={agent} ralphSession={ralphSession} />
				))}
			</div>
		</div>
	);
}

// ── Socket Events Tab ──────────────────────────────────────────────────

function SocketMessageBubble({
	event,
	expanded,
	onToggle,
}: {
	event: SocketEvent;
	expanded: boolean;
	onToggle: () => void;
}) {
	const isServer = event.direction === "in";
	const typeColors = SOCKET_EVENT_TYPE_COLORS[event.type] ?? {
		bg: "bg-zinc-500/15",
		text: "text-zinc-400",
	};

	return (
		<div
			className={cn(
				"flex gap-1.5 px-2",
				isServer ? "justify-start" : "justify-end",
			)}
		>
			{/* Server avatar */}
			{isServer && (
				<div className="shrink-0 mt-0.5">
					<div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/15">
						<Server className="h-2.5 w-2.5 text-green-500" />
					</div>
				</div>
			)}

			{/* Bubble */}
			<div
				role="button"
				tabIndex={0}
				onClick={onToggle}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onToggle();
					}
				}}
				className={cn(
					"max-w-[85%] rounded-lg px-2 py-1.5 cursor-pointer transition-colors",
					isServer
						? "bg-muted/60 hover:bg-muted rounded-tl-sm"
						: "bg-blue-500/10 hover:bg-blue-500/15 rounded-tr-sm",
				)}
			>
				<div className="flex items-center gap-1.5">
					<span
						className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeColors.bg} ${typeColors.text}`}
					>
						{event.type}
					</span>
				</div>
				{expanded && (
					<pre
						className="mt-1 rounded-md bg-background/60 p-1.5 text-[10px] overflow-x-auto whitespace-pre-wrap break-all cursor-text"
						onClick={(e) => e.stopPropagation()}
					>
						{JSON.stringify(event.payload, null, 2)}
					</pre>
				)}
				<div className={cn(
					"text-[9px] text-muted-foreground/60 font-mono mt-0.5",
					isServer ? "text-left" : "text-right",
				)}>
					{formatSocketTimestamp(event.timestamp)}
				</div>
			</div>

			{/* Client avatar */}
			{!isServer && (
				<div className="shrink-0 mt-0.5">
					<div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/15">
						<Smartphone className="h-2.5 w-2.5 text-blue-500" />
					</div>
				</div>
			)}
		</div>
	);
}

function formatSocketTimestamp(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		fractionalSecondDigits: 3,
	});
}

function SocketEventsTab() {
	const {
		filtered,
		paused,
		togglePause,
		handleClear,
		filter,
		setFilter,
		hiddenTypes,
		toggleType,
		presentTypes,
		expandedId,
		setExpandedId,
		directionFilter,
		setDirectionFilter,
		listRef,
		handleScroll,
		scrollToBottom,
		showScrollBtn,
		bufferRef,
	} = useSocketDebugEvents();

	return (
		<div className="flex h-full flex-col">
			{/* Toolbar */}
			<div className="shrink-0 flex items-center gap-1.5 border-b border-border px-2 py-1.5">
				<input
					type="text"
					placeholder="Filter..."
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					className="h-6 w-24 rounded border border-border bg-transparent px-1.5 text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
				/>
				{/* Direction filter */}
				<div className="flex items-center rounded border border-border">
					{(["all", "in", "out"] as const).map((dir) => (
						<button
							type="button"
							key={dir}
							onClick={() => setDirectionFilter(dir)}
							className={cn(
								"inline-flex h-6 items-center gap-0.5 px-1.5 text-[10px] font-medium transition-colors cursor-pointer first:rounded-l last:rounded-r",
								directionFilter === dir
									? "bg-muted text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{dir === "all" && "All"}
							{dir === "in" && (
								<>
									<ArrowDownLeft className="h-2.5 w-2.5 text-green-500" />
									In
								</>
							)}
							{dir === "out" && (
								<>
									<ArrowUpRight className="h-2.5 w-2.5 text-blue-500" />
									Out
								</>
							)}
						</button>
					))}
				</div>
				<button
					type="button"
					onClick={togglePause}
					className="inline-flex h-6 items-center gap-1 rounded border border-border px-1.5 text-[11px] hover:bg-muted transition-colors cursor-pointer"
					title={paused ? "Resume" : "Pause"}
				>
					{paused ? (
						<Play className="h-3 w-3 text-green-500" />
					) : (
						<Pause className="h-3 w-3 text-amber-500" />
					)}
					{paused && bufferRef.current.length > 0 && (
						<span className="text-[10px] text-muted-foreground">
							({bufferRef.current.length})
						</span>
					)}
				</button>
				<button
					type="button"
					onClick={handleClear}
					className="inline-flex h-6 items-center gap-1 rounded border border-border px-1.5 text-[11px] hover:bg-red-500/10 hover:text-red-500 transition-colors cursor-pointer"
					title="Clear"
				>
					<Trash2 className="h-3 w-3" />
				</button>
				<span className="ml-auto text-[10px] text-muted-foreground">
					{filtered.length}
				</span>
			</div>

			{/* Type filter chips */}
			{presentTypes.size > 0 && (
				<div className="shrink-0 flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
					{[...presentTypes].sort().map((type) => {
						const checked = !hiddenTypes.has(type);
						const colors = SOCKET_EVENT_TYPE_COLORS[type] ?? {
							bg: "bg-zinc-500/15",
							text: "text-zinc-400",
						};
						return (
							<button
								type="button"
								key={type}
								onClick={() => toggleType(type)}
								className={cn(
									"inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer border",
									checked
										? `${colors.bg} ${colors.text} border-transparent`
										: "bg-transparent text-muted-foreground/40 border-transparent hover:text-muted-foreground",
								)}
							>
								<Check className={`h-2.5 w-2.5 ${checked ? "opacity-100" : "opacity-0"}`} />
								{type}
							</button>
						);
					})}
				</div>
			)}

			{/* Conversation view */}
			<div className="relative flex-1 overflow-hidden">
				{filtered.length === 0 ? (
					<div className="flex h-full flex-col items-center justify-center text-center px-4">
						<Radio className="h-8 w-8 text-blue-400/50" />
						<p className="mt-2 text-xs text-muted-foreground">No socket events yet</p>
						<p className="mt-1 text-[10px] text-muted-foreground/60">
							<Server className="inline h-3 w-3 text-green-500" /> Server
							{" · "}
							<Smartphone className="inline h-3 w-3 text-blue-500" /> Client
						</p>
					</div>
				) : (
					<div ref={listRef} onScroll={handleScroll} className="h-full overflow-y-auto py-2 flex flex-col gap-1">
						{filtered.map((event) => (
							<SocketMessageBubble
								key={event.id}
								event={event}
								expanded={expandedId === event.id}
								onToggle={() =>
									setExpandedId(expandedId === event.id ? null : event.id)
								}
							/>
						))}
					</div>
				)}

				{showScrollBtn && (
					<button
						type="button"
						onClick={scrollToBottom}
						className="absolute bottom-2 right-2 inline-flex h-6 items-center gap-1 rounded-full border border-border bg-background px-2 text-[10px] shadow-md hover:bg-muted transition-colors cursor-pointer"
					>
						<ArrowDown className="h-3 w-3" />
					</button>
				)}
			</div>
		</div>
	);
}
