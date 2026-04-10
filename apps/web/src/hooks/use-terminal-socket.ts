import type { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { PTY_WS_URL } from "@/lib/config";

const RECONNECT_DELAYS = [1000, 2000, 4000];
const MAX_ATTEMPTS = RECONNECT_DELAYS.length + 1;

export type TerminalSocketStatus = "connecting" | "connected" | "unavailable";

export function useTerminalSocket(terminal: Terminal | null, sessionId: string | null) {
	const wsRef = useRef<WebSocket | null>(null);
	const [status, setStatus] = useState<TerminalSocketStatus>("connecting");

	useEffect(() => {
		if (!terminal || !sessionId) return;

		setStatus("connecting");
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let attempt = 0;
		let disposed = false;
		let receivedData = false;
		let onData: { dispose(): void } | null = null;
		let onBinary: { dispose(): void } | null = null;
		let onResize: { dispose(): void } | null = null;

		function connect() {
			if (disposed) return;

			receivedData = false;
			const ws = new WebSocket(`${PTY_WS_URL}/${encodeURIComponent(sessionId!)}`);
			ws.binaryType = "arraybuffer";
			wsRef.current = ws;

			ws.addEventListener("open", () => {
				ws.send(
					JSON.stringify({
						type: "resize",
						cols: terminal!.cols,
						rows: terminal!.rows,
					}),
				);
			});

			ws.addEventListener("message", (event) => {
				if (!receivedData) {
					receivedData = true;
					attempt = 0;
					setStatus("connected");
				}
				const data = event.data;
				if (typeof data === "string") {
					terminal!.write(data);
				} else if (data instanceof ArrayBuffer) {
					terminal!.write(new Uint8Array(data));
				}
			});

			ws.addEventListener("close", () => {
				wsRef.current = null;
				if (disposed) return;

				// If we were connected and lost connection, try to reconnect
				if (receivedData) {
					attempt = 0;
					setStatus("connecting");
				}

				attempt++;
				if (attempt >= MAX_ATTEMPTS) {
					setStatus("unavailable");
					return;
				}
				const delay = RECONNECT_DELAYS[Math.min(attempt - 1, RECONNECT_DELAYS.length - 1)]!;
				reconnectTimer = setTimeout(connect, delay);
			});

			ws.addEventListener("error", () => ws.close());
		}

		connect();

		onData = terminal.onData((data) => {
			if (wsRef.current?.readyState === WebSocket.OPEN) {
				wsRef.current.send(data);
			}
		});

		onBinary = terminal.onBinary((data) => {
			if (wsRef.current?.readyState === WebSocket.OPEN) {
				wsRef.current.send(data);
			}
		});

		onResize = terminal.onResize(({ cols, rows }) => {
			if (wsRef.current?.readyState === WebSocket.OPEN) {
				wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
			}
		});

		return () => {
			disposed = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			onData?.dispose();
			onBinary?.dispose();
			onResize?.dispose();
			wsRef.current?.close();
			wsRef.current = null;
		};
	}, [terminal, sessionId]);

	return { wsRef, status };
}
