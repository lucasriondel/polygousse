# Debug Logging

The API server has granular, env-var-gated debug logging. Each category is controlled by its own environment variable and produces zero overhead when disabled (the debug functions resolve to no-ops at import time).

## Environment Variables

| Variable | Category | What it logs |
| --- | --- | --- |
| `POLYGOUSSE_DEBUG_ORCHESTRATOR` | orchestrator | State machine transitions, hook wait/match/timeout, session end |
| `POLYGOUSSE_DEBUG_SETTINGS` | settings | Setting reads, upserts, and deletes |
| `POLYGOUSSE_DEBUG_TASK_LIFECYCLE` | task-lifecycle | Task creation, status transitions, start routing, tmux commands, session teardown (tmux kill, worktree removal, DB completion) |
| `POLYGOUSSE_DEBUG_HOOKS` | hooks | Hook event processing pipeline: event entry, orchestrator bus emit, plan-handoff, ralph start/stop, resolved session status |
| `POLYGOUSSE_DEBUG_WS` | ws | WebSocket dispatch (action name, success/error), broadcast (event type + client count) |
| `POLYGOUSSE_DEBUG_ALL` | all | Enables every category above |

Set any variable to a truthy value (e.g. `=1`) to enable it.

## Usage

Enable a single category:

```sh
POLYGOUSSE_DEBUG_ORCHESTRATOR=1 bun run dev
```

Combine multiple categories:

```sh
POLYGOUSSE_DEBUG_ORCHESTRATOR=1 POLYGOUSSE_DEBUG_HOOKS=1 bun run dev
```

Enable everything:

```sh
POLYGOUSSE_DEBUG_ALL=1 bun run dev
```

## Output Format

Debug lines are printed via `prettyLog` with a `dbg:<category>` subsystem label. Each category has a distinct ANSI color. When a session ID is available, it appears as a colored `[shortId]` prefix:

```
10:18:23 [3ec34bf3] dbg:orchestrator    Entering state "waitForPlan" (step: plan)
10:18:23 [3ec34bf3] dbg:hooks           Event: PermissionRequest
10:18:24            dbg:ws              Broadcast: task:updated → 2 client(s)
```

## Color Legend

| Subsystem | Color |
| --- | --- |
| `dbg:orchestrator` | rose |
| `dbg:settings` | sky |
| `dbg:task-lifecycle` | emerald |
| `dbg:hooks` | indigo |
| `dbg:ws` | teal |

## Implementation

The debug system lives in `src/debug.ts`. It exports one function per category:

- `debugOrchestrator(message, sessionId?)`
- `debugSettings(message, sessionId?)`
- `debugTaskLifecycle(message, sessionId?)`
- `debugHooks(message, sessionId?)`
- `debugWs(message, sessionId?)`

Each function is created by `makeDebugFn()` which reads the env var once at import time and returns either a `prettyLog` wrapper or a no-op.
