import type { WebSocket } from "ws";
import { debugWs } from "../debug.js";
import { fileLog } from "../file-logger.js";

type Log = { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

// biome-ignore lint: handler generics are enforced at the registerHandler call site
export type HandlerFn = (
	payload: any,
	ctx: { log: Log },
) => Promise<unknown> | unknown;

const handlers = new Map<string, HandlerFn>();

export function registerHandler(action: string, handler: HandlerFn) {
	handlers.set(action, handler);
}

interface WsRequest {
	id: string;
	action: string;
	payload: unknown;
}

export async function dispatch(request: WsRequest, socket: WebSocket, log: Log) {
	const { id, action, payload } = request;
	debugWs(`Dispatch: ${action}`);

	const handler = handlers.get(action);
	if (!handler) {
		debugWs(`Unknown action: ${action}`);
		fileLog({ level: "warn", cat: "ws", event: "unknown-action", msg: `Unknown action: ${action}` });
		socket.send(JSON.stringify({ id, ok: false, error: `Unknown action: ${action}` }));
		return;
	}

	try {
		const data = await handler(payload, { log });
		debugWs(`OK: ${action}`);
		fileLog({ level: "info", cat: "ws", event: "dispatch-ok", msg: `Dispatch OK: ${action}` });
		socket.send(JSON.stringify({ id, ok: true, data: data ?? null }));
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		debugWs(`Error: ${action} — ${message}`);
		fileLog({ level: "error", cat: "ws", event: "dispatch-error", msg: `Dispatch error: ${action} — ${message}` });
		log.error(err, `WS handler error for ${action}`);
		socket.send(JSON.stringify({ id, ok: false, error: message }));
	}
}
