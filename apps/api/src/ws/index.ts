import { getClaudeSessionById, insertSessionEvent, type WsEvent } from "@polygousse/database";
import type { FastifyPluginAsync } from "fastify";
import type { WebSocket } from "ws";
import { debugWs } from "../debug.js";
import { fileLog } from "../file-logger.js";
import { prettyLog } from "../pretty-log.js";
import { dispatch } from "./handlers.js";
import "./register-handlers.js";

interface ClientInfo {
	id: string;
	connectedAt: Date;
}

export const clients = new Map<WebSocket, ClientInfo>();
let nextId = 1;

function resolveTerminalSessionId(message: WsEvent): string | null {
	switch (message.type) {
		case "terminal-session:created":
		case "terminal-session:updated":
			return message.session.id;

		case "claude-session:created":
		case "claude-session:updated":
			return message.session.terminal_session_id;

		case "hook-event:raw": {
			if (!message.event.session_id) return null;
			const cs = getClaudeSessionById.get(message.event.session_id);
			return cs?.terminal_session_id ?? null;
		}

		case "task:updated":
			return message.task.session_id;

		case "orchestrator:created":
		case "orchestrator:updated":
			return message.state.terminalSessionId;

		default:
			return null;
	}
}

export function broadcast(message: WsEvent) {
	debugWs(`Broadcast: ${message.type} → ${clients.size} client(s)`);
	fileLog({ level: "info", cat: "ws", event: "broadcast", msg: `${message.type} → ${clients.size} client(s)`, data: { eventType: message.type, clientCount: clients.size } });
	const data = JSON.stringify(message);
	for (const [client] of clients) {
		if (client.readyState === 1) {
			client.send(data);
		}
	}

	// Persist session-scoped events
	const terminalSessionId = resolveTerminalSessionId(message);
	if (terminalSessionId) {
		try {
			insertSessionEvent.get(terminalSessionId, message.type, data);
		} catch {
			// Terminal session may not exist yet or FK constraint failed — skip
		}
	}
}

const wsRoutes: FastifyPluginAsync = async (fastify) => {
	fastify.get("/ws", { websocket: true }, (socket) => {
		const clientId = String(nextId++);
		clients.set(socket, { id: clientId, connectedAt: new Date() });

		prettyLog("ws", `Client connected: ${clientId}`);

		socket.send(
			JSON.stringify({
				type: "welcome",
				clientId,
				connectedClients: clients.size,
			}),
		);

		socket.on("message", (raw) => {
			const message = raw.toString();

			try {
				const parsed = JSON.parse(message);

				// Route WS requests (messages with id + action) to the dispatcher
				if (parsed.id && parsed.action) {
					dispatch(parsed, socket, fastify.log);
					return;
				}

				if (parsed.type === "broadcast") {
					const outgoing = JSON.stringify({
						type: "broadcast",
						from: clientId,
						data: parsed.data,
					});

					for (const [client] of clients) {
						if (client !== socket && client.readyState === 1) {
							client.send(outgoing);
						}
					}
				} else {
					// Echo back
					socket.send(
						JSON.stringify({
							type: "echo",
							data: parsed,
						}),
					);
				}
			} catch {
				socket.send(
					JSON.stringify({
						type: "echo",
						data: message,
					}),
				);
			}
		});

		socket.on("close", () => {
			clients.delete(socket);
			prettyLog("ws", `Client disconnected: ${clientId} (${clients.size} remaining)`);
		});
	});
};

export default wsRoutes;
