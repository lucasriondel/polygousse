/**
 * Pretty terminal logging — colored, human-readable output for hook events
 * and subsystem lifecycle messages.
 *
 * Uses raw ANSI escape codes (no external deps). This is a human-readable
 * layer on top of Pino's structured JSON logs.
 */

import { fileLog } from "./file-logger";

// ── ANSI color codes ────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

// Standard colors
const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";

// 256-color codes for colors without standard ANSI equivalents
const ORANGE = "\x1b[38;5;208m";
const TEAL = "\x1b[38;5;30m";
const ROSE = "\x1b[38;5;197m";
const VIOLET = "\x1b[38;5;135m";
const PURPLE = "\x1b[38;5;141m";
const INDIGO = "\x1b[38;5;105m";
const EMERALD = "\x1b[38;5;42m";
const SKY = "\x1b[38;5;117m";
const ZINC = "\x1b[38;5;246m";

// ── Session ID color palette ───────────────────────────────────────────
// Distinct, readable 256-color values assigned deterministically per session ID.
const SESSION_COLORS = [
	"\x1b[38;5;204m", // pink
	"\x1b[38;5;114m", // lime
	"\x1b[38;5;39m",  // dodger blue
	"\x1b[38;5;220m", // gold
	"\x1b[38;5;171m", // orchid
	"\x1b[38;5;43m",  // turquoise
	"\x1b[38;5;209m", // salmon
	"\x1b[38;5;75m",  // steel blue
	"\x1b[38;5;182m", // plum
	"\x1b[38;5;150m", // dark sea green
	"\x1b[38;5;216m", // sandy brown
	"\x1b[38;5;111m", // cornflower
];

function sessionColor(sessionId: string): string {
	let hash = 0;
	for (let i = 0; i < sessionId.length; i++) {
		hash = (hash * 31 + sessionId.charCodeAt(i)) | 0;
	}
	return SESSION_COLORS[Math.abs(hash) % SESSION_COLORS.length];
}

// ── Event color map (mirrors EVENT_COLORS from session-debug-shared.tsx) ─

const EVENT_COLOR_MAP: Record<string, string> = {
	SessionStart: GREEN,
	UserPromptSubmit: BLUE,
	PreToolUse: CYAN,
	PermissionRequest: ORANGE,
	PostToolUse: TEAL,
	PostToolUseFailure: ROSE,
	Notification: YELLOW,
	SubagentStart: VIOLET,
	SubagentStop: PURPLE,
	Stop: RED,
	TeammateIdle: INDIGO,
	TaskCompleted: EMERALD,
	PreCompact: SKY,
	SessionEnd: ZINC,
};

// ── Subsystem color map ─────────────────────────────────────────────────

const SUBSYSTEM_COLOR_MAP: Record<string, string> = {
	"plan-handoff": VIOLET,
	orchestrator: ORANGE,
	"claude-usage": CYAN,
	ws: BLUE,
	server: GREEN,
	"dbg:orchestrator": ROSE,
	"dbg:settings": SKY,
	"dbg:task-lifecycle": EMERALD,
	"dbg:hooks": INDIGO,
	"dbg:ws": TEAL,
	"db-cleanup": ZINC,
};

// ── Detail extractor (ported from session-debug-shared.tsx getEventDetail) ─

function getEventDetail(body: Record<string, unknown>): string | null {
	const eventName = body.hook_event_name as string | undefined;
	if (!eventName) return null;

	switch (eventName) {
		case "PreToolUse":
		case "PostToolUse":
		case "PostToolUseFailure":
		case "PermissionRequest":
			return (body.tool_name as string) ?? null;
		case "SubagentStart":
		case "SubagentStop":
			return (body.agent_type as string) ?? null;
		case "UserPromptSubmit": {
			const prompt = body.prompt as string | undefined;
			if (!prompt) return null;
			return prompt.length > 60 ? `${prompt.slice(0, 60)}...` : prompt;
		}
		case "TaskCompleted":
			return (body.task_subject as string) ?? null;
		case "TeammateIdle":
			return (body.teammate_name as string) ?? null;
		case "PreCompact":
			return (body.trigger as string) ?? null;
		case "SessionStart":
			return (body.source as string) ?? null;
		case "SessionEnd":
			return (body.reason as string) ?? null;
		default:
			return null;
	}
}

// ── Main exports ────────────────────────────────────────────────────────

/**
 * Log a colored hook event line:
 *   10:18:23 [3ec34bf3] SessionStart         startup
 */
