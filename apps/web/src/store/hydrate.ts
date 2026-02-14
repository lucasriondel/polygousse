import { wsRequest } from "@/lib/ws-client";
import type { StoreSet } from "./types";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 8000];

export async function hydrate(set: StoreSet): Promise<void> {
	set({ hydrationError: null }, false, "hydrate/start");

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const data = await wsRequest("hydrate", {});

			set(
				{
					workspaces: new Map(data.workspaces.map((w) => [w.id, w])),
					tasks: new Map(data.tasks.map((t) => [t.id, t])),
					folders: new Map(data.folders.map((f) => [f.id, f])),
					attachments: new Map(data.attachments.map((a) => [a.id, a])),
					claudeSessions: new Map(data.claudeSessions.map((s) => [s.id, s])),
					ralphSessions: new Map(data.ralphSessions.map((rs) => [rs.terminal_session_id, rs])),
					settings: new Map(data.settings.map((s) => [s.key, s.value])),
					linearTaskLinks: new Map(data.linearTaskLinks.map((l) => [l.task_id, l])),
					hydrated: true,
					hydrationError: null,
				},
				false,
				"hydrate",
			);

			// Fetch initial usage data (non-critical)
			try {
				const r = await wsRequest("claude-usage:get", {});
				set({ claudeUsage: r.usage, claudeUsageStatus: r.status }, false, "hydrate/usage");
			} catch {
				/* non-critical */
			}

			return;
		} catch (err) {
			if (attempt < MAX_RETRIES) {
				await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
			} else {
				const message = err instanceof Error ? err.message : "Failed to load application data";
				set({ hydrationError: message }, false, "hydrate/error");
			}
		}
	}
}
