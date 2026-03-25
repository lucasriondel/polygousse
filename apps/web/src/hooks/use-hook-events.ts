import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HookEvent } from "@polygousse/types";
import { useAppSocket } from "@/hooks/use-app-socket";
import { wsRequest } from "@/lib/ws-client";

// ── Shared return type ──────────────────────────────────────────────────

export interface UseHookEventsReturn {
	events: HookEvent[];
	filtered: HookEvent[];
	loading: boolean;
	filter: string;
	setFilter: (v: string) => void;
	hiddenEvents: Set<string>;
	toggleEvent: (name: string) => void;
	presentEventNames: Set<string>;
	paused: boolean;
	togglePause: () => void;
	handleClear: () => void;
	bufferCount: number;
	expandedIds: Set<number>;
	setExpandedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
	listRef: React.RefObject<HTMLDivElement | null>;
	handleScroll: () => void;
	scrollToBottom: () => void;
	showScrollBtn: boolean;
}

// ── Internal shared logic ───────────────────────────────────────────────

function useHookEventsBase(initialHiddenEvents?: string[]) {
	const [events, setEvents] = useState<HookEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState("");
	const [hiddenEvents, setHiddenEvents] = useState<Set<string>>(
		() => new Set(initialHiddenEvents ?? ["PreToolUse", "PostToolUse"]),
	);
	const [paused, setPaused] = useState(false);
	const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
	const [autoScroll, setAutoScroll] = useState(true);
	const [showScrollBtn, setShowScrollBtn] = useState(false);

	const pausedRef = useRef(false);
	const bufferRef = useRef<HookEvent[]>([]);
	const listRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom
	useEffect(() => {
		if (autoScroll && listRef.current) {
			listRef.current.scrollTop = listRef.current.scrollHeight;
		}
	}, [autoScroll]);

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
			setEvents((prev) => [...prev, ...bufferRef.current]);
			bufferRef.current = [];
			pausedRef.current = false;
			setPaused(false);
		} else {
			pausedRef.current = true;
			setPaused(true);
		}
	}, []);

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

	const presentEventNames = useMemo(() => {
		const names = new Set<string>();
		for (const e of events) names.add(e.hook_event_name);
		return names;
	}, [events]);

	const filtered = useMemo(() => {
		return events.filter((e) => {
			if (hiddenEvents.has(e.hook_event_name)) {
				return false;
			}
			if (filter) {
				const q = filter.toLowerCase();
				return (
					e.hook_event_name.toLowerCase().includes(q) ||
					(e.session_id?.toLowerCase().includes(q) ?? false) ||
					(e.notification_type?.toLowerCase().includes(q) ?? false) ||
					(e.message?.toLowerCase().includes(q) ?? false) ||
					(e.cwd?.toLowerCase().includes(q) ?? false)
				);
			}
			return true;
		});
	}, [events, hiddenEvents, filter]);

	const addEvent = useCallback((event: HookEvent) => {
		if (pausedRef.current) {
			bufferRef.current.push(event);
		} else {
			setEvents((prev) => [...prev, event]);
		}
	}, []);

	return {
		events,
		setEvents,
		filtered,
		loading,
		setLoading,
		filter,
		setFilter,
		hiddenEvents,
		toggleEvent,
		presentEventNames,
		paused,
		togglePause,
		expandedIds,
		setExpandedIds,
		listRef,
		handleScroll,
		scrollToBottom,
		showScrollBtn,
		pausedRef,
		bufferRef,
		addEvent,
	};
}

// ── Global hook events ──────────────────────────────────────────────────

