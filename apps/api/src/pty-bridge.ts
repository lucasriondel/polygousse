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
		ptyProcess.kill();
	} catch {
		// Already dead — that's fine
	}
}

function handleTerminalConnection(ws: WebSocket, sessionId: string) {
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
		ws.close();
		return;
	}

	activePtyProcesses.add(ptyProcess);

	ptyProcess.onData((data) => {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(data);
		}
	});

	ptyProcess.onExit(() => {
		activePtyProcesses.delete(ptyProcess);
		if (ws.readyState === WebSocket.OPEN) {
			ws.close();
		}
	});

	ws.on("message", (data) => {
		const msg = data.toString();

		// Check if it's a JSON control message (e.g. resize)
		if (msg.startsWith("{")) {
			try {
				const parsed = JSON.parse(msg);
				if (parsed.type === "resize" && parsed.cols && parsed.rows) {
					ptyProcess.resize(parsed.cols, parsed.rows);
					return;
				}
			} catch {
				// Not JSON — treat as raw terminal input
			}
		}

		ptyProcess.write(msg);
	});

	ws.on("close", () => {
		cleanupPty(ptyProcess);
	});

	ws.on("error", (err) => {
		console.error("WebSocket error for session", sessionId, err);
		cleanupPty(ptyProcess);
	});
}

// Graceful shutdown — kill all active PTY processes so tmux attach-session
// children don't become orphans when the bridge restarts or is stopped.
function shutdown() {
	console.log(`PTY bridge shutting down, killing ${activePtyProcesses.size} active PTY process(es)`);
	for (const p of activePtyProcesses) {
		try {
			p.kill();
		} catch {
			// Already dead
		}
	}
	activePtyProcesses.clear();
	server.close();
	process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, HOST, () => {
	console.log(`PTY bridge listening on http://${HOST}:${PORT}`);
});
