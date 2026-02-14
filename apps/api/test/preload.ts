/**
 * Test preload — loaded before every test file via bunfig.toml.
 *
 * 1. Sets POLYGOUSSE_DB_PATH=:memory: so the database module creates an
 *    in-memory SQLite database instead of touching the real one.
 * 2. Mocks `node:child_process` so no real tmux/git commands run during tests.
 *    The mock records every call so tests can inspect what would have been executed.
 */

import { mock } from "bun:test";

// ── 1. Environment ──────────────────────────────────────────────────────────
process.env.POLYGOUSSE_DB_PATH = ":memory:";

// ── 2. Mock child_process ───────────────────────────────────────────────────

/** Recorded call from execFile mock */
export interface ExecFileCall {
	command: string;
	args: string[];
	options?: Record<string, unknown>;
}

/** All execFile calls recorded during the current test. */
export const execFileCalls: ExecFileCall[] = [];

/** Reset recorded calls — call this in beforeEach/afterEach. */
export function resetExecFileCalls(): void {
	execFileCalls.length = 0;
}

/**
 * The mock execFile function. It follows the Node.js callback signature:
 *   execFile(command, args, options?, callback?)
 * and also works when wrapped with `promisify()`.
 */
function mockExecFile(
	command: string,
	args: string[],
	optionsOrCallback?: Record<string, unknown> | ((...a: unknown[]) => void),
	maybeCallback?: (...a: unknown[]) => void,
): void {
	const callback =
		typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
	const options =
		typeof optionsOrCallback === "function" ? undefined : optionsOrCallback;

	execFileCalls.push({ command, args, ...(options && { options }) });

	// Invoke callback async to match real execFile behavior
	if (callback) {
		queueMicrotask(() => callback(null, "", ""));
	}
}

mock.module("node:child_process", () => ({
	execFile: mockExecFile,
}));
