# Polygousse Task Execution Flows

## Architecture Overview

Polygousse orchestrates Claude Code CLI sessions inside **tmux** terminals, streamed to the browser via a **PTY bridge**. Communication uses two WebSocket channels:

| Channel | Port | Purpose |
|---------|------|---------|
| **App WebSocket** | 5616 | RPC calls + event broadcasting (JSON) |
| **Terminal WebSocket** | 5617 | Raw terminal I/O (binary, via node-pty) |

---

## 1. WebSocket Protocol

### Request/Response (RPC)

```
Client -> Server:  { id: "req_xxx", action: "task:start", payload: {...} }
Server -> Client:  { id: "req_xxx", ok: true, data: {...} }
                   { id: "req_xxx", ok: false, error: "message" }
```

30-second timeout per request. Unique IDs correlate responses.

### Broadcast Events (Pub/Sub)

Server pushes events to **all** connected clients. Events are also persisted to the `session_events` table when a `terminalSessionId` can be resolved.

**Full event catalog:**

| Category | Events |
|----------|--------|
| **Task** | `task:created`, `task:updated`, `task:deleted`, `task:reordered`, `task:attachment:created`, `task:attachment:deleted` |
| **Terminal** | `terminal-session:created`, `terminal-session:updated` |
| **Claude** | `claude-session:created`, `claude-session:updated` |
| **Ralph** | `ralph-session:created`, `ralph-session:updated` |
| **Orchestrator** | `orchestrator:created`, `orchestrator:updated` |
| **Hook** | `hook-event:raw` |
| **Workspace** | `workspace:created`, `workspace:updated`, `workspace:deleted` |
| **Folder** | `folder:created`, `folder:updated`, `folder:deleted`, `folder:reordered` |
| **Settings** | `setting:updated`, `setting:deleted` |
| **Other** | `claude-usage:updated`, `linear-task-link:created` |

---

## 2. Task Lifecycle

### States: `todo` -> `doing` -> `done` (or `waiting_for_input`)

### WS Actions

| Action | Description |
|--------|-------------|
| `task:create` | Create task (status: `todo`) |
| `task:start` | Start task execution (dispatches to a start mode) |
| `task:update` | Update title/description/status |
| `session:send-message` | Send user input to tmux |
| `session:complete-task` | Manual completion + teardown |
| `session:commit-and-complete` | Commit then complete (orchestrator) |
| `session:extract-prd` | Extract plan and start Ralph (orchestrator) |
| `session:terminate` | Kill session without completing task |

---

## 3. Three Start Modes

When `task:start` is received, the dispatcher selects a mode:

```
if (planMode && ralphMode)  -> startPlanRalph()
else if (ralphMode)         -> startRalphOnly()
else                        -> startStandard()
```

### Mode A: Standard

**Flow:**

```
1. Create tmux session (detached, with cwd)
     tmux new-session -d -s {terminalSessionId} -c {cwd}
     Export POLYGOUSSE_TERMINAL_SESSION_ID env var
2. Write prompt to temp file (/tmp/polygousse-prompt-{id}.md)
3. Build claude command with flags
     claude [--permission-mode plan | --dangerously-skip-permissions]
            --session-id {claudeSessionId} "$(cat /tmp/...)"
4. Send command to tmux via tmuxSendKeys()
5. Create DB records: terminal_session, claude_session (status: "preparing")
6. Update task: todo -> doing
```

**Events broadcast:**

- `terminal-session:created`
- `claude-session:created`
- `task:updated` (status: doing)

### Mode B: Ralph Only

**Flow:**

```
1. Create tmux session
2. Create ralph_session DB record
3. Export POLYGOUSSE_RALPH_SESSION_ID env var
4. Execute: ralph --iterations {maxIterations}
5. Update task: todo -> doing
```

**Events broadcast:**

- `terminal-session:created`
- `ralph-session:created`
- `task:updated`

### Mode C: Plan + Ralph

**Flow:**

```
1. Create tmux session
2. Start Claude with --permission-mode plan
3. Fire-and-forget: orchestratePlanPlusRalph() (background state machine)
4. Update task: todo -> doing
```

**Events broadcast:**

- `terminal-session:created`
- `claude-session:created`
- `task:updated`
- Later: `orchestrator:created`, `orchestrator:updated` (as steps progress)
- Later: `ralph-session:created` (when orchestrator spawns ralph)

---

## 4. Hook Events (Claude CLI -> Server)

