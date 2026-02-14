import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

// ── Types ──────────────────────────────────────────────────────────────

export type DebugTab = "sessions" | "agents" | "socket";

interface DebugPanelContextValue {
	open: boolean;
	activeTab: DebugTab;
	toggle: () => void;
	setOpen: (open: boolean) => void;
	setActiveTab: (tab: DebugTab) => void;
}

// ── Context ────────────────────────────────────────────────────────────

const DebugPanelContext = createContext<DebugPanelContextValue | null>(null);

// ── localStorage helpers ───────────────────────────────────────────────

const STORAGE_KEY_OPEN = "debug-panel-open";
const STORAGE_KEY_TAB = "debug-panel-tab";

function readBool(key: string, fallback: boolean): boolean {
	try {
		const v = localStorage.getItem(key);
		if (v === "true") return true;
		if (v === "false") return false;
	} catch {}
	return fallback;
}

function readTab(key: string, fallback: DebugTab): DebugTab {
	try {
		const v = localStorage.getItem(key);
		if (v === "sessions" || v === "agents" || v === "socket") return v;
	} catch {}
	return fallback;
}

// ── Provider ───────────────────────────────────────────────────────────

export function DebugPanelProvider({ children }: { children: ReactNode }) {
	const [open, setOpenState] = useState(() => readBool(STORAGE_KEY_OPEN, false));
	const [activeTab, setActiveTabState] = useState<DebugTab>(() => readTab(STORAGE_KEY_TAB, "sessions"));

	const setOpen = useCallback((v: boolean) => {
		setOpenState(v);
		try {
			localStorage.setItem(STORAGE_KEY_OPEN, String(v));
		} catch {}
	}, []);

	const setActiveTab = useCallback((tab: DebugTab) => {
		setActiveTabState(tab);
		try {
			localStorage.setItem(STORAGE_KEY_TAB, tab);
		} catch {}
	}, []);

	const toggle = useCallback(() => {
		setOpen(!open);
	}, [open, setOpen]);

	// Keyboard shortcut: Ctrl+Shift+D / Cmd+Shift+D
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "D" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpenState((prev) => {
					const next = !prev;
					try {
						localStorage.setItem(STORAGE_KEY_OPEN, String(next));
					} catch {}
					return next;
				});
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<DebugPanelContext.Provider value={{ open, activeTab, toggle, setOpen, setActiveTab }}>
			{children}
		</DebugPanelContext.Provider>
	);
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useDebugPanel(): DebugPanelContextValue {
	const ctx = useContext(DebugPanelContext);
	if (!ctx) throw new Error("useDebugPanel must be used within DebugPanelProvider");
	return ctx;
}
