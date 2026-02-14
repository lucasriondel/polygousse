import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileLog } from "./file-logger.js";

const execFileAsync = promisify(execFile);

const CHUNK_SIZE = 1024;
const CHUNK_DELAY_MS = 30;

interface TmuxSendKeysOptions {
	literal?: boolean;
	noEnter?: boolean;
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * Send a command or text to a tmux session, automatically chunking long
 * payloads to avoid tmux buffer limits (~1500-2000 chars).
 *
 * - Default (shell command mode): splits with `\` line continuation.
 * - `{ literal: true }`: sends raw text via `-l` in chunks, Enter at end.
 * - `{ noEnter: true }`: skips the final Enter key.
 */
export async function tmuxSendKeys(
	sessionId: string,
	command: string,
	options?: TmuxSendKeysOptions,
): Promise<void> {
	const literal = options?.literal ?? false;
	const noEnter = options?.noEnter ?? false;
	fileLog({ level: "debug", cat: "tmux", event: "send-keys", tid: sessionId, msg: `tmuxSendKeys: ${command.length} chars`, data: { literal, noEnter, length: command.length } });

	if (literal) {
		await sendLiteral(sessionId, command, noEnter);
	} else {
		await sendShellCommand(sessionId, command, noEnter);
	}
}

/**
 * Shell command mode: for short commands, send as a single send-keys call.
 * For long commands, split at CHUNK_SIZE boundaries using `\` line continuation,
 * sending each chunk separately.
 */
async function sendShellCommand(
	sessionId: string,
	command: string,
	noEnter: boolean,
): Promise<void> {
	if (command.length <= CHUNK_SIZE) {
		await execFileAsync("tmux", ["send-keys", "-t", sessionId, command]);
		if (!noEnter) {
			await sleep(CHUNK_DELAY_MS);
			await execFileAsync("tmux", ["send-keys", "-t", sessionId, "Enter"]);
		}
		return;
	}

	// Split into chunks with `\` line continuation
	const chunks: string[] = [];
	let remaining = command;

	while (remaining.length > 0) {
		if (remaining.length <= CHUNK_SIZE) {
			chunks.push(remaining);
			break;
		}

		// Reserve 1 char for the trailing `\`
		let splitAt = CHUNK_SIZE - 1;

		// Avoid splitting where the char before `\` is also `\`,
		// which would produce `\\` (literal backslash, not continuation)
		while (splitAt > 0 && remaining[splitAt - 1] === "\\") {
			splitAt--;
		}

		if (splitAt === 0) {
			// Extremely unlikely: the entire chunk is backslashes.
			// Just split at the original position.
			splitAt = CHUNK_SIZE - 1;
		}

		chunks.push(`${remaining.slice(0, splitAt)}\\`);
		remaining = remaining.slice(splitAt);
	}

	for (let i = 0; i < chunks.length; i++) {
		const isLast = i === chunks.length - 1;

		await execFileAsync("tmux", ["send-keys", "-t", sessionId, chunks[i]]);
		await sleep(CHUNK_DELAY_MS);

		if (isLast) {
			if (!noEnter) {
				await execFileAsync("tmux", ["send-keys", "-t", sessionId, "Enter"]);
			}
		} else {
			await execFileAsync("tmux", ["send-keys", "-t", sessionId, "Enter"]);
		}
	}
}

/**
 * Literal mode: sends raw text via `-l` flag in chunks, with a single
 * Enter at the end. Used for send-message where the text is not a shell command.
 */
async function sendLiteral(sessionId: string, text: string, noEnter: boolean): Promise<void> {
	if (text.length <= CHUNK_SIZE) {
		await execFileAsync("tmux", ["send-keys", "-t", sessionId, "-l", text]);
		if (!noEnter) {
			await execFileAsync("tmux", ["send-keys", "-t", sessionId, "Enter"]);
		}
		return;
	}

	const chunks: string[] = [];
	for (let i = 0; i < text.length; i += CHUNK_SIZE) {
		chunks.push(text.slice(i, i + CHUNK_SIZE));
	}

	for (let i = 0; i < chunks.length; i++) {
		await execFileAsync("tmux", ["send-keys", "-t", sessionId, "-l", chunks[i]]);

		if (i < chunks.length - 1) {
			await sleep(CHUNK_DELAY_MS);
		}
	}

	if (!noEnter) {
		await execFileAsync("tmux", ["send-keys", "-t", sessionId, "Enter"]);
	}
}
