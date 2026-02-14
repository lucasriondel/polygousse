import {
  completeRalphSession,
  createRalphClaudeSession,
  getTaskBySessionId,
  updateRalphIteration,
  updateTask,
} from "@polygousse/database";
import { debugHooks } from "../../debug.js";
import { broadcast } from "../../ws/index.js";
import type { HookEventBody } from "./resolve-status.js";

/** Process ralph loop fields on SessionStart */
export function processRalphSessionStart(
  sessionId: string,
  body: HookEventBody,
): void {
  const ralphSessionId = body.ralph_session_id as string | undefined;
  const ralphIteration = body.ralph_iteration as number | undefined;

  if (ralphSessionId && ralphIteration != null) {
    debugHooks(`Ralph SessionStart: iteration=${ralphIteration}`, sessionId);
    const updatedRalph = updateRalphIteration.get(
      ralphIteration,
      ralphSessionId,
    );
    if (updatedRalph) {
      broadcast({ type: "ralph-session:updated", session: updatedRalph });
    }
    createRalphClaudeSession.get(ralphSessionId, sessionId, ralphIteration);
  }
}

const LIMIT_HIT_RE = /you've hit your limit/i;
const AUTH_EXPIRED_RE = /OAuth token has expired|authentication_error/i;

/** Mark ralph session as completed when Stop arrives with <ralph:done/>, limit hit, or auth expired */
export function processRalphStop(body: HookEventBody): {
  limitHit: boolean;
  authExpired: boolean;
} {
  const ralphSessionId = body.ralph_session_id as string | undefined;
  const lastMsg = body.last_assistant_message as string | undefined;

  const limitHit = LIMIT_HIT_RE.test(lastMsg ?? "");
  const authExpired = AUTH_EXPIRED_RE.test(lastMsg ?? "");
  debugHooks(
    `Ralph Stop: limitHit=${limitHit}, authExpired=${authExpired}`,
    body.session_id,
  );

  if (authExpired && ralphSessionId) {
    const completed = completeRalphSession.get("failed", ralphSessionId);
    if (completed) {
      broadcast({ type: "ralph-session:updated", session: completed });
    }
    return { limitHit, authExpired };
  }

  if (limitHit && ralphSessionId) {
    const completed = completeRalphSession.get("limit_hit", ralphSessionId);
    if (completed) {
      broadcast({ type: "ralph-session:updated", session: completed });
    }
    return { limitHit, authExpired };
  }

  if (ralphSessionId && lastMsg?.endsWith("<ralph:done/>")) {
    const completed = completeRalphSession.get("completed", ralphSessionId);
    if (completed) {
      broadcast({ type: "ralph-session:updated", session: completed });

      const task = getTaskBySessionId.get(completed.terminal_session_id);
      if (task && task.status === "doing") {
        const updatedTask = updateTask.get(
          task.title,
          task.description,
          "done",
          null,
          new Date().toISOString(),
          task.id,
        );
        if (updatedTask) broadcast({ type: "task:updated", task: updatedTask });
      }
    }
  }

  return { limitHit, authExpired };
}
