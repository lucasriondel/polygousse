import type { WsActionMap, WsActionName } from "@polygousse/types";

const REQUEST_TIMEOUT_MS = 30_000;

let reqCounter = 0;

interface PendingRequest {
	resolve: (data: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

let pendingRequests = new Map<string, PendingRequest>();
let wsRef: WebSocket | null = null;

// Preserve state across Vite HMR
if (import.meta.hot) {
	if (import.meta.hot.data.pendingRequests) {
		pendingRequests = import.meta.hot.data.pendingRequests;
		reqCounter = import.meta.hot.data.reqCounter ?? 0;
	}
	import.meta.hot.dispose((data) => {
		data.pendingRequests = pendingRequests;
		data.reqCounter = reqCounter;
	});
}

export function setWsRef(socket: WebSocket | null) {
	wsRef = socket;
}

/**
 * Handle an incoming WS message as a potential request response.
 * Returns `true` if the message was a response (has `id` + `ok`), so the
 * caller can skip broadcast dispatch.
 */
export function handleWsResponse(data: unknown): boolean {
	if (
		typeof data !== "object" ||
		data === null ||
		!("id" in data) ||
		!("ok" in data)
	) {
		return false;
	}

	const msg = data as { id: string; ok: boolean; data?: unknown; error?: string };
	const pending = pendingRequests.get(msg.id);
	if (!pending) return false;

	pendingRequests.delete(msg.id);
	clearTimeout(pending.timer);

	if (msg.ok) {
		pending.resolve(msg.data);
	} else {
		pending.reject(new Error(msg.error ?? "Unknown WS error"));
	}

	return true;
}

export function wsRequest<A extends WsActionName>(
	action: A,
	payload: WsActionMap[A]["payload"],
): Promise<WsActionMap[A]["response"]> {
	return new Promise((resolve, reject) => {
		if (!wsRef || wsRef.readyState !== WebSocket.OPEN) {
			reject(new Error("WebSocket not connected"));
			return;
		}

		const id = `req_${Date.now()}_${++reqCounter}`;

		const timer = setTimeout(() => {
			pendingRequests.delete(id);
			reject(new Error(`WS request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${action}`));
		}, REQUEST_TIMEOUT_MS);

		pendingRequests.set(id, {
			resolve: resolve as (data: unknown) => void,
			reject,
			timer,
		});

		wsRef.send(JSON.stringify({ id, action, payload }));
	});
}
