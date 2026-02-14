import { db } from "@polygousse/database";
import type { FastifyPluginAsync } from "fastify";

const healthRoutes: FastifyPluginAsync = async (fastify) => {
	fastify.get("/health", async () => {
		return {
			status: "ok",
			timestamp: new Date().toISOString(),
		};
	});

	fastify.get("/health/ready", async () => {
		try {
			const result = db.prepare("SELECT 1 AS ok").get() as { ok: number };
			return {
				status: "ready",
				db: result.ok === 1,
				timestamp: new Date().toISOString(),
			};
		} catch (_error) {
			return {
				status: "not_ready",
				db: false,
				timestamp: new Date().toISOString(),
			};
		}
	});
};

export default healthRoutes;
