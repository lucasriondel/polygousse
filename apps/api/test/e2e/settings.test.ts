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
import { resetSeedCounters, seedSetting } from "../helpers/seed.js";
import { getSetting } from "@polygousse/database";

describe("settings", () => {
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

	// ── Update (upsert) ────────────────────────────────────────────────

	test("setting:update creates a new setting and broadcasts", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const setting = await client.sendOk("setting:update", {
			key: "theme",
			value: "dark",
		});

		expect(setting.key).toBe("theme");
		expect(setting.value).toBe("dark");
		expect(setting.updated_at).toBeString();

		const broadcast = await client.waitForBroadcast("setting:updated");
		expect(broadcast.setting.key).toBe("theme");
		expect(broadcast.setting.value).toBe("dark");
	});

	test("setting:update upserts an existing setting", async () => {
		seedSetting("language", "en");

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const setting = await client.sendOk("setting:update", {
			key: "language",
			value: "fr",
		});

		expect(setting.key).toBe("language");
		expect(setting.value).toBe("fr");

		// Verify in DB — only one record for this key
		const dbSetting = getSetting.get("language");
		expect(dbSetting).not.toBeNull();
		expect(dbSetting!.value).toBe("fr");
	});

	// ── Delete ─────────────────────────────────────────────────────────

	test("setting:delete removes setting and broadcasts", async () => {
		seedSetting("to-delete", "bye");

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		await client.sendOk("setting:delete", { key: "to-delete" });

		// Verify deleted from DB
		const found = getSetting.get("to-delete");
		expect(found).toBeNull();

		const broadcast = await client.waitForBroadcast("setting:deleted");
		expect(broadcast.key).toBe("to-delete");
	});

	test("setting:delete nonexistent returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("setting:delete", {
			key: "does-not-exist",
		});
		expect(error).toBe("Setting not found");
	});

	// ── Get ────────────────────────────────────────────────────────────

	test("setting:get retrieves an existing setting", async () => {
		seedSetting("editor", "vim");

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const setting = await client.sendOk("setting:get", { key: "editor" });

		expect(setting.key).toBe("editor");
		expect(setting.value).toBe("vim");
		expect(setting.updated_at).toBeString();
	});

	test("setting:get masks value when key contains 'token'", async () => {
		seedSetting("linear_api_token", "secret-value-12345");

		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const setting = await client.sendOk("setting:get", {
			key: "linear_api_token",
		});

		expect(setting.key).toBe("linear_api_token");
		expect(setting.value).toBe("••••••••");
	});

	test("setting:get nonexistent returns error", async () => {
		client = new TestWsClient();
		await client.connect(ctx.baseUrl);

		const error = await client.sendError("setting:get", {
			key: "no-such-key",
		});
		expect(error).toBe("Setting not found");
	});
});
