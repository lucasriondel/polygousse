import {
	describe,
	test,
	expect,
	beforeAll,
	afterAll,
	afterEach,
	setDefaultTimeout,
} from "bun:test";
import {
	createTestApp,
	closeTestApp,
	cleanupDb,
	type TestAppContext,
} from "../helpers/setup.js";
import { TestWsClient } from "../helpers/ws-client.js";
import {
	seedWorkspace,
	seedTask,
	seedLinearTaskLink,
	seedSetting,
	resetSeedCounters,
} from "../helpers/seed.js";
import { getAllLinearTaskLinks, getTaskById } from "@polygousse/database";

describe("linear", () => {
	let ctx: TestAppContext;
	let client: TestWsClient;

	setDefaultTimeout(10_000);

	beforeAll(async () => {
		ctx = await createTestApp();
	});

	afterEach(() => {
		client?.close();
		cleanupDb();
		resetSeedCounters();
	});

	afterAll(async () => {
		if (ctx) await closeTestApp(ctx);
	});

	// ── linear:configured ─────────────────────────────────────────────

	test("linear:configured returns false when no token is set", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const result = await client.sendOk("linear:configured", {});

		expect(result.configured).toBe(false);
	});

	test("linear:configured returns true when token is set", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		seedSetting("linear_api_token", "lin_api_test_token_123");

		const result = await client.sendOk("linear:configured", {});

		expect(result.configured).toBe(true);
	});

	// ── actions without token → error ─────────────────────────────────

	test("linear:teams without token returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("linear:teams", {});

		expect(error).toBe("Linear API token not configured");
	});

	test("linear:team-issues without token returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("linear:team-issues", {
			teamId: "team-1",
		});

		expect(error).toBe("Linear API token not configured");
	});

	test("linear:team-projects without token returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("linear:team-projects", {
			teamId: "team-1",
		});

		expect(error).toBe("Linear API token not configured");
	});

	test("linear:issue-done without token returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("linear:issue-done", {
			issueId: "issue-1",
		});

		expect(error).toBe("Linear API token not configured");
	});

	// ── linear:task-links ─────────────────────────────────────────────

	test("linear:task-links returns all links", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const ws = seedWorkspace();
		const task1 = seedTask(ws.id);
		const task2 = seedTask(ws.id);

		const link1 = seedLinearTaskLink(task1.id, {
			linearIssueId: "issue-1",
			linearIssueIdentifier: "LIN-1",
			linearTeamId: "team-1",
		});
		const link2 = seedLinearTaskLink(task2.id, {
			linearIssueId: "issue-2",
			linearIssueIdentifier: "LIN-2",
			linearTeamId: "team-1",
		});

		const links = await client.sendOk("linear:task-links", {});

		expect(links.length).toBe(2);
		// Returned in descending order by created_at
		const ids = links.map((l: any) => l.id);
		expect(ids).toContain(link1.id);
		expect(ids).toContain(link2.id);
	});

	test("linear:task-links returns empty array when no links exist", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const links = await client.sendOk("linear:task-links", {});

		expect(links).toEqual([]);
	});
});
