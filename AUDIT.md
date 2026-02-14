# Polygousse — Quality Audit Report

**Date:** 2026-02-18
**Codebase:** ~5,000 LOC across 4 packages, 74 commits
**Branch:** `new-session-status-by-event-system`

---

## Executive Summary

Polygousse is a Bun/TypeScript monorepo that orchestrates Claude Code sessions through a Fastify API, SQLite database, PTY bridge, and React 19 frontend. The architecture is sound and well-structured, but the project has significant gaps in **error handling**, **input validation**, **testing**, and **documentation** that would need to be addressed before any production use.

| Area | Grade | Summary |
|------|-------|---------|
| Architecture | **B+** | Clean monorepo, clear separation of concerns |
| Type Safety | **B** | Strict mode enabled, but many unsafe `as` casts |
| Error Handling | **D** | Widespread missing try-catch, no error boundaries |
| Security | **C-** | No input validation, hardcoded CORS, filesystem browsing unrestricted |
| Testing | **F** | Zero tests, no test framework configured |
| Documentation | **F** | No README, no API docs, no setup guide |
| Performance | **C+** | Missing DB indexes, no memoization, no pagination |
| Reliability | **C** | No graceful shutdown, no zombie process cleanup |
| Code Quality | **B-** | Some duplication and magic numbers, generally clean |
| DevOps/CI | **F** | No CI/CD, no linting, no formatting |

**Overall: C+** — Solid prototype, not production-ready.

---

## 1. Architecture & Project Structure

### What works well

- **Turborepo monorepo** with clear `apps/` and `packages/` separation
- Shared TypeScript configs via `@polygousse/typescript-config`
- Clean dependency graph: `web → api → database`, no circular deps
- Event-driven architecture: Claude hooks → CLI → API → WebSocket → Frontend
- 6-state session machine (`preparing → ongoing → idle → waiting_input → error → completed`)

### Issues

| # | Issue | Severity |
|---|-------|----------|
| 1 | `turbo.json`: `typecheck` depends on `^build` instead of `^typecheck` — forces full rebuild for type checks | High |
| 2 | Apps missing `composite: true` in tsconfig — breaks incremental builds | Medium |
| 3 | Mixed runtimes: API uses Bun, PTY bridge uses Node.js + tsx | Low |
| 4 | `packages/database` and `packages/cli` have no `build` script — only work as raw TS imports | Medium |

---

## 2. Error Handling

**This is the most critical area.** Errors are consistently unhandled across the stack.

### Frontend

| # | File | Issue |
|---|------|-------|
| 1 | `hooks/use-tasks.ts:32-36` | `refetch()` has no try-catch — loading state never resets on failure |
| 2 | `hooks/use-tasks.ts:56-60` | Same issue in workspace tasks hook |
| 3 | `pages/tasks.tsx:9-35` | `handleUpdate` / `handleDelete` have no error handling |
| 4 | `hooks/use-tasks.ts:72-82` | Optimistic `create()` doesn't rollback on failure |
| 5 | `hooks/use-workspaces.ts` | No error state exposed — errors silently ignored |
| 6 | **No error boundary** | Unhandled render errors crash the entire app |

### Backend

| # | File | Issue |
|---|------|-------|
| 7 | `routes/workspaces.ts:27,44,60` | No try-catch around DB operations — constraint violations crash |
| 8 | `routes/tasks.ts:67-74` | DB insert not wrapped in error handling |
| 9 | `routes/hooks.ts:87-94` | DB insert for hook events has no error handling |
| 10 | `routes/health.ts:20-26` | Readiness check returns HTTP 200 even when DB is down (should be 503) |
| 11 | `ws/index.ts:36-71` | WebSocket message errors silently swallowed |
| 12 | `pty-bridge.ts:73-81` | PTY resize errors silently caught |
| 13 | No `uncaughtException` / `unhandledRejection` handlers on process |

---

## 3. Security

### Critical

