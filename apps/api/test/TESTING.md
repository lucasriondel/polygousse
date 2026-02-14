# API Test Suite

## Running Tests

```bash
# All tests (from apps/api/)
bun test

# E2E tests only
bun test test/e2e/

# Unit tests only
bun test test/unit/

# Specific file
bun test test/e2e/tasks.test.ts

# From monorepo root
bun run test
```

## Architecture

Tests boot a **real Fastify server** with a **real in-memory SQLite database**. External side effects (tmux, git) are mocked at the `node:child_process` level via `test/preload.ts`.

```
test/
├── preload.ts              # Env vars + child_process mock (loaded via bunfig.toml)
├── helpers/
│   ├── setup.ts            # createTestApp(), closeTestApp(), cleanupDb(), db
│   ├── ws-client.ts        # TestWsClient (typed WS actions + broadcast collection)
│   ├── seed.ts             # Seed factories (seedWorkspace, seedTask, etc.)
│   └── mock-cli.ts         # MockClaudeCli (sends hook events like real CLI)
├── e2e/
│   ├── health.test.ts      # GET /api/health, /api/health/ready
│   ├── ws-protocol.test.ts # Welcome, unknown action, malformed JSON, multi-client
│   ├── hydrate.test.ts     # Full hydration with empty/seeded DB
│   ├── workspaces.test.ts  # CRUD + worktree:create + cascade delete
│   ├── tasks.test.ts       # CRUD + reorder + move-to-folder + task:start
│   ├── folders.test.ts     # CRUD + reorder + orphan handling
│   ├── attachments.test.ts # Upload/delete + binary data + cascade
│   ├── settings.test.ts    # Upsert/get/delete + token masking
│   ├── hooks.test.ts       # Hook action queries (events-recent, sessions, dismiss)
│   ├── hook-processing.test.ts # Full hook event pipeline via MockClaudeCli
│   ├── sessions.test.ts    # session:debug, ralph-running, complete-task, send-message
│   └── linear.test.ts      # linear:configured, run-from-issue, task-links
└── unit/
    ├── resolve-status.test.ts  # resolveStatus() pure function mapping
    └── prompt-builder.test.ts  # buildPrompt() title/description/attachments
```

## Key Concepts

### Test Isolation

Each test file gets its own Fastify server on a random port (`port: 0`). The in-memory SQLite DB is shared across all tests in a process, so `cleanupDb()` truncates all 13 tables between tests.

```typescript
beforeEach(() => {
  cleanupDb();
  resetSeedCounters();
  resetExecFileCalls();
});
```

### TestWsClient

Typed WebSocket client that handles request/response correlation and broadcast collection.

```typescript
const client = new TestWsClient();
await client.connect(ctx.baseUrl);

// Send action, assert ok:true, get typed response
const data = await client.sendOk("workspace:create", { name: "My WS", folderPath: "/tmp" });

// Send action, assert ok:false, get error string
const error = await client.sendError("task:update", { id: 999, title: "nope" });

// Collect and inspect broadcasts
const broadcasts = client.getBroadcasts("task:created");
await client.waitForBroadcast("workspace:deleted");
client.clearBroadcasts();
```

### Seed Factories

Quick data creation using existing database prepared statements. Each factory auto-increments IDs/names.

```typescript
const ws = seedWorkspace({ name: "Test" });
const task = seedTask(ws.id, { status: "doing" });
const folder = seedFolder(ws.id);

// Composite: workspace + terminal + task (doing) + claude session
const { workspace, task, terminalSession, claudeSession } = seedFullSessionStack();
```

### MockClaudeCli

Simulates the Claude Code CLI sending hook events to `POST /api/hooks/event`.

```typescript
const cli = new MockClaudeCli(ctx.baseUrl);

// Individual events
await cli.sendSessionStart("session-1", "/tmp/workspace");
await cli.sendPermissionPrompt("session-1", "/tmp/workspace");

// Full lifecycle (SessionStart → UserPromptSubmit → Stop → SessionEnd)
await cli.simulateSessionLifecycle("session-1", "/tmp/workspace");
```

### Asserting Side Effects

The `execFile` mock from `preload.ts` records all calls. Use it to verify tmux/git commands.

```typescript
import { execFileCalls, resetExecFileCalls } from "../preload.js";

// After an action that triggers a shell command:
expect(execFileCalls).toHaveLength(1);
expect(execFileCalls[0].command).toBe("tmux");
expect(execFileCalls[0].args).toContain("send-keys");
```

## Writing New Tests

1. **Choose E2E vs Unit.** E2E for anything involving the server/DB/WS. Unit for pure functions.
2. **Follow the existing pattern.** `describe` block → `beforeAll` (create app) → `beforeEach` (cleanup) → `afterAll` (close app).
3. **Use seed factories** instead of raw SQL. They return typed entities and auto-increment.
4. **Assert broadcasts** when the action should notify connected clients.
5. **Check DB state** when verifying persistence (import prepared statements from `@polygousse/database`).
6. **Use `sendOk` / `sendError`** — they assert the ok field for you and return typed data.
