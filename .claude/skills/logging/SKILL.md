---
name: logging
description: >
  Polygousse API logging system conventions and patterns. Use this skill whenever
  adding logging, debug output, or console.log statements to the API, or when
  trying to understand how the logging system works. Also use it when adding a new
  subsystem, service, or orchestrator that needs log output — even if the user
  doesn't explicitly say "logging", if they're building something in the API that
  will need operational visibility, consult this skill.
---

# Polygousse API Logging

The API uses a two-tier logging architecture. Both tiers output colored, human-readable
lines to the terminal. Pino's default request logging is disabled
(`disableRequestLogging: true` in `apps/api/src/create-app.ts`), so **all**
human-readable output flows through this system.

## Output format

Every log line follows the same shape:

```
HH:MM:SS [shortId] subsystem           message
```

- `HH:MM:SS` — dimmed timestamp
- `[shortId]` — first 8 chars of the session ID, deterministically colored from a
  12-color palette (so the same session always gets the same color). Omitted when
  there's no session context.
- `subsystem` — padded to 20 chars, colored per the subsystem color map
- `message` — dimmed free-text

## Tier 1 — Always-on subsystem logging (`pretty-log.ts`)

**File:** `apps/api/src/pretty-log.ts`

Two exports:

| Function | Purpose |
|----------|---------|
| `prettyLog(subsystem, message, sessionId?)` | General subsystem messages |
| `prettyHookEvent(body)` | Claude Code hook events (formats event name + detail) |

These are always active — no env vars needed.

### Existing subsystems

Each subsystem has a color defined in `SUBSYSTEM_COLOR_MAP` (~line 80):

- `server` — server lifecycle (startup, shutdown, signal handling)
- `orchestrator` — state machine events
- `plan-handoff` — plan handoff logic
- `claude-usage` — Claude API usage polling
- `ws` — WebSocket dispatch
- All `dbg:*` categories (see Tier 2 below)

### Adding a new always-on subsystem

1. Import `prettyLog` from `./pretty-log.js`
2. Call `prettyLog("my-subsystem", "what happened", sessionId?)`
3. Add `"my-subsystem"` to `SUBSYSTEM_COLOR_MAP` in `pretty-log.ts` with an ANSI
   color constant (pick one that's visually distinct from existing entries)

That's it — no env vars, no registration, just add the color mapping and start logging.

## Tier 2 — Debug logging (`debug.ts`)

**File:** `apps/api/src/debug.ts`

Debug functions are **resolved at import time**: if the corresponding env var is
unset, the export is a no-op function (zero runtime cost). If set, it delegates
to `prettyLog` with a `dbg:<category>` prefix.

### Enabling debug output

```bash
# Single category
POLYGOUSSE_DEBUG_ORCHESTRATOR=1 bun run dev

# Multiple categories
POLYGOUSSE_DEBUG_ORCHESTRATOR=1 POLYGOUSSE_DEBUG_HOOKS=1 bun run dev

# Everything
POLYGOUSSE_DEBUG_ALL=1 bun run dev
```

Values `"0"` and `"false"` are treated as falsy (via the `isTruthy` helper).

### Existing debug categories

| Export | Env var | What it logs |
|--------|---------|-------------|
| `debugOrchestrator` | `POLYGOUSSE_DEBUG_ORCHESTRATOR` | State machine transitions, hook wait/match/timeout |
| `debugSettings` | `POLYGOUSSE_DEBUG_SETTINGS` | Setting reads, upserts, deletes |
| `debugTaskLifecycle` | `POLYGOUSSE_DEBUG_TASK_LIFECYCLE` | Task creation, status transitions, tmux commands, teardown |
| `debugHooks` | `POLYGOUSSE_DEBUG_HOOKS` | Hook event pipeline, plan-handoff, ralph start/stop |
| `debugWs` | `POLYGOUSSE_DEBUG_WS` | WebSocket dispatch, broadcast (event type + client count) |

### Adding a new debug category

Four changes across two files:

**In `apps/api/src/debug.ts`:**

1. Add your category to the `DebugCategory` union type:
   ```ts
   type DebugCategory = "orchestrator" | "settings" | ... | "my-category";
   ```

2. Add the env var mapping to `ENV_MAP`:
   ```ts
   "my-category": "POLYGOUSSE_DEBUG_MY_CATEGORY",
   ```

3. Export the debug function at the bottom:
   ```ts
   export const debugMyCategory = makeDebugFn("my-category");
   ```

**In `apps/api/src/pretty-log.ts`:**

4. Add a color entry to `SUBSYSTEM_COLOR_MAP`:
   ```ts
   "dbg:my-category": TEAL,
   ```

Then import and call `debugMyCategory("message", sessionId?)` wherever needed.

## When to use which tier

- **Tier 1 (`prettyLog`)** — Important operational events that should always be
  visible: server lifecycle, errors, state transitions, completion messages. Think
  "would I want to see this in production?"

- **Tier 2 (`debug*`)** — Verbose diagnostic output for development and debugging:
  individual function calls, data values, intermediate state. Things that would be
  noise in normal operation but invaluable when tracking down a bug.

## Things to avoid

- **Don't use `console.log` directly** — use `prettyLog` or a debug function so
  output stays consistent and colorized.
- **Don't use `app.log`** (Pino) for human-readable messages — Pino outputs JSON
  which is hard to read in the terminal. It's still there for structured logging
  if needed, but `prettyLog` is the primary output channel.
- **Don't forget the color mapping** — if you add a subsystem or debug category
  without adding it to `SUBSYSTEM_COLOR_MAP`, it falls back to magenta, which
  makes it hard to distinguish from other unlabeled subsystems.
