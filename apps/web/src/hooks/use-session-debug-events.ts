import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentSession, TerminalSessionDebug } from "@/components/debug/session-debug-shared";
import { useAppSocket } from "@/hooks/use-app-socket";
import { wsRequest } from "@/lib/ws-client";

// ── Types ──────────────────────────────────────────────────────────────

export interface DisplayEvent {
	id: number;
	type: string;
	payload: unknown;
	timestamp: number;
	source: "history" | "live";
}

// ── Constants ──────────────────────────────────────────────────────────

const SESSION_EVENT_TYPES = [
	"terminal-session:created",
	"terminal-session:updated",
	"claude-session:created",
	"claude-session:updated",
	"hook-event:raw",
	"task:updated",
];

// ── Hook ───────────────────────────────────────────────────────────────

export function useSessionDebugEvents(sessionId: string) {
	const [session, setSession] = useState<TerminalSessionDebug | null>(null);
	const [events, setEvents] = useState<DisplayEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Controls
	const [filter, setFilter] = useState("");
	const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(() => new Set());
	const [paused, setPaused] = useState(false);
	const [expandedId, setExpandedId] = useState<number | null>(null);
	const [autoScroll, setAutoScroll] = useState(true);
	const [showScrollBtn, setShowScrollBtn] = useState(false);

	const pausedRef = useRef(false);
	const bufferRef = useRef<DisplayEvent[]>([]);
	const listRef = useRef<HTMLDivElement>(null);
	const claudeSessionIdsRef = useRef<Set<string>>(new Set());
	const nextIdRef = useRef(1);
	const { subscribe } = useAppSocket();

	// Fetch initial data
	useEffect(() => {
		wsRequest("session:debug-detail", { terminalSessionId: sessionId })
			.then((data) => {
				const { events: rawEvents, ...sessionData } = data;
				setSession(sessionData);

				// Track claude session IDs for real-time filtering
				const csIds = new Set<string>();
				for (const as of sessionData.agentSessions) {
					csIds.add(as.id);
				}
				claudeSessionIdsRef.current = csIds;

				// Convert stored events to display events
				const displayEvents: DisplayEvent[] = rawEvents.map((e: { event_type: string; payload: string; created_at: string }) => ({
					id: nextIdRef.current++,
					type: e.event_type,
					payload: JSON.parse(e.payload),
					timestamp: new Date(`${e.created_at}Z`).getTime(),
					source: "history" as const,
				}));
				setEvents(displayEvents);
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : "Failed to load session");
			})
			.finally(() => setLoading(false));
	}, [sessionId]);

	// Subscribe to real-time WS events scoped to this terminal session
	useEffect(() => {
		const unsubs = SESSION_EVENT_TYPES.map((type) =>
			subscribe(type, (data: unknown) => {
				const msg = data as Record<string, unknown>;

				// Filter: only capture events belonging to this terminal session
				let matches = false;

				if (type === "terminal-session:created" || type === "terminal-session:updated") {
					const s = msg.session as Record<string, unknown> | undefined;
					matches = s?.id === sessionId;
				} else if (type === "claude-session:created" || type === "claude-session:updated") {
					const s = msg.session as Record<string, unknown> | undefined;
					if (s?.terminal_session_id === sessionId) {
						matches = true;
						// Track new claude session IDs
						if (s.id && typeof s.id === "string") {
							claudeSessionIdsRef.current.add(s.id);
						}
					}
				} else if (type === "hook-event:raw") {
					const e = msg.event as Record<string, unknown> | undefined;
					if (e?.session_id && claudeSessionIdsRef.current.has(e.session_id as string)) {
						matches = true;
					}
				} else if (type === "task:updated") {
					const t = msg.task as Record<string, unknown> | undefined;
					matches = t?.session_id === sessionId;
				}

				if (!matches) return;

				const event: DisplayEvent = {
					id: nextIdRef.current++,
					type,
					payload: data,
					timestamp: Date.now(),
					source: "live",
				};

				if (pausedRef.current) {
					bufferRef.current.push(event);
				} else {
					setEvents((prev) => [...prev, event]);
				}

				// Update session data for claude-session events
				if (type === "claude-session:created" || type === "claude-session:updated") {
					const s = msg.session as AgentSession | undefined;
					if (s) {
						setSession((prev) => {
							if (!prev) return prev;
							const existing = prev.agentSessions.find((as) => as.id === s.id);
							if (existing) {
								return {
									...prev,
									agentSessions: prev.agentSessions.map((as) =>
										as.id === s.id ? { ...as, ...s } : as,
									),
								};
							}
							return {
								...prev,
								agentSessions: [...prev.agentSessions, { ...s, hookEvents: [] }],
							};
						});
					}
				}

				// Update session data for terminal-session updates
				if (type === "terminal-session:updated") {
					const s = msg.session as Record<string, unknown> | undefined;
					if (s) {
						setSession((prev) =>
							prev
								? { ...prev, ...s, agentSessions: prev.agentSessions, taskTitle: prev.taskTitle }
								: prev,
						);
					}
				}
			}),
		);

		return () => {
			for (const unsub of unsubs) unsub();
		};
	}, [subscribe, sessionId]);

	// Auto-scroll
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

	const handleClear = useCallback(() => {
		setEvents([]);
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
			if (filter) {
				const q = filter.toLowerCase();
				return (
					e.type.toLowerCase().includes(q) || JSON.stringify(e.payload).toLowerCase().includes(q)
				);
			}
			return true;
		});
	}, [events, hiddenTypes, filter]);

	return {
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
		expandedId,
		setExpandedId,
		listRef,
		handleScroll,
		scrollToBottom,
		showScrollBtn,
		loading,
		error,
		bufferRef,
	};
}
