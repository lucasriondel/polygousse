import { wsRequest } from "@/lib/ws-client";
import type { ClaudeSession, RalphSession } from "../types";

export interface SessionSlice {
	claudeSessions: Map<string, ClaudeSession>;
	ralphSessions: Map<string, RalphSession>;
	dismissClaudeSession: (id: string) => Promise<void>;
	sendMessage: (sessionId: string, message: string) => Promise<void>;
	completeTask: (sessionId: string) => Promise<void>;
}

export const createSessionSlice = (): SessionSlice => ({
	claudeSessions: new Map(),
	ralphSessions: new Map(),

	dismissClaudeSession: async (id) => {
		await wsRequest("hook:session-dismiss", { id });
	},

	sendMessage: async (sessionId, message) => {
		await wsRequest("session:send-message", { sessionId, message });
	},

	completeTask: async (sessionId) => {
		await wsRequest("session:complete-task", { sessionId });
	},
});
