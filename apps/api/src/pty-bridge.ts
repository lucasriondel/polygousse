/**
 * PTY Bridge Sidecar — Node.js process (run with tsx, NOT bun)
 *
 * Provides a WebSocket-to-PTY bridge for attaching to tmux sessions.
 * Route: /ws/terminal/:sessionId
 * Port: 5617
 */

import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { URL } from "node:url";
import * as pty from "node-pty";
import { WebSocket, WebSocketServer } from "ws";

const PORT = Number(process.env.PTY_BRIDGE_PORT) || 5617;
const HOST = process.env.PTY_BRIDGE_HOST || "127.0.0.1";
const TMUX_PATH = execSync("which tmux").toString().trim();

const WEB_PORT = process.env.PTY_BRIDGE_WEB_PORT || "5615";
const ALLOWED_ORIGINS = new Set([
	...(process.env.PTY_BRIDGE_CORS_ORIGINS?.split(",") ?? []),
	`http://localhost:${WEB_PORT}`,
	`http://127.0.0.1:${WEB_PORT}`,
	`http://localhost:${PORT}`,
	`http://127.0.0.1:${PORT}`,
]);

// Track all active PTY processes for cleanup on shutdown
const activePtyProcesses = new Set<pty.IPty>();
// Track one PTY per session to prevent duplicate attaches
const sessionPty = new Map<string, { pty: pty.IPty; clients: Set<WebSocket> }>();

const server = createServer((_req, res) => {
	res.writeHead(200, { "Content-Type": "application/json" });
	res.end(JSON.stringify({ status: "ok", service: "pty-bridge" }));
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
	// Verify the Origin header to prevent cross-site WebSocket hijacking
	const origin = req.headers.origin;
	if (origin && !ALLOWED_ORIGINS.has(origin)) {
		console.error(`PTY bridge rejected connection from origin: ${origin}`);
		socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
		socket.destroy();
		return;
	}

	const pathname = new URL(req.url ?? "", `http://${req.headers.host}`).pathname;
	const match = pathname.match(/^\/ws\/terminal\/(.+)$/);

	if (match) {
		const sessionId = decodeURIComponent(match[1]!);
		wss.handleUpgrade(req, socket, head, (ws) => {
			handleTerminalConnection(ws, sessionId);
		});
	} else {
		socket.destroy();
	}
});

function cleanupPty(ptyProcess: pty.IPty) {
	activePtyProcesses.delete(ptyProcess);
	try {
		// tmux attach-session ignores SIGHUP (node-pty default), so use SIGKILL.
		// Kill the process group (-pid) to ensure child processes are also cleaned up.
		process.kill(-ptyProcess.pid, "SIGKILL");
	} catch {
		// Already dead — that's fine
	}
}

function getOrCreatePty(sessionId: string): { pty: pty.IPty; clients: Set<WebSocket> } | null {
	const existing = sessionPty.get(sessionId);
	if (existing) {
		// Verify the PTY process is still alive — a stale entry can linger if
		// onExit from a previous PTY deleted a newer entry (race condition).
		try {
			process.kill(existing.pty.pid, 0); // signal 0 = existence check
			return existing;
		} catch {
			// Process is dead — remove the stale entry and create a fresh one
			console.log(`Stale PTY entry for session ${sessionId} (pid ${existing.pty.pid}), recreating`);
			sessionPty.delete(sessionId);
			activePtyProcesses.delete(existing.pty);
			for (const client of existing.clients) {
				if (client.readyState === WebSocket.OPEN) {
					client.close();
				}
			}
			existing.clients.clear();
		}
	}

	let ptyProcess: pty.IPty;
	try {
		ptyProcess = pty.spawn(TMUX_PATH, ["attach-session", "-t", sessionId], {
			name: "xterm-256color",
			cols: 80,
			rows: 24,
			env: process.env as Record<string, string>,
		});
	} catch (err) {
		console.error("Failed to spawn pty for session", sessionId, err);
		return null;
	}

	const entry = { pty: ptyProcess, clients: new Set<WebSocket>() };
	activePtyProcesses.add(ptyProcess);
	sessionPty.set(sessionId, entry);

	ptyProcess.onData((data) => {
		for (const client of entry.clients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(data);
			}
		}
	});

	ptyProcess.onExit(() => {
		activePtyProcesses.delete(ptyProcess);
		// Only remove from the map if this entry is still the current one —
		// a replacement may have been created while this PTY was shutting down.
		if (sessionPty.get(sessionId) === entry) {
			sessionPty.delete(sessionId);
		}
		for (const client of entry.clients) {
			if (client.readyState === WebSocket.OPEN) {
				client.close();
			}
		}
		entry.clients.clear();
	});

	return entry;
}

function removeClient(sessionId: string, ws: WebSocket) {
	const entry = sessionPty.get(sessionId);
	if (!entry) return;
	entry.clients.delete(ws);
	// If no more clients, tear down the PTY
	if (entry.clients.size === 0) {
		sessionPty.delete(sessionId);
		cleanupPty(entry.pty);
	}
}

function handleTerminalConnection(ws: WebSocket, sessionId: string) {
	const entry = getOrCreatePty(sessionId);
	if (!entry) {
		ws.close();
		return;
	}

	entry.clients.add(ws);

	ws.on("message", (data) => {
		const msg = data.toString();

		// Check if it's a JSON control message (e.g. resize)
		if (msg.startsWith("{")) {
			try {
				const parsed = JSON.parse(msg);
				if (parsed.type === "resize" && parsed.cols && parsed.rows) {
					entry.pty.resize(parsed.cols, parsed.rows);
					return;
				}
			} catch {
				// Not JSON — treat as raw terminal input
			}
		}

		entry.pty.write(msg);
	});

	ws.on("close", () => {
		removeClient(sessionId, ws);
	});

	ws.on("error", (err) => {
		console.error("WebSocket error for session", sessionId, err);
		removeClient(sessionId, ws);
	});
}

// Graceful shutdown — kill all active PTY processes so tmux attach-session
// children don't become orphans when the bridge restarts or is stopped.
function shutdown() {
	console.log(`PTY bridge shutting down, killing ${activePtyProcesses.size} active PTY process(es)`);
	for (const p of activePtyProcesses) {
		try {
			process.kill(-p.pid, "SIGKILL");
		} catch {
			// Already dead
		}
	}
	activePtyProcesses.clear();
	sessionPty.clear();
	server.close();
	process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, HOST, () => {
	console.log(`PTY bridge listening on http://${HOST}:${PORT}`);
});
