import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { useTerminalSocket } from "@/hooks/use-terminal-socket";
import { getTerminalTheme } from "@/lib/terminal-themes";
import { useStore } from "@/store";
import { selectTerminalTheme } from "@/store/selectors";

interface TerminalViewProps {
	sessionId: string;
}

export function TerminalView({ sessionId }: TerminalViewProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const [terminal, setTerminal] = useState<Terminal | null>(null);
	const { wsRef, status } = useTerminalSocket(terminal, sessionId);
	const themeKey = useStore(selectTerminalTheme);

	const sendResize = useCallback(() => {
		const ws = wsRef.current;
		const term = terminalRef.current;
		if (term && ws && ws.readyState === WebSocket.OPEN) {
			ws.send(
				JSON.stringify({
					type: "resize",
					cols: term.cols,
					rows: term.rows,
				}),
			);
		}
	}, [wsRef]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const term = new Terminal({
			cursorBlink: true,
			fontFamily: "'JetBrains Mono', monospace",
			fontSize: 14,
			theme: getTerminalTheme(themeKey),
			// tmux enables mouse tracking, which eats drag events. Hold Option (⌥) on
			// Mac — or Shift on other platforms — to force a local selection.
			macOptionClickForcesSelection: true,
		});

		// Map Shift+Enter to LF (\n) so Claude Code inside the tmux session treats it
		// as chat:newline (ctrl+j) instead of submit (\r).
		term.attachCustomKeyEventHandler((ev) => {
			if (ev.type === "keydown" && ev.key === "Enter" && ev.shiftKey) {
				const ws = wsRef.current;
				if (ws?.readyState === WebSocket.OPEN) {
					ws.send("\n");
				}
				ev.preventDefault();
				ev.stopPropagation();
				return false;
			}
			return true;
		});

		const fitAddon = new FitAddon();
		fitAddonRef.current = fitAddon;
		term.loadAddon(fitAddon);

		term.open(container);

		try {
			const webglAddon = new WebglAddon();
			webglAddon.onContextLoss(() => {
				webglAddon.dispose();
			});
			term.loadAddon(webglAddon);
		} catch {
			// WebGL not available, fall back to canvas renderer
		}

		requestAnimationFrame(() => {
			fitAddon.fit();
		});

		terminalRef.current = term;
		setTerminal(term);

		const resizeObserver = new ResizeObserver(() => {
			fitAddon.fit();
			sendResize();
		});
		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
			term.dispose();
			terminalRef.current = null;
			setTerminal(null);
			fitAddonRef.current = null;
		};
	}, [sendResize]);

	useEffect(() => {
		const term = terminalRef.current;
		if (term) {
			term.options.theme = getTerminalTheme(themeKey);
		}
	}, [themeKey]);

	if (status === "unavailable") {
		return (
			<div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
				Terminal session unavailable — the tmux session may have been destroyed.
			</div>
		);
	}

	return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