| # | Issue | Location |
|---|-------|----------|
| 1 | **Unrestricted filesystem browsing** — `GET /filesystem/browse` accepts any path with no whitelist. Can read `/etc`, `/var`, any system directory | `routes/filesystem.ts:11-35` |
| 2 | **Hardcoded CORS** — Only allows `localhost:5615`, not configurable via env | `index.ts:21-23` |
| 3 | **No input validation** — All routes use `request.body as T` with no runtime checks | All route files |
| 4 | **SQL LIKE injection** — `getWorkspaceByFolderPath` uses `?` in LIKE pattern without escaping `%` and `_` wildcards | `database/src/index.ts:317-319` |

### Medium

| # | Issue | Location |
|---|-------|----------|
| 5 | No request size limits on hook events (DoS vector) | `routes/hooks.ts` |
| 6 | No CSRF protection on mutation endpoints | All POST/PUT/DELETE routes |
| 7 | No rate limiting | All routes |
| 8 | Hook event raw body stored unredacted (may contain sensitive user data) | `routes/hooks.ts:86` |
| 9 | `--dangerously-skip-permissions` passed to Claude (intentional but risky) | `routes/sessions.ts:60` |
| 10 | No session ID format validation (should be UUID) | `routes/sessions.ts:103-108` |

---

## 4. Memory Leaks & Resource Management

### Frontend

| # | Issue | Location |
|---|-------|----------|
| 1 | **Reconnection timer not cleared on unmount** — `setTimeout(connect, 3000)` fires after component destroyed | `pages/home.tsx:38` |
| 2 | `setTerminal(null)` called in cleanup after unmount — causes React warning | `components/terminal-view.tsx:76` |
| 3 | `useAppSocket` reconnect timer may fire after refCount drops to 0 | `hooks/use-app-socket.ts:31-39` |

### Backend

| # | Issue | Location |
|---|-------|----------|
| 4 | **No zombie process cleanup** — if WebSocket disconnects abruptly, PTY process may not be killed | `pty-bridge.ts:41-90` |
| 5 | No WebSocket heartbeat/ping-pong — dead connections stay in `clients` Map forever | `ws/index.ts` |
| 6 | No stale session cleanup — completed sessions and hook events accumulate indefinitely | Database |
| 7 | Graceful shutdown doesn't close PTY bridge or kill tmux sessions | `index.ts:38-45` |

---

## 5. Type Safety

TypeScript strict mode is enabled, which is good. However:

| # | Issue | Location |
|---|-------|----------|
| 1 | Pervasive `as` type assertions without runtime validation | All route handlers |
| 2 | Non-null assertion `sessionId!` used without guard | `app-sidebar.tsx:172` |
| 3 | `useActiveSessions` returns `Task[]` — semantically misleading name | `hooks/use-sessions.ts:6-7` |
| 4 | WebSocket message type cast `data?.type as string` — unsafe | `hooks/use-app-socket.ts:19` |
| 5 | Non-null assertion on array access `taskIds[i]!` | `routes/tasks.ts:114` |

**Recommendation:** Use Fastify's JSON Schema validation or Zod for runtime type checking at API boundaries.

---

## 6. React Patterns

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| 1 | `sessionsByWorkspace` Map recreated every render | Medium | `app-sidebar.tsx:64-72` |
| 2 | `workspaceMap` recreated every render | Low | `pages/inbox.tsx:52` |
| 3 | `grouped` task filter recreated every render | Low | `pages/workspace.tsx:34-39` |
| 4 | `statusGroups` constant duplicated in two files | Low | `workspace.tsx` + `workspace-tasks.tsx` |
| 5 | `eslint-disable react-hooks/exhaustive-deps` suppression | Medium | `terminal-view.tsx:81` |
| 6 | `TaskItem` receives 9+ props — consider composition | Low | `components/task-item.tsx` |
| 7 | Race conditions in refetch — concurrent updates cause stale data | Medium | `pages/tasks.tsx` |
| 8 | No AbortController — requests fire after unmount | Medium | `lib/api.ts` |

