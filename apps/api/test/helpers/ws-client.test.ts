import { afterAll, afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import {
	type TestAppContext,
	cleanupDb,
	closeTestApp,
	createTestApp,
} from "./setup.js";
import { TestWsClient } from "./ws-client.js";

describe("TestWsClient", () => {
	let ctx: TestAppContext;

	setDefaultTimeout(10_000);

	beforeAll(async () => {
		ctx = await createTestApp();
	});

	afterEach(() => {
		cleanupDb();
	});

	afterAll(async () => {
		await closeTestApp(ctx);
	});

	test("connects and receives welcome message", async () => {
		const client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		expect(client.welcome).toBeDefined();
		expect(client.welcome.type).toBe("welcome");
		expect(client.welcome.clientId).toBeString();
		expect(client.welcome.connectedClients).toBeGreaterThanOrEqual(1);

		client.close();
	});

	test("sendOk returns typed response data", async () => {
		const client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const data = await client.sendOk("hydrate", {});
		expect(data.workspaces).toBeArray();
		expect(data.tasks).toBeArray();
		expect(data.folders).toBeArray();

		client.close();
	});

	test("sendError returns error string for unknown action", async () => {
		const client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError(
			"nonexistent:action" as never,
			{} as never,
		);
		expect(error).toContain("Unknown action");

		client.close();
	});

	test("collects broadcasts from other actions", async () => {
		const client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		// Create a workspace — should produce a broadcast
		const ws = await client.sendOk("workspace:create", {
			name: "Test WS",
			folder_path: "/tmp/test",
		});
		expect(ws.id).toBeDefined();

		// Give broadcast a moment to arrive (same connection receives it)
		await Bun.sleep(50);

		const broadcasts = client.getBroadcasts("workspace:created");
		expect(broadcasts.length).toBe(1);
		expect(broadcasts[0]!.workspace.name).toBe("Test WS");

		client.close();
	});

	test("waitForBroadcast resolves on matching event", async () => {
		const client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		// Start waiting before the action
		const broadcastPromise = client.waitForBroadcast("workspace:created");

		await client.sendOk("workspace:create", {
			name: "Waited WS",
			folder_path: "/tmp/waited",
		});

		const event = await broadcastPromise;
		expect(event.type).toBe("workspace:created");
		expect(event.workspace.name).toBe("Waited WS");

		client.close();
	});

	test("clearBroadcasts resets collected events", async () => {
		const client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		await client.sendOk("workspace:create", {
			name: "Clear Test",
			folder_path: "/tmp/clear",
		});
		await Bun.sleep(50);

		expect(client.getBroadcasts().length).toBeGreaterThan(0);
		client.clearBroadcasts();
		expect(client.getBroadcasts().length).toBe(0);

		client.close();
	});

	test("multiple clients get separate clientIds", async () => {
		const client1 = new TestWsClient();
		const client2 = new TestWsClient();
		await client1.connect(ctx.baseUrl);
		await client2.connect(ctx.baseUrl);

		expect(client1.welcome.clientId).not.toBe(client2.welcome.clientId);

		client1.close();
		client2.close();
	});
});