Claude Code sends HTTP POST to `/hooks/event` at key lifecycle points. These are the backbone of status tracking.

### Hook Event Types & Status Mapping

| Hook Event | Claude Session Status | Meaning |
|------------|----------------------|---------|
| `SessionStart` | `ongoing` | Claude started running |
| `UserPromptSubmit` | `ongoing` | User submitted input |
| `PreToolUse` | *(no change)* | About to call a tool |
| `PermissionRequest` | `waiting_input` | Needs permission approval |
| `PostToolUse` | *(no change)* | Tool call finished |
| `PostToolUseFailure` | *(no change)* | Tool call failed |
| `Notification` (permission/idle) | `waiting_input` | Waiting for user |
| `SubagentStart` | *(no change)* | Subagent spawned |
| `SubagentStop` | *(no change)* | Subagent ended |
| `Stop` | `idle` | Claude finished thinking |
| `TaskCompleted` | *(no change)* | Task marked complete |
| `PreCompact` | *(no change)* | About to compact context |
| `SessionEnd` | `completed` | Session fully ended |

### Hook Processing Pipeline (`processHookEvent()`)

```
HTTP POST /hooks/event
    |
    +-- 1. Insert raw event into hook_events table
    +-- 2. Broadcast hook-event:raw via WebSocket (for debug UI)
    +-- 3. Emit hook:received on orchestratorBus (for state machines)
    +-- 4. Try plan-handoff linking (for new sessions after plan mode)
    +-- 5. Process Ralph events (if SessionStart/Stop with ralph context)
    |       +-- SessionStart: update ralph iteration count
    |       +-- Stop: check for "<ralph:done>" or "hit your limit"
    +-- 6. Resolve status via resolveStatus(hookEventName)
    +-- 7. Upsert claude_session with new status
    +-- 8. Broadcast claude-session:created or claude-session:updated
```

### Hook Event Payload

```typescript
{
  session_id: string;              // Claude session UUID
  hook_event_name: HookEventName;
  cwd: string;
  terminal_session_id?: string;    // From env var POLYGOUSSE_TERMINAL_SESSION_ID
  ralph_session_id?: string;       // From env var POLYGOUSSE_RALPH_SESSION_ID
  ralph_iteration?: number;
  tool_name?: string;
  tool_input?: any;
  notification_type?: string;      // "permission_prompt" | "idle_prompt"
  message?: string;
  last_assistant_message?: string;
  transcript_path?: string;
}
```

---

## 5. Orchestrator Framework

A **generic state machine runner** that sequences complex multi-step flows. Each state has:

- **stepName** - display name
- **trigger** - one of:
  - `hook` - wait for a specific hook event (with timeout)
  - `immediate` - execute now
  - `delay` - sleep for N ms
- **action** - async function to execute
- **next** - name of the next state

### State Machine Loop

```
for each state in STATE_ORDER:
    1. Mark step as "active"
    2. Broadcast orchestrator:updated
    3. If trigger is "hook":
         Wait for matching hook event on orchestratorBus
         (filters by session_id, hook_event_name, optional tool_name)
         (timeout = 30-600s depending on step)
    4. If trigger is "delay":
         await sleep(ms)
    5. Execute action(ctx, hookEvent?)
    6. Mark step as "completed"
    7. Broadcast orchestrator:updated
    8. Move to next state

On error: mark step as "error", broadcast, stop
```

### Orchestrator A: Plan + Ralph (`plan-ralph.ts`)

```
+-----------------------------+
| awaiting_exit_plan_mode     |  hook: PermissionRequest/ExitPlanMode (600s)
|   Wait for Claude to finish |
|   planning                  |
+-------------+---------------+
              |
              v
+-----------------------------+
| extracting_plan             |  immediate
|   Validate plan from        |
|   tool_input                |
+-------------+---------------+
              |
              v
+-----------------------------+
| writing_prd                 |  immediate
|   Write PRD.md to cwd       |
+-------------+---------------+
              |
              v
+-----------------------------+
| stopping_plan_session       |  immediate
|   Send Escape + "/exit"     |
|   to tmux                   |
+-------------+---------------+
              |
              v
+-----------------------------+
| awaiting_session_end        |  hook: SessionEnd (30s)
|   Wait for Claude to exit   |
+-------------+---------------+
              |
              v
+-----------------------------+
| pausing_for_shell           |  delay: 1000ms
|   Let shell clean up        |
+-------------+---------------+
              |
              v
+-----------------------------+
| starting_ralph              |  immediate
|   Create ralph_session      |
|   Export env vars            |
|   Execute ralph command      |
+-----------------------------+
```

