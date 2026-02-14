/**
 * Structured JSONL file logger for post-mortem analysis.
 *
 * Writes one JSON line per log entry to a daily log file.
 * Files are named `polygousse-YYYY-MM-DD.log` and rotate at midnight.
 * Buffered writes flush every 100ms for performance.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

export interface LogEntry {
	level: "info" | "debug" | "warn" | "error";
	cat: string;
	event?: string;
	sid?: string;
	tid?: string;
	taskId?: number;
	msg: string;
	data?: Record<string, unknown>;
}

// ── State ──────────────────────────────────────────────────────────────

let writer: ReturnType<ReturnType<typeof Bun.file>["writer"]> | null = null;
let flushInterval: ReturnType<typeof setInterval> | null = null;
let buffer: string[] = [];
let currentDate: string | null = null;
let logDir: string = "";

const DEFAULT_LOG_DIR = "./logs";

function getLogDir(): string {
	return process.env.POLYGOUSSE_LOG_DIR || DEFAULT_LOG_DIR;
}

function todayStr(): string {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function logPathForDate(date: string): string {
	return join(logDir, `polygousse-${date}.log`);
}

// ── Init / Shutdown ────────────────────────────────────────────────────

export function initFileLogger(): void {
	logDir = getLogDir();
	mkdirSync(logDir, { recursive: true });

	currentDate = todayStr();
	writer = Bun.file(logPathForDate(currentDate)).writer();

	// Flush buffer every 100ms
	flushInterval = setInterval(() => {
		drainBuffer();
	}, 100);
}

/** Switch to a new day's log file. */
async function rotateToNewDay(newDate: string): Promise<void> {
	drainBuffer();
	if (writer) {
		await writer.end();
	}
	currentDate = newDate;
	writer = Bun.file(logPathForDate(currentDate)).writer();
}

function drainBuffer(): void {
	if (!writer || buffer.length === 0) return;
	const lines = buffer.join("");
	buffer = [];
	writer.write(lines);
	writer.flush();
}

export async function flushFileLogger(): Promise<void> {
	drainBuffer();
	if (flushInterval) {
		clearInterval(flushInterval);
		flushInterval = null;
	}
	if (writer) {
		await writer.end();
		writer = null;
	}
}

// ── Main logging function ──────────────────────────────────────────────

export function fileLog(entry: LogEntry): void {
	if (!writer) return;

	// Check for day rollover
	const today = todayStr();
	if (today !== currentDate) {
		rotateToNewDay(today);
	}

	const line: Record<string, unknown> = {
		ts: new Date().toISOString(),
		level: entry.level,
		cat: entry.cat,
	};

	if (entry.event !== undefined) line.event = entry.event;
	if (entry.sid !== undefined) line.sid = entry.sid;
	if (entry.tid !== undefined) line.tid = entry.tid;
	if (entry.taskId !== undefined) line.taskId = entry.taskId;

	line.msg = entry.msg;

	if (entry.data !== undefined) line.data = entry.data;

	buffer.push(`${JSON.stringify(line)}\n`);
}
