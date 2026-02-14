import type { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { PTY_WS_URL } from "@/lib/config";

const RECONNECT_DELAYS = [1000, 2000, 4000];

export function useTerminalSocket(terminal: Terminal | null, sessionId: string | null) {
	const wsRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		if (!terminal || !sessionId) return;

		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let attempt = 0;
		let disposed = false;
		let onData: { dispose(): void } | null = null;
		let onBinary: { dispose(): void } | null = null;
		let onResize: { dispose(): void } | null = null;

		function connect() {
			if (disposed) return;

			const ws = new WebSocket(`${PTY_WS_URL}/${encodeURIComponent(sessionId!)}`);
			ws.binaryType = "arraybuffer";
			wsRef.current = ws;

			ws.addEventListener("open", () => {
				attempt = 0;
				ws.send(
					JSON.stringify({
						type: "resize",
						cols: terminal!.cols,
						rows: terminal!.rows,
					}),
				);
			});

			ws.addEventListener("message", (event) => {
				const data = event.data;
				if (typeof data === "string") {
					terminal!.write(data);
				} else if (data instanceof ArrayBuffer) {
					terminal!.write(new Uint8Array(data));
				}
			});

			ws.addEventListener("close", () => {
				wsRef.current = null;
				if (!disposed) {
					const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)]!;
					attempt++;
					reconnectTimer = setTimeout(connect, delay);
				}
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

	return wsRef;
}
