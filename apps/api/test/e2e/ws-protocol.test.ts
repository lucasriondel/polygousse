import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import {
	type TestAppContext,
	cleanupDb,
	closeTestApp,
	createTestApp,
} from "../helpers/setup.js";
import { TestWsClient } from "../helpers/ws-client.js";

/**
 * Connects a raw WebSocket to the test server and waits for the welcome message.
 * Returns both the WebSocket and a helper to receive the next message.
 */
function connectRaw(baseUrl: string): Promise<{
	ws: WebSocket;
	welcome: { type: string; clientId: string; connectedClients: number };
	nextMessage: () => Promise<unknown>;
}> {
	const wsUrl = baseUrl.replace(/^http/, "ws") + "/api/ws";

	return new Promise((resolve, reject) => {
		const ws = new WebSocket(wsUrl);
		const messageQueue: unknown[] = [];
		let messageWaiter: ((value: unknown) => void) | null = null;

		ws.addEventListener("error", (e) => {
			reject(new Error(`WebSocket connection failed: ${e}`));
		});

		ws.addEventListener("message", (event) => {
			const data = JSON.parse(String(event.data));

			// First message is the welcome
			if (data.type === "welcome") {
				resolve({
					ws,
					welcome: data,
					nextMessage: () => {
						if (messageQueue.length > 0) {
							return Promise.resolve(messageQueue.shift());
						}
						return new Promise<unknown>((res) => {
							messageWaiter = res;
						});
					},
				});
				return;
			}

			// Subsequent messages go to the queue or waiter
			if (messageWaiter) {
				const waiter = messageWaiter;
				messageWaiter = null;
				waiter(data);
			} else {
				messageQueue.push(data);
			}
		});
	});
}

describe("ws protocol", () => {
	let ctx: TestAppContext;

	setDefaultTimeout(10_000);

	beforeAll(async () => {
		ctx = await createTestApp();
	});

	afterEach(() => {
		cleanupDb();
	});

	afterAll(async () => {
		if (ctx) await closeTestApp(ctx);
	});

	// ── Welcome message ──────────────────────────────────────────────

	test("welcome message includes clientId and connectedClients", async () => {
		const client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		expect(client.welcome.type).toBe("welcome");
		expect(client.welcome.clientId).toBeString();
		expect(client.welcome.clientId.length).toBeGreaterThan(0);
		expect(typeof client.welcome.connectedClients).toBe("number");
		expect(client.welcome.connectedClients).toBeGreaterThanOrEqual(1);

		client.close();
	});

	// ── Unknown action ───────────────────────────────────────────────

	test("unknown action returns ok:false with error message", async () => {
		const client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError(
			"totally:bogus" as never,
			{} as never,
		);
		expect(error).toBe("Unknown action: totally:bogus");

		client.close();
	});

	// ── Malformed JSON ───────────────────────────────────────────────

	test("malformed JSON is echoed back as a string", async () => {
		const { ws, nextMessage } = await connectRaw(ctx.baseUrl);

		ws.send("this is not json {{{");

		const response = (await nextMessage()) as {
			type: string;
			data: string;
		};
		expect(response.type).toBe("echo");
		expect(response.data).toBe("this is not json {{{");

		ws.close();
	});

	test("valid JSON without id/action is echoed back as data", async () => {
		const { ws, nextMessage } = await connectRaw(ctx.baseUrl);

		ws.send(JSON.stringify({ hello: "world" }));

		const response = (await nextMessage()) as {
			type: string;
			data: { hello: string };
		};
		expect(response.type).toBe("echo");
		expect(response.data.hello).toBe("world");

		ws.close();
	});

	// ── Multiple clients ─────────────────────────────────────────────

	test("multiple clients receive separate clientIds", async () => {
		const client1 = new TestWsClient();
		const client2 = new TestWsClient();
		const client3 = new TestWsClient();

		await client1.connect(ctx.baseUrl);
		await client2.connect(ctx.baseUrl);
		await client3.connect(ctx.baseUrl);

		const ids = new Set([
			client1.welcome.clientId,
			client2.welcome.clientId,
			client3.welcome.clientId,
		]);
		// All three IDs must be unique
		expect(ids.size).toBe(3);

		// Second client should see at least 2 connected, third at least 3
		expect(client2.welcome.connectedClients).toBeGreaterThanOrEqual(2);
		expect(client3.welcome.connectedClients).toBeGreaterThanOrEqual(3);

		client1.close();
		client2.close();
		client3.close();
	});
});
