import {
	clearHookEvents,
	dismissClaudeSession,
	getActiveClaudeSessions,
	getClaudeSessionById,
	getRecentHookEvents,
	getWaitingClaudeSessionsWithTask,
} from "@polygousse/database";
import type { FastifyPluginAsync } from "fastify";
import {
	type HookEventBody as HookEventBodyType,
	processHookEvent,
} from "../services/hook-processing/index.js";
import { broadcast } from "../ws/index.js";
import { HookEventBody, type HookEventBodySchema, IdParams, RecentEventsQuery } from "./schemas.js";

const hookRoutes: FastifyPluginAsync = async (fastify) => {
	// POST /hooks/event — Receive hook event from CLI, upsert session, broadcast WS
	fastify.post<{ Body: HookEventBodySchema }>(
		"/hooks/event",
		{ schema: { body: HookEventBody } },
		async (request, reply) => {
			const session = await processHookEvent(request.body as HookEventBodyType, request.log);

			if (!session) {
				return reply.status(204).send();
			}

			return session;
		},
	);

	// GET /hooks/events/recent — Return recent hook events for debug view
	fastify.get<{ Querystring: RecentEventsQuery }>(
		"/hooks/events/recent",
		{ schema: { querystring: RecentEventsQuery } },
		async (request) => {
			const { limit } = request.query;
			const parsedLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
			return getRecentHookEvents.all(parsedLimit);
		},
	);

	// DELETE /hooks/events — Clear all stored hook events
	fastify.delete("/hooks/events", async (_request, reply) => {
		clearHookEvents.run();
		return reply.status(204).send();
	});

	// GET /hooks/sessions — List all active (non-ended) sessions
	fastify.get("/hooks/sessions", async () => {
		return getActiveClaudeSessions.all();
	});

	// GET /hooks/sessions/waiting — List sessions needing attention (with linked task)
	// IMPORTANT: Must be registered before /hooks/sessions/:id to avoid being shadowed
	fastify.get("/hooks/sessions/waiting", async () => {
		return getWaitingClaudeSessionsWithTask.all();
	});

	// GET /hooks/sessions/:id — Get a single session by ID
	fastify.get<{ Params: IdParams }>(
		"/hooks/sessions/:id",
		{ schema: { params: IdParams } },
		async (request, reply) => {
			const { id } = request.params;
			const session = getClaudeSessionById.get(id);
			if (!session) {
				return reply.status(404).send({ error: "Session not found" });
			}
			return session;
		},
	);

	// DELETE /hooks/sessions/:id — Dismiss an inbox item
	fastify.delete<{ Params: IdParams }>(
		"/hooks/sessions/:id",
		{ schema: { params: IdParams } },
		async (request, reply) => {
			const { id } = request.params;
			const session = dismissClaudeSession.get(id);
			if (!session) {
				return reply.status(404).send({ error: "Session not found" });
			}
			broadcast({ type: "claude-session:updated", session });
			return session;
		},
	);
};

export default hookRoutes;