---

## 7. Performance

### Database

| # | Issue | Impact |
|---|-------|--------|
| 1 | **Missing index** on `tasks(workspaceId)` | Full table scan on task queries |
| 2 | **Missing index** on `tasks(sessionId)` | Full table scan on session lookups |
| 3 | **Missing index** on `tasks(status, sessionId)` | Full table scan on active task queries |
| 4 | **Missing index** on `claude_sessions(status)` | Full table scan on status filters |
| 5 | **Missing index** on `claude_sessions(workspace_id)` | Full table scan |
| 6 | **Missing index** on `hook_events(session_id)` | Full table scan |
| 7 | **No pagination** — all list endpoints return unbounded results | Memory issues at scale |

### Frontend

| # | Issue | Impact |
|---|-------|--------|
| 8 | No `useMemo` on derived data (maps, filters) | Unnecessary re-computation |
| 9 | No `React.memo` on list items (`TaskItem`, `EventRow`) | Unnecessary re-renders |
| 10 | Debug hooks page renders up to 200 events without virtualization | Perf degradation |
| 11 | WebSocket reconnection uses fixed 3s delay (no exponential backoff) | Server hammering |

---

## 8. API Design

| # | Issue | Location |
|---|-------|----------|
| 1 | No Fastify schema validation — relies on `as` casts | All routes |
| 2 | Inconsistent response envelope — some return arrays, some objects | Multiple routes |
| 3 | Health `/ready` returns 200 on failure (should be 503) | `routes/health.ts` |
| 4 | Task reorder endpoint doesn't validate taskIds belong to workspace | `routes/tasks.ts:105` |
| 5 | No idempotency keys on POST endpoints | All POST routes |
| 6 | Session creation is not transactional — DB record created before tmux, no rollback | `routes/sessions.ts` |
| 7 | Verbose WS message logging — logs full message content | `ws/index.ts:38` |

---

## 9. Testing

**Status: No tests exist.**

- No test framework configured (no vitest, jest, or bun test)
- No test files anywhere in the codebase
- No test scripts in any `package.json`
- Zero test coverage

### Recommended test priorities

1. **Database layer** — prepared statement correctness, migration safety
2. **API routes** — input validation, error responses, status codes
3. **Hook event processing** — session state machine transitions
4. **CLI** — stdin parsing, API communication, error handling
5. **Frontend hooks** — WebSocket reconnection, data fetching lifecycle

---

## 10. Documentation

**Status: Almost nothing exists.**

| Document | Exists? |
|----------|---------|
| `README.md` (root) | No |
| Setup / Getting Started | No |
| API reference | No |
| Architecture overview | No |
| Environment variables guide | No |
| `.env.example` | No |
| Contributing guide | No |
| Database schema docs | No |
| `PRD.md` | Yes |
| `progress.txt` | Yes |

---

## 11. DevOps & CI

| Item | Status |
|------|--------|
| CI/CD pipeline | None |
| Linting (ESLint/Biome) | None |
| Formatting (Prettier/Biome) | None |
| Pre-commit hooks | None |
| Docker / containerization | None |
| Deployment docs | None |
| Monitoring / alerting | None |

---

## 12. CLI Package (`@polygousse/cli`)

The CLI is the critical bridge between Claude hooks and the API. It has multiple issues:

| # | Issue | Severity |
|---|-------|----------|
| 1 | Always exits with code 0 — even on error | Critical |
| 2 | No response status check on fetch | High |
| 3 | No fetch timeout — hangs if server is down | High |
| 4 | No shebang line (`#!/usr/bin/env bun`) | Medium |
| 5 | Empty body exits silently without logging | Low |
| 6 | Hardcoded localhost fallback for API URL | Medium |

---

## Priority Fix Roadmap

### P0 — Critical (fix immediately)