### Orchestrator B: Extract PRD + Ralph (`extract-prd-ralph.ts`)

```
+-----------------------------+
| writing_prd_from_event      |  immediate
|   Write already-extracted   |
|   plan to PRD.md            |
+-------------+---------------+
              |
              v
+-----------------------------+
| stopping_session            |  immediate
|   Send Escape + "/exit"     |
+-------------+---------------+
              |
              v
+-----------------------------+
| awaiting_session_end        |  hook: SessionEnd (30s)
+-------------+---------------+
              |
              v
+-----------------------------+
| pausing_for_shell           |  delay: 1000ms
+-------------+---------------+
              |
              v
+-----------------------------+
| starting_ralph              |  immediate
+-----------------------------+
```

### Orchestrator C: Commit + Complete (`commit-complete.ts`)

```
+-----------------------------+
| sending_commit              |  immediate
|   tmuxSendKeys("commit      |
|   this")                    |
+-------------+---------------+
              |
              v
+-----------------------------+
| awaiting_commit_stop        |  hook: Stop (120s)
|   Wait for Claude to finish |
|   committing                |
+-------------+---------------+
              |
              v
+-----------------------------+
| completing_task             |  immediate
|   teardownSession()         |
|   Mark task as "done"       |
+-----------------------------+
```

---

## 6. Plan Handoff (Session Linking)

When Claude exits plan mode, it can spawn a **new session with a new ID**. The system must link it back to the same terminal session. Three strategies, tried in order:

| Strategy | Mechanism | Reliability |
|----------|-----------|-------------|
| **0** | `terminal_session_id` from env var `POLYGOUSSE_TERMINAL_SESSION_ID` | Best |
| **1** | Parse transcript for back-reference to previous session ID | Good |
| **2** | Find recently ended session in same `cwd` | Fallback |

---

## 7. Ralph Loop Processing

### On `SessionStart` hook

- Extract `ralph_session_id` and `ralph_iteration` from hook body
- Update `ralph_sessions.current_iteration` in DB
- Create link in `ralph_claude_sessions` table
- Broadcast `ralph-session:updated`

### On `Stop` hook

- Check `last_assistant_message` for `"you've hit your limit"` -> status: `limit_hit`
- Check for `<ralph:done>` marker -> status: `completed`
- If ralph limit hit during idle, override claude session status to `limit_hit`
- Broadcast `ralph-session:updated`

---

## 8. Terminal I/O (PTY Bridge)

Separate Node.js process on port 5617:

```
Browser (xterm.js)
    ^ WebSocket (binary)
    v
PTY Bridge
    ^ node-pty
    v
tmux attach-session -t {sessionId}
    ^
    v
tmux session (running Claude Code)
```

- **Terminal -> Browser**: `ptyProcess.onData(data) -> ws.send(data)`
- **Browser -> Terminal**: `ws.on("message") -> ptyProcess.write(data)`
- **Resize**: JSON `{ type: "resize", cols, rows }` -> `ptyProcess.resize()`

### tmuxSendKeys

Intelligent command sending to tmux with:

- **Chunking**: commands > 1024 bytes are split with `\` line continuation
- **30ms delay** between chunks to avoid buffer overflow
- **Literal mode** (`-l` flag) for raw text without shell interpretation

---

## 9. Session Teardown

Triggered by `session:complete-task`, `session:terminate`, or orchestrator completion:

```
teardownSession(terminalSessionId)
    |
    +-- 1. Kill tmux session (best-effort)
    |       tmux kill-session -t {id}
    +-- 2. Remove git worktree (if not in workspace folder)
    +-- 3. Mark all claude_sessions as "completed" (transactional)
    +-- 4. Mark ralph_session as completed (if running)
    +-- 5. Remove orchestrator from in-memory Map
    +-- 6. Broadcast:
           +-- terminal-session:updated (status: completed)
           +-- claude-session:updated (status: completed)
           +-- ralph-session:updated (if applicable)
           +-- task:updated (status: done, completed_at set)
```

---

## 10. Client-Side Event Processing

### Initialization

```
App mounts -> StoreHydrator
    +-- Connect WebSocket (ref counted, auto-reconnect 3s)
    +-- wsRequest("hydrate") -> loads all workspaces, tasks, folders,
                                 sessions, settings into Zustand Maps
