---
name: testing
description: "API test suite commands and patterns. Use when running tests, writing new tests, debugging test failures, or understanding the test infrastructure."
tools: Read, Glob, Grep, Edit, Write, Bash
---

# API Test Suite

## Commands

```bash
# All tests
cd apps/api && bun test

# E2E only
bun test test/e2e/

# Unit only
bun test test/unit/

# Single file
bun test test/e2e/tasks.test.ts

# From monorepo root
bun run test
```

## Test Infrastructure

| File | Purpose |
|---|---|
| `apps/api/bunfig.toml` | Preloads `test/preload.ts` before every test |
| `apps/api/test/preload.ts` | Sets `POLYGOUSSE_DB_PATH=:memory:`, mocks `node:child_process` |
| `apps/api/test/helpers/setup.ts` | `createTestApp()`, `closeTestApp()`, `cleanupDb()` |
| `apps/api/test/helpers/ws-client.ts` | `TestWsClient` — typed WS actions, broadcast collection |
| `apps/api/test/helpers/seed.ts` | Seed factories: `seedWorkspace`, `seedTask`, `seedFolder`, `seedTerminalSession`, `seedClaudeSession`, `seedSetting`, `seedLinearTaskLink`, `seedFullSessionStack` |
| `apps/api/test/helpers/mock-cli.ts` | `MockClaudeCli` — sends hook events like the real CLI |

## E2E Test Pattern

```typescript
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { type TestAppContext, cleanupDb, closeTestApp, createTestApp } from "../helpers/setup.js";
import { TestWsClient } from "../helpers/ws-client.js";
import { resetSeedCounters, seedWorkspace } from "../helpers/seed.js";
import { resetExecFileCalls } from "../preload.js";

describe("feature name", () => {
  let ctx: TestAppContext;
  let client: TestWsClient;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(() => {
    resetExecFileCalls();
  });

  afterEach(() => {
    client?.close();
    cleanupDb();
    resetSeedCounters();
  });

  afterAll(async () => {
    if (ctx) await closeTestApp(ctx);
  });

  test("action succeeds", async () => {
    client = new TestWsClient();
    await client.connect(ctx.baseUrl);

    const ws = seedWorkspace();
    const data = await client.sendOk("some:action", { workspaceId: ws.id });
    expect(data.field).toBe("value");

    const broadcasts = client.getBroadcasts("some:broadcast");
    expect(broadcasts).toHaveLength(1);
  });

  test("action fails on invalid input", async () => {
    client = new TestWsClient();
    await client.connect(ctx.baseUrl);

    const error = await client.sendError("some:action", { id: 999 });
    expect(error).toBe("Not found");
  });
});
```

## Unit Test Pattern

```typescript
import { describe, expect, test } from "bun:test";
import { myFunction } from "../../src/path/to/module.js";

describe("myFunction", () => {
  test("returns expected result", () => {
    expect(myFunction("input")).toBe("output");
  });
});
```

## Key APIs

- `client.sendOk(action, payload)` — asserts `ok: true`, returns typed response data
- `client.sendError(action, payload)` — asserts `ok: false`, returns error string
- `client.getBroadcasts(type?)` — returns collected broadcast events
- `client.waitForBroadcast(type, timeout?)` — waits for a broadcast (default 2s)
- `seedFullSessionStack()` — creates workspace + terminal + task (doing) + claude session
- `execFileCalls` — array of recorded `{ command, args, options }` from child_process mock
- `MockClaudeCli.sendSessionStart/sendStop/sendSessionEnd/sendPermissionPrompt/sendLimitHit`

## Conventions

- One `describe` block per test file, one server per file (shared across tests)
- Always `cleanupDb()` + `resetSeedCounters()` in `afterEach` for isolation
- Use seed factories, not raw SQL
- Assert both DB state and WS broadcasts for mutation actions
- Import DB prepared statements from `@polygousse/database` for direct DB checks
