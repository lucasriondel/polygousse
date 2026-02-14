import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import attachmentRoutes from "./routes/attachments.js";
import healthRoutes from "./routes/health.js";
import hookRoutes from "./routes/hooks.js";
import wsRoutes from "./ws/index.js";

export interface CreateAppOptions {
	logLevel?: string;
	corsOrigins?: string[];
}

export async function createApp(options: CreateAppOptions = {}) {
	const defaultCorsOrigins = process.env.CORS_ORIGINS?.split(",") ?? [
		"http://localhost:5615",
	];
	const { logLevel = "info", corsOrigins = defaultCorsOrigins } = options;

	const app = Fastify({
		logger: {
			level: logLevel,
		},
		disableRequestLogging: true,
	});

	await app.register(cors, {
		origin: corsOrigins,
	});

	// WebSocket must be registered before routes that use it
	await app.register(websocket, {
		options: { maxPayload: 10 * 1024 * 1024 },
	});

	// Routes
	await app.register(healthRoutes, { prefix: "/api" });
	await app.register(attachmentRoutes, { prefix: "/api" });
	await app.register(hookRoutes, { prefix: "/api" });
	await app.register(wsRoutes, { prefix: "/api" });

	return app;
}
