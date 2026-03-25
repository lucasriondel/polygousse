import { ArrowDown, Bug, Check, Pause, Play, Trash2 } from "lucide-react";
import type { HookEvent } from "@polygousse/types";
import {
	ALL_EVENT_NAMES,
	EVENT_COLORS,
	EventBadge,
	formatTime,
	getEventDetail,
} from "@/components/debug/session-debug-shared";
import type { UseHookEventsReturn } from "@/hooks/use-hook-events";

// ── Event row ───────────────────────────────────────────────────────────

function EventRow({
	event,
	expanded,
	onToggle,
	compact,
	showSessionInfo,
}: {
	event: HookEvent;
	expanded: boolean;
	onToggle: () => void;
	compact?: boolean;
	showSessionInfo?: boolean;
}) {
	const detail = getEventDetail(event);
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
			<div className={`flex items-center ${compact ? "gap-2 px-2 py-1.5" : "gap-3 px-3 py-2"}`}>
				<span
					className={`shrink-0 ${compact ? "text-[10px]" : "text-xs"} text-muted-foreground font-mono`}
				>
					{formatTime(event.received_at)}
				</span>
				<EventBadge name={event.hook_event_name} />
				{event.notification_type && (
					<span
						className={`${compact ? "text-[10px]" : "text-xs"} text-muted-foreground`}
					>
						{event.notification_type}
					</span>
				)}
				{detail && !event.notification_type && (
					<span
						className={`${compact ? "text-[10px]" : "text-xs"} font-mono text-muted-foreground truncate max-w-[200px]`}
					>
						{detail}
					</span>
				)}
				{showSessionInfo && (
					<>
						<span
							className={`${compact ? "text-[10px]" : "text-xs"} text-muted-foreground font-mono truncate max-w-[120px]`}
						>
							{event.session_id?.slice(0, 8) ?? "—"}
						</span>
						<span
							className={`ml-auto ${compact ? "text-[10px]" : "text-xs"} text-muted-foreground truncate max-w-[200px]`}
						>
							{event.cwd}
						</span>
					</>
				)}
			</div>
			{event.message && (
				<p
					className={`${compact ? "px-2 pb-1.5 text-[10px]" : "px-3 pb-2 text-sm"} text-muted-foreground truncate`}
				>
					{event.message}
				</p>
			)}
			{expanded && (
				<pre
					className={`${compact ? "mx-2 mb-1.5 p-2 text-[10px]" : "mx-3 mb-2 p-3 text-xs"} rounded-md bg-muted overflow-x-auto whitespace-pre-wrap break-all cursor-text`}
					onClick={(e) => e.stopPropagation()}
				>
					{JSON.stringify(JSON.parse(event.raw_body), null, 2)}
				</pre>
			)}
		</div>
	);
}

// ── Main component ──────────────────────────────────────────────────────

interface HookEventListProps extends UseHookEventsReturn {
	compact?: boolean;
	showSessionInfo?: boolean;
}

