import { getUnusedActiveTerminalSessions } from "@polygousse/database";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createApp } from "./create-app.js";
import { fileLog, flushFileLogger, initFileLogger } from "./file-logger.js";
import { prettyLog, printLoggingBanner } from "./pretty-log.js";
import {
  startClaudeUsagePolling,
  stopClaudeUsagePolling,
} from "./services/claude-usage.js";
import { initHookEventCleanup } from "./services/hook-processing/index.js";

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT) || 5616;

// Initialize file logger before anything else
initFileLogger();

const app = await createApp();

// Graceful shutdown — kill inactive tmux sessions to prevent orphaned processes
const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
for (const signal of signals) {
  process.on(signal, async () => {
    prettyLog("server", `Received ${signal}, shutting down...`);

    // Stop Claude usage polling and kill its tmux session
    await stopClaudeUsagePolling();

    // Kill unused tmux sessions (not linked to any task) to prevent orphaned processes
    const activeSessions = getUnusedActiveTerminalSessions.all();
    for (const session of activeSessions) {
      try {
        await execFileAsync("tmux", ["kill-session", "-t", session.id]);
        prettyLog("server", `Killed tmux session ${session.id}`);
      } catch {
        // Session may already be dead
      }
    }

    await flushFileLogger();
    await app.close();
    process.exit(0);
  });
}

// Start server
try {
  // Silence Pino during listen() to suppress raw JSON "Server listening at …" lines
  const originalLevel = app.log.level;
  app.log.level = "silent";
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.level = originalLevel;

  prettyLog("server", `Listening on http://localhost:${PORT}`);
  fileLog({ level: "info", cat: "server", event: "startup", msg: `Server listening on port ${PORT}` });
  printLoggingBanner(PORT);

  // One-time cleanup: prune + strip old hook events, clean session_events, VACUUM
  initHookEventCleanup();

  // Start Claude usage polling (non-blocking, logs errors internally)
  startClaudeUsagePolling({
    info: (msg: string) => prettyLog("claude-usage", msg),
    error: (_err: unknown, msg: string) => prettyLog("claude-usage", msg),
  });
} catch (err) {
  prettyLog("server", `Fatal error: ${err}`);
  process.exit(1);
}