export function prettyHookEvent(body: Record<string, unknown>): void {
	const eventName = (body.hook_event_name as string) ?? "Unknown";
	const sessionId = (body.session_id as string) ?? "????????";
	const shortId = sessionId.slice(0, 8);
	const color = EVENT_COLOR_MAP[eventName] ?? ZINC;
	const detail = getEventDetail(body);
	const time = new Date().toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	const paddedEvent = eventName.padEnd(20);
	const detailStr = detail ? `  ${DIM}${detail}${RESET}` : "";

	const idColor = sessionColor(sessionId);
	console.log(
		`${DIM}${time}${RESET} ${idColor}[${shortId}]${RESET} ${color}${BOLD}${paddedEvent}${RESET}${detailStr}`,
	);

	fileLog({
		level: "info",
		cat: "hook",
		event: eventName,
		sid: sessionId !== "????????" ? sessionId : undefined,
		msg: `Hook: ${eventName}${detail ? ` — ${detail}` : ""}`,
		data: body,
	});
}

/**
 * Log a colored subsystem message:
 *   10:18:23 [3ec34bf3] orchestrator    Wrote PRD.md (1234 chars)
 */
// ── Debug categories (mirrors debug.ts ENV_MAP) ─────────────────────
export const DEBUG_CATEGORIES: { label: string; envVar: string }[] = [
	{ label: "orchestrator", envVar: "POLYGOUSSE_DEBUG_ORCHESTRATOR" },
	{ label: "settings", envVar: "POLYGOUSSE_DEBUG_SETTINGS" },
	{ label: "task-lifecycle", envVar: "POLYGOUSSE_DEBUG_TASK_LIFECYCLE" },
	{ label: "hooks", envVar: "POLYGOUSSE_DEBUG_HOOKS" },
	{ label: "ws", envVar: "POLYGOUSSE_DEBUG_WS" },
];

function isTruthy(value: string | undefined): boolean {
	return !!value && value !== "0" && value.toLowerCase() !== "false";
}

/**
 * Print a startup banner showing which logging/debug categories are active.
 */
export function printLoggingBanner(port: number): void {
	const allEnabled = isTruthy(process.env.POLYGOUSSE_DEBUG_ALL);

	const active: string[] = [];
	const inactive: string[] = [];

	for (const { label, envVar } of DEBUG_CATEGORIES) {
		if (allEnabled || isTruthy(process.env[envVar])) {
			active.push(label);
		} else {
			inactive.push(label);
		}
	}

	const LINE = `${DIM}${"─".repeat(52)}${RESET}`;
	const TITLE = `${BOLD}${GREEN} Polygousse API${RESET}`;
	const CHECK = `${GREEN}●${RESET}`;
	const DOT = `${DIM}○${RESET}`;

	console.log("");
	console.log(LINE);
	console.log(TITLE);
	console.log(LINE);
	console.log(`  ${DIM}Port${RESET}        ${BOLD}${port}${RESET}`);
	console.log(`  ${DIM}Log level${RESET}   ${BOLD}info${RESET}  ${DIM}(Pino)${RESET}`);
	console.log("");
	console.log(`  ${BOLD}Debug channels${RESET}`);

	if (allEnabled) {
		console.log(`  ${CHECK} ${CYAN}ALL${RESET}  ${DIM}(POLYGOUSSE_DEBUG_ALL)${RESET}`);
	} else if (active.length === 0) {
		console.log(`  ${DIM}none active — set POLYGOUSSE_DEBUG_ALL=1 to enable all${RESET}`);
	}

	for (const { label, envVar } of DEBUG_CATEGORIES) {
		const on = allEnabled || isTruthy(process.env[envVar]);
		const icon = on ? CHECK : DOT;
		const color = on ? SUBSYSTEM_COLOR_MAP[`dbg:${label}`] ?? MAGENTA : DIM;
		console.log(`  ${icon} ${color}${label.padEnd(16)}${RESET} ${DIM}${envVar}${RESET}`);
	}

	console.log(LINE);
	console.log("");
}

export function prettyLog(subsystem: string, message: string, sessionId?: string): void {
	const color = SUBSYSTEM_COLOR_MAP[subsystem] ?? MAGENTA;
	const time = new Date().toLocaleTimeString("en-GB", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	const idPart = sessionId ? ` ${sessionColor(sessionId)}[${sessionId.slice(0, 8)}]${RESET}` : "";
	const paddedSub = subsystem.padEnd(20);

	console.log(
		`${DIM}${time}${RESET}${idPart} ${color}${paddedSub}${RESET}  ${DIM}${message}${RESET}`,
	);

	fileLog({
		level: subsystem.startsWith("dbg:") ? "debug" : "info",
		cat: subsystem,
		sid: sessionId,
		msg: message,
	});
}
