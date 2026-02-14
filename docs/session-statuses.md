# Session & Task Statuses

This document describes all possible statuses for terminal sessions, Claude (agent) sessions, Ralph sessions, tasks, and orchestrators in Polygousse.

---

## Terminal Session

A terminal session represents a tmux session used to run Claude CLI instances.

| Status | Description |
| --- | --- |
| `active` | The tmux session is running. This is the default status on creation. |
| `completed` | The tmux session has been torn down. The `ended_at` timestamp is set. |

**Lifecycle:**

```
active ──→ completed
```

Terminal sessions are created as `active` and transition to `completed` when explicitly torn down (via `completeTerminalSession()` or `teardownSessionDb()`).

**Type:** `TerminalSessionStatus = "active" | "completed"`

---

## Claude Session (Agent Session)

A Claude session represents a single Claude CLI invocation running inside a terminal session. Its status is driven by hook events emitted by the Claude CLI.

| Status | Description |
| --- | --- |
| `preparing` | The session record has been created in the database but the Claude CLI has not started yet. |
| `ongoing` | Claude is actively processing — either the session just started (`SessionStart`) or the user submitted a prompt (`UserPromptSubmit`). |
| `idle` | Claude has finished its current turn (`Stop` event). It is not processing but the session is still alive. |
| `waiting_input` | Claude is blocked on user input — either a permission prompt or an idle prompt (`Notification` event). |
| `error` | The session encountered an error. |
| `limit_hit` | Claude hit a usage/rate limit during the session. Detected when a `Stop` event carries a `limit_hit` sub-status. |
| `completed` | The session has ended (`SessionEnd` event). This is a terminal status. |

**Lifecycle:**

```
                    ┌──────────────────────────┐
                    │                          │
                    ▼                          │
preparing ──→ ongoing ──→ idle ──→ ongoing ────┘
                 │          │
                 │          ├──→ completed
                 │          │
                 │          └──→ limit_hit ──→ completed
                 │
                 ├──→ waiting_input ──→ ongoing
                 │
                 └──→ completed
```

**Hook event → status mapping:**

| Hook Event | Resulting Status |
| --- | --- |
| `SessionStart` | `ongoing` |
| `UserPromptSubmit` | `ongoing` |
| `Stop` | `idle` |
| `Stop` (with `limit_hit`) | `limit_hit` |
| `Notification` (`permission_prompt` or `idle_prompt`) | `waiting_input` |
| `SessionEnd` | `completed` |
| `PreToolUse`, `PostToolUse`, `PermissionRequest`, etc. | _(no change)_ |

**Type:** `ClaudeSessionStatus = "preparing" | "ongoing" | "idle" | "waiting_input" | "error" | "limit_hit" | "completed"`

---

## Ralph Session (Automated Iteration Loop)

A Ralph session represents an automated iteration loop that repeatedly invokes Claude to complete a task.

| Status | Description |
| --- | --- |
| `running` | The loop is actively iterating. This is the default status on creation. |
| `completed` | The loop finished successfully. |
| `failed` | The loop encountered an error and stopped. |
| `max_iterations_reached` | The loop hit its configured maximum number of iterations without completing. |
| `limit_hit` | Claude hit a usage/rate limit during one of the iterations. |

**Lifecycle:**

```
running ──→ completed
        ├──→ failed
        ├──→ max_iterations_reached
        └──→ limit_hit
```

All terminal statuses are set via `completeRalphSession(status, id)`.

**Type:** `RalphSessionStatus = "running" | "completed" | "failed" | "max_iterations_reached" | "limit_hit"`

---

## Task

A task represents a unit of work to be accomplished by Claude.

| Status | Description |
| --- | --- |
| `todo` | The task has not been started yet. |
| `doing` | The task is currently being worked on. |
| `done` | The task has been completed. Displayed with strikethrough in the UI. |
| `waiting_for_input` | The task is paused, waiting for user input before it can continue. |

**Lifecycle:**