```

### Event Pipeline

```
WebSocket message arrives
    +-- Has {id, ok}? -> Resolve pending RPC request
    +-- Broadcast event:
         +-- In STORE_EVENT_TYPES? -> store.applyEvent(event)
         |     +-- Shallow equality check -> skip if unchanged
         +-- Dispatch to local subscribers (debug pages, session views)
```

### Store Structure (all Maps for O(1) lookup)

```
AppState
 +-- workspaces: Map<id, Workspace>
 +-- tasks: Map<id, Task>
 +-- folders: Map<id, TaskFolder>
 +-- attachments: Map<id, TaskAttachment>
 +-- claudeSessions: Map<id, ClaudeSession>
 +-- ralphSessions: Map<id, RalphSession>
 +-- settings: Map<key, value>
 +-- linearTaskLinks: Map<taskId, LinearTaskLink>
```

---

## 11. Complete Flow Diagram: Standard Task

```
USER clicks "Run Task"
    |
    v
Client: wsRequest("task:start", {taskId, permissionMode, cwd})
    |
    v
Server: startStandard()
    +-- Create tmux session
    +-- Write prompt to /tmp file
    +-- tmuxSendKeys(claude --session-id ... "$(cat /tmp/...)")
    +-- Insert terminal_session, claude_session (preparing)
    +-- Update task: todo -> doing
    +-- Broadcast: terminal-session:created, claude-session:created, task:updated
    |
    v
Claude Code starts in tmux
    |
    +-- POST /hooks/event {SessionStart} -> status: ongoing
    |     +-- Broadcast: claude-session:updated
    |
    +-- POST /hooks/event {PreToolUse}   -> (no status change)
    +-- POST /hooks/event {PostToolUse}  -> (no status change)
    |
    +-- POST /hooks/event {PermissionRequest} -> status: waiting_input
    |     +-- Broadcast: claude-session:updated
    |     +-- User sees prompt in UI -> sends input via session:send-message
    |           +-- tmuxSendKeys(input) -> Claude resumes
    |
    +-- POST /hooks/event {Stop} -> status: idle
    |     +-- Broadcast: claude-session:updated
    |
    +-- ... (loop continues until user acts)
    |
    v
USER clicks "Complete Task" (or "Commit & Complete")
    |
    v
    +-- "Complete Task":
    |     wsRequest("session:complete-task")
    |     +-- teardownSession() -> task: done
    |
    +-- "Commit & Complete":
          wsRequest("session:commit-and-complete")
          +-- Orchestrator: send "commit this" -> wait Stop -> teardown -> done
```

---

## 12. Database Schema (Entity Relationships)

```
Task.session_id ----------FK----------> TerminalSession.id
                                              ^
ClaudeSession.terminal_session_id -----FK-----+
                                              ^
RalphSession.terminal_session_id ------FK-----+

RalphClaudeSession links Ralph <-> Claude sessions (M:N)

HookEvent.session_id -> ClaudeSession.id
SessionEvent.terminal_session_id -> TerminalSession.id
```

---

## Key Source Files

| File | Purpose |
|------|---------|
| `apps/api/src/orchestrator.ts` | Generic state machine runner |
| `apps/api/src/orchestrators/*.ts` | 3 concrete orchestrator implementations |
| `apps/api/src/services/start-task/*.ts` | Task startup mode dispatchers |
| `apps/api/src/services/hook-processing/*.ts` | Hook event ingestion & processing |
| `apps/api/src/services/task-completion.ts` | Session teardown logic |
| `apps/api/src/services/session-enricher.ts` | Batch session enrichment (5 queries) |
| `apps/api/src/ws/index.ts` | WebSocket broadcast & routing |
| `apps/api/src/ws/register-handlers.ts` | WS action handler implementations |
| `apps/api/src/routes/hooks.ts` | HTTP hook event endpoint |
| `apps/api/src/tmux.ts` | tmux command sending with chunking |
| `apps/api/src/pty-bridge.ts` | PTY bridge (separate process, port 5617) |
| `apps/web/src/lib/ws-client.ts` | WebSocket client with RPC |
| `apps/web/src/hooks/use-app-socket.ts` | App socket hook with event subscriptions |
| `apps/web/src/store/apply-event.ts` | Client event processing |
| `packages/types/src/index.ts` | Shared type definitions |