export function useGlobalHookEvents(): UseHookEventsReturn {
	const base = useHookEventsBase();
	const { subscribe } = useAppSocket();

	// Fetch initial events
	useEffect(() => {
		wsRequest("hook:events-recent", { limit: 200 })
			.then((data) => {
				base.setEvents(data.reverse());
			})
			.finally(() => base.setLoading(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Subscribe to real-time events
	useEffect(() => {
		return subscribe("hook-event:raw", (data: unknown) => {
			const { event } = data as { event: HookEvent };
			base.addEvent(event);
		});
	}, [subscribe, base.addEvent]);

	const handleClear = useCallback(() => {
		wsRequest("hook:events-clear", {}).then(() => {
			base.setEvents([]);
			base.bufferRef.current = [];
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return {
		events: base.events,
		filtered: base.filtered,
		loading: base.loading,
		filter: base.filter,
		setFilter: base.setFilter,
		hiddenEvents: base.hiddenEvents,
		toggleEvent: base.toggleEvent,
		presentEventNames: base.presentEventNames,
		paused: base.paused,
		togglePause: base.togglePause,
		handleClear,
		bufferCount: base.bufferRef.current.length,
		expandedIds: base.expandedIds,
		setExpandedIds: base.setExpandedIds,
		listRef: base.listRef,
		handleScroll: base.handleScroll,
		scrollToBottom: base.scrollToBottom,
		showScrollBtn: base.showScrollBtn,
	};
}

// ── Session hook events ─────────────────────────────────────────────────

export function useSessionHookEvents(sessionId: string): UseHookEventsReturn {
	const base = useHookEventsBase();
	const claudeSessionIdsRef = useRef<Set<string>>(new Set());
	const { subscribe } = useAppSocket();

	// Fetch initial data — extract hook events from agentSessions
	useEffect(() => {
		wsRequest("session:debug-detail", { terminalSessionId: sessionId })
			.then((data) => {
				// Track claude session IDs for real-time filtering
				const csIds = new Set<string>();
				for (const as of data.agentSessions) {
					csIds.add(as.id);
				}
				claudeSessionIdsRef.current = csIds;

				// Flatten hook events from all agent sessions
				const hookEvents: HookEvent[] = [];
				for (const as of data.agentSessions) {
					if (as.hookEvents) {
						for (const he of as.hookEvents) {
							hookEvents.push(he);
						}
					}
				}

				// Sort by received_at
				hookEvents.sort(
					(a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime(),
				);

				base.setEvents(hookEvents);
			})
			.finally(() => base.setLoading(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId]);

	// Subscribe to real-time hook events filtered by tracked claude session IDs
	useEffect(() => {
		const unsubs = [
			subscribe("hook-event:raw", (data: unknown) => {
				const { event } = data as { event: HookEvent };
				if (event.session_id && claudeSessionIdsRef.current.has(event.session_id)) {
					base.addEvent(event);
				}
			}),
			// Track new claude sessions joining this terminal session
			subscribe("claude-session:created", (data: unknown) => {
				const msg = data as { session?: { id?: string; terminal_session_id?: string } };
				if (msg.session?.terminal_session_id === sessionId && msg.session.id) {
					claudeSessionIdsRef.current.add(msg.session.id);
				}
			}),
			subscribe("claude-session:updated", (data: unknown) => {
				const msg = data as { session?: { id?: string; terminal_session_id?: string } };
				if (msg.session?.terminal_session_id === sessionId && msg.session.id) {
					claudeSessionIdsRef.current.add(msg.session.id);
				}
			}),
		];

		return () => {
			for (const unsub of unsubs) unsub();
		};
	}, [subscribe, sessionId, base.addEvent]);

	const handleClear = useCallback(() => {
		base.setEvents([]);
		base.bufferRef.current = [];
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return {
		events: base.events,
		filtered: base.filtered,
		loading: base.loading,
		filter: base.filter,
		setFilter: base.setFilter,
		hiddenEvents: base.hiddenEvents,
		toggleEvent: base.toggleEvent,
		presentEventNames: base.presentEventNames,
		paused: base.paused,
		togglePause: base.togglePause,
		handleClear,
		bufferCount: base.bufferRef.current.length,
		expandedIds: base.expandedIds,
		setExpandedIds: base.setExpandedIds,
		listRef: base.listRef,
		handleScroll: base.handleScroll,
		scrollToBottom: base.scrollToBottom,
		showScrollBtn: base.showScrollBtn,
	};
}
