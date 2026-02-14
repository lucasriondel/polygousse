import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ClaudeUsageData, ClaudeUsageUpdatedEvent } from "@polygousse/types";
import { broadcast } from "../ws/index.js";

const execFileAsync = promisify(execFile);

const TMUX_SESSION = "polygousse_claude_usage";
const TMUX_WIDTH = 120;
const TMUX_HEIGHT = 40;
const STARTUP_DELAY_MS = 8_000;
const RENDER_DELAY_MS = 14_000;
const MAX_CONSECUTIVE_FAILURES = 3;

type UsageStatus = "initializing" | "ready" | "error";

interface UsageState {
	usage: ClaudeUsageData | null;
	status: UsageStatus;
}

let state: UsageState = { usage: null, status: "initializing" };
let pollTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;
let logger: { info: (msg: string) => void; error: (err: unknown, msg: string) => void } | null =
	null;
let stopping = false;
let polling = false;

// ── Public API ──────────────────────────────────────────────────────

export function getClaudeUsage(): { usage: ClaudeUsageData | null; status: string } {
	return { usage: state.usage, status: state.status };
}

export async function startClaudeUsagePolling(
	log: { info: (msg: string) => void; error: (err: unknown, msg: string) => void },
	intervalMs = 60_000,
): Promise<void> {
	logger = log;
	stopping = false;

	log.info("Starting Claude usage polling...");

	try {
		await ensureTmuxSession();
	} catch (err) {
		log.error(err, "Failed to create Claude usage tmux session");
		state = { usage: null, status: "error" };
		broadcastState();
		return;
	}

	// Wait for CLI startup
	await sleep(STARTUP_DELAY_MS);

	// First poll
	await pollUsage();

	// Schedule recurring polls
	pollTimer = setInterval(() => {
		if (!stopping && !polling) pollUsage();
	}, intervalMs);
}

export async function refreshClaudeUsage(): Promise<void> {
	if (polling) return;
	await pollUsage();
}

export async function stopClaudeUsagePolling(): Promise<void> {
	stopping = true;

	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}

	try {
		await execFileAsync("tmux", ["kill-session", "-t", TMUX_SESSION]);
		logger?.info("Killed Claude usage tmux session");
	} catch {
		// Session may already be dead
	}
}

// ── Internal ────────────────────────────────────────────────────────

async function ensureTmuxSession(): Promise<void> {
	// Check if session already exists
	try {
		await execFileAsync("tmux", ["has-session", "-t", TMUX_SESSION]);
		logger?.info("Claude usage tmux session already exists, reusing");
		return;
	} catch {
		// Session doesn't exist, create it
	}

	await execFileAsync("env", [
		"-u",
		"CLAUDECODE",
		"tmux",
		"new-session",
		"-d",
		"-s",
		TMUX_SESSION,
		"-x",
		String(TMUX_WIDTH),
		"-y",
		String(TMUX_HEIGHT),
		"claude",
	]);

	logger?.info("Created Claude usage tmux session");
}

async function recreateSession(): Promise<void> {
	try {
		await execFileAsync("tmux", ["kill-session", "-t", TMUX_SESSION]);
	} catch {
		/* ignore */
	}
	await ensureTmuxSession();
	await sleep(STARTUP_DELAY_MS);
}

