import { useCallback, useEffect, useRef } from "react";
import { WS_URL } from "@/lib/config";
import { setWsRef, handleWsResponse } from "@/lib/ws-client";
import { useStore } from "@/store";
import type { WsEvent } from "@/store/types";

const STORE_EVENT_TYPES = new Set<string>([
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
]);

let listeners = new Map<string, Set<(data: unknown) => void>>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let refCount = 0;

// Preserve WebSocket state across Vite HMR to prevent orphaned connections
if (import.meta.hot) {
	// Restore state from previous module instance
	if (import.meta.hot.data.ws) {
		ws = import.meta.hot.data.ws;
		reconnectTimer = import.meta.hot.data.reconnectTimer;
		refCount = import.meta.hot.data.refCount;
		listeners = import.meta.hot.data.listeners;
		// Re-bind handlers so they reference the new module's closures
		if (ws && ws.readyState === WebSocket.OPEN) {
			bindHandlers(ws);
		}
	}

	// Save state before next hot reload
	import.meta.hot.dispose((data) => {
		data.ws = ws;
		data.reconnectTimer = reconnectTimer;
		data.refCount = refCount;
		data.listeners = listeners;
	});
}

function bindHandlers(socket: WebSocket) {
	socket.onopen = () => {
		setWsRef(socket);
		// Re-hydrate on reconnect to catch events missed while disconnected
		if (useStore.getState().hydrated) {
			useStore.getState().hydrate();
		}
	};

	socket.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data);

			// Handle WS request/response messages (from wsRequest())
			if (handleWsResponse(data)) return;

			const type = data?.type as string | undefined;
			if (!type) return;

			// Feed typed events into the Zustand store
			if (STORE_EVENT_TYPES.has(type)) {
				useStore.getState().applyEvent(data as WsEvent);
			}

			// Also dispatch to local subscribers (used by debug pages, session page)
			if (listeners.has(type)) {
				for (const cb of listeners.get(type)!) {
					cb(data);
				}
			}
		} catch {
			// ignore non-JSON messages
		}
	};

	socket.onclose = () => {
		setWsRef(null);
		ws = null;
		if (refCount > 0) {
			reconnectTimer = setTimeout(connect, 3000);
		}
	};

	socket.onerror = () => socket.close();
}

function connect() {
	if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
		return;
	}

	ws = new WebSocket(WS_URL);
	bindHandlers(ws);
}

function disconnect() {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
	ws?.close();
	ws = null;
}

export function useAppSocket() {
	const mountedRef = useRef(false);

	useEffect(() => {
		if (!mountedRef.current) {
			mountedRef.current = true;
			refCount++;
			connect();
		}

		return () => {
			mountedRef.current = false;
			refCount--;
			if (refCount <= 0) {
				refCount = 0;
				disconnect();
			}
		};
	}, []);

	const subscribe = useCallback((type: string, callback: (data: unknown) => void) => {
		if (!listeners.has(type)) {
			listeners.set(type, new Set());
		}
		listeners.get(type)?.add(callback);

		return () => {
			const set = listeners.get(type);
			if (set) {
				set.delete(callback);
				if (set.size === 0) {
					listeners.delete(type);
				}
			}
		};
	}, []);

	return { subscribe };
}
