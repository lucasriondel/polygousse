import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmuxSendKeys } from "../../tmux.js";

const execFileAsync = promisify(execFile);

export async function createTmuxSession(terminalSessionId: string, cwd: string): Promise<void> {
	await execFileAsync("tmux", ["new-session", "-d", "-s", terminalSessionId, "-c", cwd]);

	// Enable mouse support so the web terminal can scroll through history
	await execFileAsync("tmux", [
		"set-option",
		"-t",
		terminalSessionId,
		"mouse",
		"on",
	]);

	// Export terminal session ID so hooks can link back
	await tmuxSendKeys(
		terminalSessionId,
		`export POLYGOUSSE_TERMINAL_SESSION_ID=${terminalSessionId}`,
	);
}

export async function killTmuxSession(terminalSessionId: string): Promise<void> {
	try {
		await execFileAsync("tmux", ["kill-session", "-t", terminalSessionId]);
	} catch {
		// Session may already be dead
	}
}