1. Add try-catch to all async operations (frontend hooks + backend routes)
2. Add React error boundary at app root
3. Fix CLI exit codes (exit 1 on error, check response.ok)
4. Add database indexes on frequently queried columns
5. Restrict filesystem browse endpoint to workspace directories
6. Fix health check to return 503 on failure

### P1 — High (fix soon)

7. Add Fastify JSON Schema validation on all routes
8. Make CORS origin configurable via environment variable
9. Create `.env.example` with all required variables
10. Add WebSocket heartbeat/ping-pong for dead connection detection
11. Clear reconnection timers on component unmount
12. Fix turbo.json typecheck dependency (`^build` → `^typecheck`)
13. Add AbortController to frontend API calls
14. Handle zombie PTY processes (kill timeout, process tracking)

### P2 — Medium (plan for)

15. Add test framework (vitest) and write critical path tests
16. Add ESLint + Prettier (or Biome)
17. Create root README.md with setup instructions
18. Add pagination to list endpoints
19. Add `useMemo` for derived data in components
20. Escape SQL LIKE wildcards in `getWorkspaceByFolderPath`
21. Add exponential backoff to WebSocket reconnection
22. Make database path configurable via env

### P3 — Low (nice to have)

23. Add CI pipeline (GitHub Actions)
24. Add pre-commit hooks (lint-staged)
25. Virtualize long lists (debug hooks page)
26. Add request ID tracing across API/WebSocket
27. Write API documentation
28. Add stale session/event cleanup job
29. Centralize status constants (eliminate magic strings)
30. Extract duplicated `statusGroups` constant

---

## 13. Connectivity Audit — Frontend ↔ REST API ↔ WebSocket

_Added 2026-02-18. Deep dive into the three communication layers._

### 13.1 Architecture Overview

The system uses three independent communication channels:

| Channel | Protocol | Ports | Purpose |
|---------|----------|-------|---------|
| REST API | HTTP | Frontend `:5615` → API `:5616` | CRUD operations, session management |
| App WebSocket | WS | Frontend → API `:5616/api/ws` | Real-time event broadcast (triggers refetch) |
| Terminal WebSocket | WS | Frontend → PTY Bridge `:5617/ws/terminal/:id` | Bidirectional terminal I/O |

**Data flow pattern:** Frontend mutates via REST → API writes to DB + broadcasts WS event → Frontend receives WS event → Frontend refetches via REST. This is a "notify then refetch" pattern — WebSocket is a signal, not a data carrier.

---

### 13.2 REST API Connectivity

#### API Client (`apps/web/src/lib/api.ts`)

Minimal fetch wrapper, 43 lines. Handles JSON serialization, 204 responses, error throwing.

**Issues found:**

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| 1 | **Hardcoded base URL** | High | `const BASE_URL = "http://localhost:5616/api"` — not configurable via env or Vite config. Same URL duplicated in `use-app-socket.ts:3`, `use-terminal-socket.ts:14`, and `pages/home.tsx:10` |
| 2 | **No AbortController** | Medium | Requests fire after component unmount. No way to cancel in-flight requests |
| 3 | **Silent 204 cast** | Low | `return undefined as T` — if caller expects data, this is a runtime `undefined` where TypeScript says `T`. Correct but fragile |
| 4 | **Headers override risk** | Low | `{ headers, ...options }` — if `options` contains `headers`, they overwrite the `Content-Type` header entirely |
| 5 | **No retry logic** | Low | Acceptable for local-only tool, but any transient failure is permanent |

#### Frontend → Backend Route Mapping