async function pollUsage(): Promise<void> {
	if (polling) return;
	polling = true;

	try {
		// Verify session is alive
		await execFileAsync("tmux", ["has-session", "-t", TMUX_SESSION]);
	} catch {
		logger?.error(new Error("Session dead"), "Claude usage tmux session not found, recreating...");
		try {
			await recreateSession();
		} catch (err) {
			logger?.error(err, "Failed to recreate Claude usage tmux session");
			state = { usage: null, status: "error" };
			broadcastState();
			polling = false;
			return;
		}
	}

	try {
		// Send /usage command
		await execFileAsync("tmux", ["send-keys", "-t", TMUX_SESSION, "-l", "/usage"]);
		await execFileAsync("tmux", ["send-keys", "-t", TMUX_SESSION, "Enter"]);

		// Wait for render
		await sleep(RENDER_DELAY_MS);

		// Capture pane output
		const { stdout } = await execFileAsync("tmux", ["capture-pane", "-t", TMUX_SESSION, "-p"]);

		// Parse the output
		const usage = parseUsageOutput(stdout);

		if (usage) {
			state = { usage, status: "ready" };
			consecutiveFailures = 0;
		} else {
			consecutiveFailures++;
			logger?.error(
				new Error("Parse failed"),
				`Failed to parse Claude usage output (attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`,
			);

			if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
				logger?.info("Max consecutive failures reached, recreating tmux session...");
				consecutiveFailures = 0;
				try {
					await recreateSession();
				} catch (err) {
					logger?.error(err, "Failed to recreate Claude usage tmux session after failures");
					state = { usage: null, status: "error" };
				}
			}
		}

		broadcastState();

		// Dismiss the /usage overlay by sending Escape
		await execFileAsync("tmux", ["send-keys", "-t", TMUX_SESSION, "Escape"]);
	} catch (err) {
		logger?.error(err, "Error during Claude usage poll");
		consecutiveFailures++;

		if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
			logger?.info("Max consecutive failures reached, recreating tmux session...");
			consecutiveFailures = 0;
			try {
				await recreateSession();
			} catch (recreateErr) {
				logger?.error(recreateErr, "Failed to recreate Claude usage tmux session after failures");
			}
			state = { usage: null, status: "error" };
			broadcastState();
		}
	} finally {
		polling = false;
	}
}

// ── Parser ──────────────────────────────────────────────────────────

type Section = "currentSession" | "weeklyAllModels" | "weeklySonnetOnly";

export function parseUsageOutput(raw: string): ClaudeUsageData | null {
	const lines = raw.split("\n");

	let currentSection: Section | null = null;
	const percentages: Partial<Record<Section, number>> = {};
	let sessionResetLabel: string | null = null;
	let weeklyResetLabel: string | null = null;

	for (const line of lines) {
		const trimmed = line.trim();

		// Detect section headers
		if (/current\s+session/i.test(trimmed)) {
			currentSection = "currentSession";
		} else if (/current\s+week\s*\(all\s+models\)/i.test(trimmed)) {
			currentSection = "weeklyAllModels";
		} else if (/current\s+week\s*\(sonnet\s+only\)/i.test(trimmed)) {
			currentSection = "weeklySonnetOnly";
		}

		// Match percentage
		const percentMatch = trimmed.match(/(\d+)%\s*used/i);
		if (percentMatch && currentSection && !(currentSection in percentages)) {
			percentages[currentSection] = Number(percentMatch[1]);
		}

		// Match reset labels
		const resetMatch = trimmed.match(/^Resets\s+(.+)/i);
		if (resetMatch) {
			const label = resetMatch[1]!;
			if (currentSection === "currentSession") {
				sessionResetLabel = label;
			} else if (currentSection === "weeklyAllModels" || currentSection === "weeklySonnetOnly") {
				weeklyResetLabel = label;
			}
		}
	}

	// Need at least the 3 percentages
	if (
		percentages.currentSession === undefined ||
		percentages.weeklyAllModels === undefined ||
		percentages.weeklySonnetOnly === undefined
	) {
		return null;
	}

	return {
		currentSession: percentages.currentSession,
		weeklyAllModels: percentages.weeklyAllModels,
		weeklySonnetOnly: percentages.weeklySonnetOnly,
		sessionResetLabel,
		weeklyResetLabel,
		fetchedAt: new Date().toISOString(),
	};
}

// ── Helpers ─────────────────────────────────────────────────────────

function broadcastState(): void {
	const event: ClaudeUsageUpdatedEvent = {
		type: "claude-usage:updated",
		usage: state.usage,
		status: state.status,
	};
	broadcast(event);
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
