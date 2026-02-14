/**
 * Test lifecycle helpers — boots a real Fastify server on a random port,
 * provides DB cleanup between tests, and re-exports `db` for direct access.
 */

import { db } from "@polygousse/database";
import { createApp, type CreateAppOptions } from "../../src/create-app.js";

export { db };

export interface TestAppContext {
	app: Awaited<ReturnType<typeof createApp>>;
	baseUrl: string;
	port: number;
}

/**
 * Boots a Fastify server on a random port (port 0).
 * Returns the app instance, base URL, and assigned port.
 */
export async function createTestApp(
	options?: CreateAppOptions,
): Promise<TestAppContext> {
	const app = await createApp({
		logLevel: "silent",
		corsOrigins: ["*"],
		...options,
	});

	const address = await app.listen({ port: 0, host: "127.0.0.1" });
	const port = app.server.address()!;
	const portNumber = typeof port === "object" ? port.port : Number(port);

	return {
		app,
		baseUrl: `http://127.0.0.1:${portNumber}`,
		port: portNumber,
	};
}

/**
 * Shuts down the test server, forcefully closing any remaining WebSocket connections.
 */
export async function closeTestApp(ctx: TestAppContext): Promise<void> {
	// Force-close any lingering WebSocket connections so the server doesn't hang
	ctx.app.server.closeAllConnections();
	await ctx.app.close();
}

/**
 * All 13 tables in dependency-safe deletion order.
 * Child tables (with FK references) are listed before their parents.
 */
const ALL_TABLES = [
	"ralph_claude_sessions",
	"ralph_sessions",
	"session_events",
	"claude_sessions",
	"terminal_sessions",
	"hook_events",
	"task_attachments",
	"linear_task_links",
	"tasks",
	"task_folders",
	"workspaces",
	"users",
	"settings",
] as const;

/**
 * Truncates all 13 tables between tests.
 * Temporarily disables foreign keys so deletion order doesn't matter,
 * then re-enables them.
 */
export function cleanupDb(): void {
	db.exec("PRAGMA foreign_keys = OFF;");
	for (const table of ALL_TABLES) {
		db.exec(`DELETE FROM ${table};`);
	}
	db.exec("PRAGMA foreign_keys = ON;");
}