```
         ┌──────────────────────┐
         │                      │
         ▼                      │
todo ──→ doing ──→ done ────────┘  (manual cycle)
  │        │
  │        └──→ waiting_for_input ──→ doing
  │
  └──→ doing  (task can only be started from todo or waiting_for_input)
```

Tasks can be started when their status is `todo` or `waiting_for_input`. The UI provides a `cycleStatus()` function that cycles: `todo → doing → done → todo`.

**Type:** `TaskStatus = "todo" | "doing" | "done" | "waiting_for_input"`

---

## Orchestrator

An orchestrator coordinates multi-step workflows (e.g., planning then executing with Ralph). It runs a state machine of sequential steps.

### Orchestrator Status

| Status | Description |
| --- | --- |
| `running` | The orchestrator is actively executing its step sequence. |
| `completed` | All steps finished successfully. |
| `error` | A step failed and the orchestrator stopped. |

### Orchestrator Step Status

| Status | Description |
| --- | --- |
| `pending` | The step has not started yet. |
| `active` | The step is currently executing. |
| `completed` | The step finished successfully. |
| `error` | The step encountered an error. |

**Step lifecycle:**

```
pending ──→ active ──→ completed
                   └──→ error
```

**Orchestrator lifecycle:**

```
running ──→ completed  (all steps completed)
        └──→ error     (a step errored)
```

### Available Orchestrator Flows

| Flow | Steps |
| --- | --- |
| **Plan + Ralph** | `wait_for_exit_plan_mode` → `extract_plan` → `write_prd` → `stop_plan_session` → `wait_for_session_end` → `pause_for_shell` → `start_ralph_loop` |
| **Extract PRD + Ralph** | `write_prd_from_event` → `stop_session` → `wait_for_session_end_2` → `pause_for_shell_2` → `start_ralph_from_prd` |
| **Commit + Complete** | `send_commit` → `wait_for_commit_stop` → `complete_task` |

**Types:**
- `OrchestratorStatus = "running" | "completed" | "error"`
- `OrchestratorStepStatus = "pending" | "active" | "completed" | "error"`

---

## Claude Usage Status

Tracks the state of the Claude CLI usage polling mechanism (internal, not persisted).

| Status | Description |
| --- | --- |
| `initializing` | Polling has started, waiting for the first successful read. |
| `ready` | Usage data has been successfully parsed and is available. |
| `error` | Failed to parse usage data or CLI returned an error. |

**Type:** `UsageStatus = "initializing" | "ready" | "error"` _(internal to `claude-usage.ts`)_

---

## UI Indicators

### Claude Session Icons

| Status | Icon | Color | Animation |
| --- | --- | --- | --- |
| `preparing` | CircleDot | Gray | Pulsing |
| `ongoing` | CircleDot | Blue | Pulsing |
| `idle` | CheckCircle | Green | — |
| `waiting_input` | CirclePause | Amber | — |
| `error` | CircleAlert | Red | — |
| `limit_hit` | CircleAlert | Orange | — |
| `completed` | CheckCircle | Green | — |

### Task Status Icons

| Status | Icon | Color | Animation |
| --- | --- | --- | --- |
| `todo` | Circle | Muted gray | — |
| `doing` | CircleDot | Blue | Pulsing |
| `waiting_for_input` | CirclePause | Amber | — |
| `done` | CircleCheck | Green | — |

---

## Source of Truth

All status types are defined in [`packages/types/src/index.ts`](../packages/types/src/index.ts).

Key implementation files:

| File | Purpose |
| --- | --- |
| `packages/types/src/index.ts` | Type definitions |
| `apps/api/src/services/hook-processing/resolve-status.ts` | Hook event → Claude session status |
| `apps/api/src/orchestrator.ts` | State machine runner |
| `packages/database/src/schema.ts` | Database schema with default statuses |
| `apps/web/src/components/session-icon.tsx` | Claude session status icons |
| `apps/web/src/components/task-item/status-icon.tsx` | Task status icons |
