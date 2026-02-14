import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createWorkspace, getAllWorkspaces } from "@polygousse/database";
import {
	cleanupDb,
	closeTestApp,
	createTestApp,
	db,
	type TestAppContext,
} from "./setup.js";

describe("test lifecycle helpers", () => {
	let ctx: TestAppContext;

	afterAll(async () => {
		if (ctx) await closeTestApp(ctx);
	});

	test("createTestApp boots on a random port", async () => {
		ctx = await createTestApp();
		expect(ctx.port).toBeGreaterThan(0);
		expect(ctx.baseUrl).toStartWith("http://127.0.0.1:");

		// Server should respond to requests
		const res = await fetch(`${ctx.baseUrl}/api/health`);
		expect(res.ok).toBe(true);
	});

	test("db is the in-memory database", () => {
		expect(db).toBeDefined();
		// Should be able to query without errors
		const result = db.query("SELECT 1 as one").get() as { one: number };
		expect(result.one).toBe(1);
	});

	test("cleanupDb truncates all tables", () => {
		// Start clean so leftover data from other test files doesn't interfere
		cleanupDb();

		// Seed some data
		createWorkspace.run("Test WS", "/tmp/test", null, null, null);
		const before = getAllWorkspaces.all();
		expect(before.length).toBe(1);

		// Clean up
		cleanupDb();

		const after = getAllWorkspaces.all();
		expect(after.length).toBe(0);
	});

	test("cleanupDb handles FK-constrained data", () => {
		// Create workspace, then a task that references it
		createWorkspace.run("WS", "/tmp/ws", null, null, null);
		const ws = getAllWorkspaces.all()[0]!;
		db.exec(
			`INSERT INTO tasks (workspace_id, title, status, position) VALUES (${ws.id}, 'Task 1', 'todo', 0)`,
		);

		// Should clean up without FK errors
		cleanupDb();

		const workspaces = getAllWorkspaces.all();
		const tasks = db.query("SELECT * FROM tasks").all();
		expect(workspaces.length).toBe(0);
		expect(tasks.length).toBe(0);
	});
});