export function HookEventList({
	filtered,
	filter,
	setFilter,
	hiddenEvents,
	toggleEvent,
	presentEventNames,
	paused,
	togglePause,
	handleClear,
	bufferCount,
	expandedIds,
	setExpandedIds,
	listRef,
	handleScroll,
	scrollToBottom,
	showScrollBtn,
	compact,
	showSessionInfo,
}: HookEventListProps) {
	return (
		<>
			{/* Toolbar */}
			<div
				className={`shrink-0 flex items-center ${compact ? "gap-1.5 px-2 py-1" : "gap-2 px-4 py-2"} border-b border-border`}
			>
				<input
					type="text"
					placeholder="Filter events..."
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					className={
						compact
							? "h-6 w-28 rounded border border-border bg-transparent px-1.5 text-[11px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
							: "h-8 rounded-md border border-border bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
					}
				/>
				<button
					type="button"
					onClick={togglePause}
					className={`inline-flex items-center gap-1 rounded border border-border transition-colors cursor-pointer ${compact ? "h-6 px-1.5 text-[11px]" : "h-8 gap-1.5 rounded-md px-3 text-sm"}`}
					title={paused ? "Resume" : "Pause"}
				>
					{paused ? (
						<Play className={compact ? "h-3 w-3 text-green-500" : "h-3.5 w-3.5 text-green-500"} />
					) : (
						<Pause
							className={compact ? "h-3 w-3 text-amber-500" : "h-3.5 w-3.5 text-amber-500"}
						/>
					)}
					{paused && bufferCount > 0 && (
						<span
							className={`${compact ? "text-[10px]" : "text-xs"} text-muted-foreground`}
						>
							({bufferCount})
						</span>
					)}
				</button>
				<button
					type="button"
					onClick={handleClear}
					className={`inline-flex items-center gap-1 rounded border border-border hover:bg-red-500/10 hover:text-red-500 transition-colors cursor-pointer ${compact ? "h-6 px-1.5 text-[11px]" : "h-8 gap-1.5 rounded-md px-3 text-sm"}`}
					title="Clear all events"
				>
					<Trash2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
				</button>
				<span
					className={`ml-auto ${compact ? "text-[10px]" : "text-xs"} text-muted-foreground`}
				>
					{filtered.length} event{filtered.length !== 1 ? "s" : ""}
				</span>
			</div>

			{/* Event type filter chips */}
			<div
				className={`shrink-0 flex flex-wrap items-center ${compact ? "gap-1 px-2 py-1" : "gap-1.5 px-4 py-2"} border-b border-border`}
			>
				{ALL_EVENT_NAMES.filter((name) => presentEventNames.has(name)).map((name) => {
					const checked = !hiddenEvents.has(name);
					const colors = EVENT_COLORS[name] ?? {
						bg: "bg-zinc-500/15",
						text: "text-zinc-400",
					};
					return (
						<button
							type="button"
							key={name}
							onClick={() => toggleEvent(name)}
							className={`inline-flex items-center gap-${compact ? "0.5" : "1"} rounded-full px-${compact ? "1.5" : "2"} py-0.5 ${compact ? "text-[10px]" : "text-xs"} font-medium transition-colors cursor-pointer border ${
								checked
									? `${colors.bg} ${colors.text} border-transparent`
									: "bg-transparent text-muted-foreground/40 border-transparent hover:text-muted-foreground"
							}`}
						>
							<Check
								className={`${compact ? "h-2.5 w-2.5" : "h-3 w-3"} ${checked ? "opacity-100" : "opacity-0"}`}
							/>
							{name}
						</button>
					);
				})}
			</div>

			{/* Event list */}
			<div className="relative flex-1 overflow-hidden">
				{filtered.length === 0 ? (
					<div className="flex h-full flex-col items-center justify-center text-center px-4">
						<Bug className={compact ? "h-8 w-8 text-red-400/50" : "h-12 w-12 text-red-400/50"} />
						<h2
							className={`${compact ? "mt-2 text-[11px]" : "mt-4 text-lg font-semibold"}`}
						>
							No hook events yet
						</h2>
						{!compact && (
							<p className="mt-1 text-sm text-muted-foreground">
								Hook events from Claude CLI sessions will appear here in real-time.
							</p>
						)}
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
								compact={compact}
								showSessionInfo={showSessionInfo}
							/>
						))}
					</div>
				)}

				{showScrollBtn && (
					<button
						type="button"
						onClick={scrollToBottom}
						className={`absolute ${compact ? "bottom-2 right-2" : "bottom-4 right-4"} inline-flex items-center gap-1 rounded-full border border-border bg-background shadow-md hover:bg-muted transition-colors cursor-pointer ${compact ? "h-6 px-2 text-[10px]" : "h-8 gap-1.5 px-3 text-xs"}`}
					>
						<ArrowDown className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
						{!compact && "Scroll to bottom"}
					</button>
				)}
			</div>
		</>
	);
}
