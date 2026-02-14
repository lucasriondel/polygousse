import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	closeTestApp,
	createTestApp,
	type TestAppContext,
} from "../helpers/setup.js";

describe("health endpoints", () => {
	let ctx: TestAppContext;

	beforeAll(async () => {
		ctx = await createTestApp();
	});

	afterAll(async () => {
		if (ctx) await closeTestApp(ctx);
	});

	test("GET /api/health returns status ok", async () => {
		const res = await fetch(`${ctx.baseUrl}/api/health`);
		expect(res.status).toBe(200);

		const body: any = await res.json();
		expect(body.status).toBe("ok");
		expect(typeof body.timestamp).toBe("string");
		// Timestamp should be a valid ISO date
		expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
	});

	test("GET /api/health/ready returns ready with db true", async () => {
		const res = await fetch(`${ctx.baseUrl}/api/health/ready`);
		expect(res.status).toBe(200);

		const body: any = await res.json();
		expect(body.status).toBe("ready");
		expect(body.db).toBe(true);
		expect(typeof body.timestamp).toBe("string");
		expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
	});
});