Every frontend hook maps cleanly to a backend route. No phantom endpoints (frontend calling routes that don't exist), no orphan endpoints (backend routes never called).

| Frontend Hook | REST Call | Backend Route | Match |
|---------------|-----------|---------------|-------|
| `useWorkspaces().refetch` | `GET /workspaces` | `workspaces.ts:10` | OK |
| `useWorkspaces().create` | `POST /workspaces` | `workspaces.ts:18` | OK |
| `useWorkspaces().remove` | `DELETE /workspaces/:id` | `workspaces.ts:51` | OK |
| `useAllTasks().refetch` | `GET /tasks` | `tasks.ts:10` | OK |
| `useWorkspaceTasks().refetch` | `GET /workspaces/:id/tasks` | `tasks.ts:25` | OK |
| `useWorkspaceTasks().create` | `POST /workspaces/:id/tasks` | `tasks.ts:55` | OK |
| `useWorkspaceTasks().update` | `PUT /tasks/:id` | `tasks.ts:78` | OK |
| `useWorkspaceTasks().remove` | `DELETE /tasks/:id` | `tasks.ts:121` | OK |
| `useWorkspaceTasks().reorder` | `PUT /workspaces/:id/tasks/reorder` | `tasks.ts:99` | OK |
| `useWorkspaceTasks().startTask` | `POST /sessions/start-task` | `sessions.ts:20` | OK |
| `useActiveSessions().refetch` | `GET /sessions/active` | `sessions.ts:192` | OK |
| `useClaudeSessions().refetch` | `GET /hooks/sessions` | `hooks.ts:149` | OK |
| `useWaitingClaudeSessions().refetch` | `GET /hooks/sessions/waiting` | `hooks.ts:166` | OK |
| Inbox dismiss button | `DELETE /hooks/sessions/:id` | `hooks.ts:154` | OK |

**Unused backend endpoints** (no frontend caller found):

| Endpoint | Notes |
|----------|-------|
| `POST /sessions/complete-task` | Called from somewhere in the UI but not via a hook — likely direct `api.post()` call in a component |
| `POST /sessions/send-message` | Same — used directly in component code |
| `GET /hooks/events/recent` | Only used by debug hooks page |
| `DELETE /hooks/events` | Only used by debug hooks page |
| `GET /filesystem/browse` | Used in workspace creation form |
| `GET /health`, `GET /health/ready` | Infrastructure endpoints, not called by frontend |

---

### 13.3 Type Contract Between Frontend and Backend

Types are **defined independently** on each side. The database package exports canonical types, but the frontend re-declares its own versions in hook files.

#### Type Alignment Matrix

| Type | Database Package | Frontend Declaration | Status |
|------|-----------------|---------------------|--------|
| `Workspace` | `database/src/index.ts:121-126` | `use-workspaces.ts` (inferred) | **Aligned** — both `{ id, name, folder_path, created_at }` |
| `Task` | `database/src/index.ts:151-160` | `use-tasks.ts:9-19` | **Diverged** — frontend adds `sessionStatus?: ClaudeSessionStatus \| null` |
| `TaskStatus` | `database/src/index.ts:149` | `use-tasks.ts:6` | **Aligned** — both `"todo" \| "doing" \| "done" \| "waiting_for_input"` |
| `ClaudeSession` | `database/src/index.ts:223-233` | `use-claude-sessions.ts:5-17` | **Diverged** — frontend adds `task_id: number \| null` and `task_title: string \| null` |
| `ClaudeSessionStatus` | `database/src/index.ts:215-221` | `use-tasks.ts:7` | **Aligned** |
| `ActiveSessionTask` | `database/src/index.ts:192-194` | Not explicitly typed | Frontend uses `Task` type for `GET /sessions/active`, which actually returns `ActiveSessionTask` (Task + sessionStatus) |
| `WaitingClaudeSessionWithTask` | `database/src/index.ts:301-304` | Not used | Backend has this type but hooks route manually joins instead of using this prepared statement |

**Key type issues:**

1. **`ClaudeSession` on frontend includes `task_id` and `task_title`** (`use-claude-sessions.ts:15-16`), but the `GET /hooks/sessions` endpoint returns raw `ClaudeSession` without these fields. Only `GET /hooks/sessions/waiting` adds them. This means `useClaudeSessions()` has phantom fields that are always `undefined` at runtime — TypeScript doesn't catch this because they're not optional.

2. **`Task.sessionStatus` only exists on `GET /sessions/active`** (via SQL JOIN), not on regular task endpoints. The frontend type marks it as optional (`sessionStatus?`), which is correct, but it means the same `Task` type represents two different shapes depending on which endpoint returned it.

3. **No shared type package** — frontend and backend define types independently. If the DB schema changes (e.g., adding a column), both sides must be updated manually with no compile-time enforcement.

---

### 13.4 App WebSocket Connectivity

#### Server Side (`apps/api/src/ws/index.ts`)

- Fastify WebSocket plugin, endpoint at `/api/ws`
- Global `clients` Map tracks all connections
- `broadcast(message)` sends JSON to all clients with `readyState === 1`
- Server sends `welcome` message on connect with `clientId` and `connectedClients`

#### Client Side (`apps/web/src/hooks/use-app-socket.ts`)

- Module-level singleton: one shared `WebSocket` instance for the entire app
- Reference counting: connects on first `useAppSocket()` mount, disconnects when last unmounts
- Pub/sub: `subscribe(type, callback)` returns unsubscribe function
- Reconnects on close after 3s fixed delay

#### Event Name Consistency

| Event Type | Server Broadcasts | Client Subscribes | Match |
|------------|-------------------|-------------------|-------|
| `task:updated` | `sessions.ts:95,134` | `use-tasks.ts:43,67` | OK |
| `sessions:changed` | `sessions.ts:96,135` | `use-sessions.ts:25` | OK |
| `claude-sessions:changed` | `sessions.ts:97,136`, `hooks.ts:130,161` | `use-sessions.ts:28`, `use-claude-sessions.ts:38,65` | OK |
| `claude-session:updated` | `hooks.ts:129,160` | **Nobody subscribes** | **Dead event** |
| `hook-event:raw` | `hooks.ts:95` | `debug-hooks.tsx` (debug page only) | OK |
| `welcome` | `ws/index.ts:28-34` | **Nobody handles** | Harmless |
| `echo` | `ws/index.ts:57-62` | **Nobody handles** | Dead code |
| `broadcast` | `ws/index.ts:44-48` | **Nobody handles** | Dead code |

**Issues found:**

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| 1 | **`claude-session:updated` is broadcast but never consumed** | Medium | Server sends individual session updates (with the session object), but frontend only listens to `claude-sessions:changed` (which carries no data and triggers a full refetch). The per-session event could enable incremental updates instead of refetching the entire list |
| 2 | **`echo` and `broadcast` handlers are dead code** | Low | Server handles client-sent `broadcast` messages and echoes non-broadcast messages. No frontend code sends messages to the server. This is leftover scaffolding |
| 3 | **No heartbeat/ping-pong** | High | If a client's network drops without a TCP FIN (e.g., laptop sleep, WiFi disconnect), the server never detects it. The `clients` Map grows unboundedly. `broadcast()` silently skips dead clients via `readyState` check, but they're never cleaned up |
| 4 | **Fixed 3s reconnection delay** | Medium | No exponential backoff. If the server goes down, all clients hammer it every 3 seconds simultaneously. With N clients, that's N connections/3s |
| 5 | **No message buffering during reconnection** | Medium | During the 3s reconnection window, any server-side events are lost. The frontend compensates by refetching on reconnect (the reconnect triggers `connect()` → `useEffect` re-runs → `refetch()`), but there's a race: if a mutation happens during the gap and the refetch completes before the mutation is committed, the UI shows stale data |
| 6 | **Reconnection timer race** | Low | If `refCount > 0` when `onclose` fires, a 3s timer starts. If all components unmount before the timer fires, `disconnect()` clears the timer — but only if `refCount` drops to 0 before the timeout fires. If `refCount` reaches 0 and `disconnect()` runs, then the timer fires, `connect()` creates an orphaned WebSocket that nobody will clean up |
| 7 | **Duplicate WebSocket in `home.tsx`** | Medium | `pages/home.tsx` creates its own independent WebSocket connection to the same endpoint, bypassing `useAppSocket`. This means the home page opens 2 connections (its own + any hook that uses `useAppSocket`). Its reconnection timer is also not cleared on unmount (line 38) — memory leak |
| 8 | **No connection status exposed** | Low | `useAppSocket` doesn't expose whether the WebSocket is connected. Components can't show offline indicators or disable mutations when disconnected |

#### Data Sync Pattern Analysis

The "notify then refetch" pattern is sound for a local tool but has inefficiencies:

```
Server: DB mutation → broadcast({ type: "task:updated", task: updatedTask })
Client: receives event → ignores the task payload → calls GET /tasks → rerenders
```

The broadcast **includes the updated data** (e.g., `{ type: "task:updated", task: updatedTask }`), but the client ignores it and refetches everything. This means:
- Every single mutation triggers N+1 requests (1 broadcast + N clients × 1 GET)
- The updated data was already in the WebSocket message but discarded
- Multiple rapid mutations cause multiple overlapping refetches with no deduplication

For a localhost tool with a single user, this is fine. At scale it would be a problem.

---

### 13.5 Terminal WebSocket Connectivity

#### Server Side (`apps/api/src/pty-bridge.ts`)

Separate Node.js process (not Bun — uses `node-pty` which requires Node). Listens on port 5617.

- HTTP upgrade handler matches `/ws/terminal/:sessionId`
- Spawns `tmux attach-session -t :sessionId` via `node-pty`
- Bidirectional bridge: WS ↔ PTY
- Handles `{ type: "resize", cols, rows }` JSON messages for terminal resize
- Non-JSON messages forwarded as raw terminal input

#### Client Side (`apps/web/src/hooks/use-terminal-socket.ts`)

Per-session WebSocket (new instance per terminal view).

- Connects to `ws://localhost:5617/ws/terminal/${encodeURIComponent(sessionId)}`
- Binary mode (`binaryType = "arraybuffer"`)
- Sends resize on open, forwards `terminal.onData` and `terminal.onBinary` to WS
- Cleans up on unmount (disposes listeners, closes WS)

**Issues found:**

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| 1 | **No reconnection** | Medium | If the terminal WebSocket drops, the connection is lost permanently until the user navigates away and back. No auto-reconnect unlike the app socket |
| 2 | **Messages dropped before OPEN** | Medium | `terminal.onData` checks `ws.readyState === WebSocket.OPEN` before sending. Keystrokes typed before the connection opens are silently dropped — no queue |
| 3 | **No error message to client on PTY spawn failure** | Medium | If `pty.spawn()` fails (`pty-bridge.ts:50-54`), the server logs the error and closes the WS — but sends no error message. Client sees an abrupt disconnect with no explanation |
| 4 | **Ambiguous message framing** | Low | PTY bridge sniffs for JSON by checking `msg.startsWith("{")` (`pty-bridge.ts:72`). If the user types `{` as the first character of terminal input, it's parsed as JSON, fails, and falls through to raw input. Works correctly but fragile |
| 5 | **No session validation** | Medium | PTY bridge trusts the sessionId from the URL and passes it directly to `tmux attach-session -t`. If tmux session doesn't exist, `pty.spawn()` fails. No pre-check or meaningful error |
| 6 | **CORS not enforced on PTY bridge** | Low | The PTY bridge is a raw `http.createServer` — no CORS headers, no origin checking. Any webpage could connect to it. Low severity because it's localhost-only |
| 7 | **`TMUX_PATH` resolved once at startup** | Low | `execSync("which tmux")` runs at import time. If tmux isn't installed, the PTY bridge crashes immediately with no useful error |

---

### 13.6 Broadcast Reliability

Backend routes broadcast WebSocket events after database writes. The broadcast is fire-and-forget with no delivery guarantee.

**Failure modes:**

| Scenario | Consequence | Mitigation |
|----------|-------------|------------|
| Client WebSocket disconnected during broadcast | Missed event | Auto-reconnect triggers refetch on next page interaction |
| Server crashes after DB write but before broadcast | DB mutated, no WS event | Frontend shows stale data until manual refresh |
| Multiple rapid broadcasts | Multiple overlapping refetches | None — all refetches run to completion |
| Broadcast fails for one client (send throws) | `broadcast()` has no try-catch around `client.send()` — one bad client could throw and skip remaining clients | **Bug** — should wrap in try-catch |

Looking at `ws/index.ts:12-18`:
```typescript
export function broadcast(message: object) {
  const data = JSON.stringify(message);
  for (const [client] of clients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}
```

If `client.send(data)` throws (e.g., client in CLOSING state between the readyState check and the send), the loop aborts and remaining clients don't receive the message. This should be wrapped in try-catch per client.

---

### 13.7 Unused Database Resources

While auditing connectivity, I noticed the hooks route (`hooks.ts:166-176`) manually joins `claude_sessions` with tasks via `getTaskBySessionId` in a JavaScript loop, even though the database package already exports `getWaitingClaudeSessionsWithTask` (`database/src/index.ts:306-315`) which does this as a single SQL JOIN. The prepared statement is defined but never imported.

---

### 13.8 Connectivity Summary

| Area | Grade | Notes |
|------|-------|-------|
| REST API mapping | **A** | Clean 1:1 mapping, no phantom or orphan endpoints |
| Type contracts | **C** | Independently declared, divergent in 2 places, no shared validation |
| App WebSocket reliability | **C-** | No heartbeat, no backoff, dead events, duplicate connection, no buffering |
| Terminal WebSocket reliability | **C** | No reconnection, no error messages, dropped keystrokes |
| Broadcast integrity | **C-** | No delivery guarantee, no per-client error handling, potential broadcast abort |
| URL configuration | **D** | Hardcoded in 4 separate locations, not env-configurable |

**Overall connectivity grade: C**

The REST layer is clean and well-mapped. The WebSocket layers work for the happy path but have meaningful gaps in error handling, reconnection, and delivery reliability. The type contract between frontend and backend is the biggest maintenance risk — independent type declarations will inevitably drift as the project evolves.

---

### 13.9 Connectivity Fix Priorities

**P0 — Fix now:**
1. Add try-catch per client in `broadcast()` to prevent one bad client from aborting the loop
2. Fix `home.tsx` reconnection timer memory leak (clear on unmount)
3. Use the existing `getWaitingClaudeSessionsWithTask` prepared statement instead of JS-side join

**P1 — Fix soon:**
4. Centralize all URLs into a single config file (e.g., `apps/web/src/lib/config.ts` reading from `import.meta.env`)
5. Add WebSocket heartbeat/ping-pong (server-side `ws` library supports this natively)
6. Implement exponential backoff with jitter for reconnection
7. Remove dead WebSocket event handlers (`echo`, `broadcast`) and either subscribe to `claude-session:updated` or stop broadcasting it
8. Create a shared types package or have the frontend import from `@polygousse/database`

**P2 — Plan for:**
9. Add message buffering during WebSocket reconnection gap
10. Add terminal WebSocket reconnection with session resume
11. Expose connection status from `useAppSocket` for UI indicators
12. Deduplicate concurrent refetches (e.g., with a pending promise cache)
13. Use WebSocket payload data instead of refetching (for `task:updated` and `claude-session:updated`)

---

## Conclusion

The app has a well-thought-out architecture and a clean event-driven design for managing Claude sessions. The main gaps are operational: error handling is almost entirely absent, there are no tests, no documentation, and no CI. The security surface (unrestricted filesystem browsing, no input validation) is the most urgent concern. The connectivity between frontend, REST API, and WebSocket is functional for the happy path, with clean endpoint mapping, but has meaningful reliability gaps in WebSocket lifecycle management and type contract maintenance. Addressing the P0 items above would bring the codebase to a reasonable baseline for continued development.
