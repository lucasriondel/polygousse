import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppSocket } from "@/hooks/use-app-socket";
import {
	clearStoredEvents,
	getNextEventId,
	getStoredEvents,
	pushEvent,
	subscribeToEventStore,
	type SocketEvent,
} from "@/lib/api-events";

// ── Constants ──────────────────────────────────────────────────────────

const SOCKET_EVENT_TYPES = [
	"workspace:created",
	"workspace:updated",
	"workspace:deleted",
	"task:created",
	"task:updated",
	"task:deleted",
	"task:reordered",
	"task:attachment:created",
	"task:attachment:deleted",
	"folder:created",
	"folder:updated",
	"folder:deleted",
	"folder:reordered",
	"claude-session:created",
	"claude-session:updated",
	"terminal-session:created",
	"terminal-session:updated",
	"hook-event:raw",
	"ralph-session:created",
	"ralph-session:updated",
	"orchestrator:created",
	"orchestrator:updated",
	"setting:updated",
	"setting:deleted",
	"claude-usage:updated",
	"linear-task-link:created",
];

// ── Hook ───────────────────────────────────────────────────────────────

export function useSocketDebugEvents() {
	const [events, setEvents] = useState<SocketEvent[]>(getStoredEvents);
	const [filter, setFilter] = useState("");
	const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(() => new Set());
	const [directionFilter, setDirectionFilter] = useState<"all" | "in" | "out">("all");
	const [paused, setPaused] = useState(false);
	const [expandedId, setExpandedId] = useState<number | null>(null);
	const [autoScroll, setAutoScroll] = useState(true);
	const [showScrollBtn, setShowScrollBtn] = useState(false);

	const pausedRef = useRef(false);
	const bufferRef = useRef<SocketEvent[]>([]);
	const listRef = useRef<HTMLDivElement>(null);
	const { subscribe } = useAppSocket();

	// Sync from module-level store (picks up outgoing events too)
	useEffect(() => {
		return subscribeToEventStore(() => {
			if (!pausedRef.current) {
				setEvents(getStoredEvents());
			}
		});
	}, []);

	// Subscribe to ALL incoming WS event types
	useEffect(() => {
		const unsubs = SOCKET_EVENT_TYPES.map((type) =>
			subscribe(type, (data: unknown) => {
				const event: SocketEvent = {
					id: getNextEventId(),
					direction: "in",
					type,
					payload: data,
					timestamp: Date.now(),
				};
				if (pausedRef.current) {
					bufferRef.current.push(event);
				} else {
					pushEvent(event);
				}
			}),
		);

		return () => {
			for (const unsub of unsubs) unsub();
		};
	}, [subscribe]);

	// Auto-scroll to bottom
	useEffect(() => {
		if (autoScroll && listRef.current) {
			listRef.current.scrollTop = listRef.current.scrollHeight;
		}
	}, [autoScroll]);

	// Detect manual scroll
	const handleScroll = useCallback(() => {
		const el = listRef.current;
		if (!el) return;
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
		setAutoScroll(atBottom);
		setShowScrollBtn(!atBottom);
	}, []);

	const scrollToBottom = useCallback(() => {
		if (listRef.current) {
			listRef.current.scrollTop = listRef.current.scrollHeight;
			setAutoScroll(true);
			setShowScrollBtn(false);
		}
	}, []);

	const togglePause = useCallback(() => {
		if (pausedRef.current) {
			for (const ev of bufferRef.current) pushEvent(ev);
			bufferRef.current = [];
			pausedRef.current = false;
			setPaused(false);
		} else {
			pausedRef.current = true;
			setPaused(true);
		}
	}, []);

	const handleClear = useCallback(() => {
		clearStoredEvents();
		bufferRef.current = [];
	}, []);

	const toggleType = useCallback((name: string) => {
		setHiddenTypes((prev) => {
			const next = new Set(prev);
			if (next.has(name)) {
				next.delete(name);
			} else {
				next.add(name);
			}
			return next;
		});
	}, []);

	const presentTypes = useMemo(() => {
		const types = new Set<string>();
		for (const e of events) types.add(e.type);
		return types;
	}, [events]);

	const filtered = useMemo(() => {
		return events.filter((e) => {
			if (hiddenTypes.has(e.type)) return false;
			if (directionFilter !== "all" && e.direction !== directionFilter) return false;
			if (filter) {
				const q = filter.toLowerCase();
				return (
					e.type.toLowerCase().includes(q) || JSON.stringify(e.payload).toLowerCase().includes(q)
				);
			}
			return true;
		});
	}, [events, hiddenTypes, directionFilter, filter]);

	return {
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
	};
}
