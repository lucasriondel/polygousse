import type { AppState } from "./index";
import type { StoreSet, WsEvent } from "./types";

type Get = () => AppState;

/** Shallow-compare two plain objects by own enumerable keys. */
function shallowEqual(a: object, b: object): boolean {
	const keysA = Object.keys(a);
	const keysB = Object.keys(b);
	if (keysA.length !== keysB.length) return false;
	for (const key of keysA) {
		if ((a as never)[key] !== (b as never)[key]) return false;
	}
	return true;
}

export function applyEvent(set: StoreSet, get: Get, event: WsEvent): void {
	switch (event.type) {
		case "workspace:created":
		case "workspace:updated": {
			const existing = get().workspaces.get(event.workspace.id);
			if (existing && shallowEqual(existing, event.workspace)) break;
			set(
				(state) => {
					const next = new Map(state.workspaces);
					next.set(event.workspace.id, event.workspace);
					return { workspaces: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "workspace:deleted": {
			if (!get().workspaces.has(event.id)) break;
			set(
				(state) => {
					const next = new Map(state.workspaces);
					next.delete(event.id);
					return { workspaces: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "task:created":
		case "task:updated": {
			const existing = get().tasks.get(event.task.id);
			if (existing && shallowEqual(existing, event.task)) break;
			set(
				(state) => {
					const next = new Map(state.tasks);
					next.set(event.task.id, event.task);
					return { tasks: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "task:deleted": {
			if (!get().tasks.has(event.id)) break;
			set(
				(state) => {
					const next = new Map(state.tasks);
					next.delete(event.id);
					return { tasks: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "task:reordered": {
			const tasks = get().tasks;
			const allMatch = event.tasks.every(({ id, position, folder_id }) => {
				const t = tasks.get(id);
				return t && t.position === position && t.folder_id === folder_id;
			});
			if (allMatch) break;
			set(
				(state) => {
					const next = new Map(state.tasks);
					for (const { id, position, folder_id } of event.tasks) {
						const existing = next.get(id);
						if (existing) {
							next.set(id, { ...existing, position, folder_id });
						}
					}
					return { tasks: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "task:attachment:created": {
			const existing = get().attachments.get(event.attachment.id);
			if (existing && shallowEqual(existing, event.attachment)) break;
			set(
				(state) => {
					const next = new Map(state.attachments);
					next.set(event.attachment.id, event.attachment);
					return { attachments: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "task:attachment:deleted": {
			if (!get().attachments.has(event.id)) break;
			set(
				(state) => {
					const next = new Map(state.attachments);
					next.delete(event.id);
					return { attachments: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "folder:created":
		case "folder:updated": {
			const existing = get().folders.get(event.folder.id);
			if (existing && shallowEqual(existing, event.folder)) break;
			set(
				(state) => {
					const next = new Map(state.folders);
					next.set(event.folder.id, event.folder);
					return { folders: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "folder:deleted": {
			if (!get().folders.has(event.id)) break;
			set(
				(state) => {
					const next = new Map(state.folders);
					next.delete(event.id);
					return { folders: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "folder:reordered": {
			const folders = get().folders;
			const allMatch = event.folders.every(({ id, position }) => {
				const f = folders.get(id);
				return f && f.position === position;
			});
			if (allMatch) break;
			set(
				(state) => {
					const next = new Map(state.folders);
					for (const { id, position } of event.folders) {
						const existing = next.get(id);
						if (existing) {
							next.set(id, { ...existing, position });
						}
					}
					return { folders: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "claude-session:created":
		case "claude-session:updated": {
			const existing = get().claudeSessions.get(event.session.id);
			if (existing && shallowEqual(existing, event.session)) break;
			set(
				(state) => {
					const next = new Map(state.claudeSessions);
					next.set(event.session.id, event.session);
					return { claudeSessions: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "terminal-session:created":
		case "terminal-session:updated": {
			break;
		}
		case "hook-event:raw": {
			break;
		}
		case "ralph-session:created":
		case "ralph-session:updated": {
			const existing = get().ralphSessions.get(event.session.terminal_session_id);
			if (existing && shallowEqual(existing, event.session)) break;
			set(
				(state) => {
					const next = new Map(state.ralphSessions);
					next.set(event.session.terminal_session_id, event.session);
					return { ralphSessions: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "orchestrator:created":
		case "orchestrator:updated": {
			break;
		}
		case "setting:updated": {
			const existing = get().settings.get(event.setting.key);
			if (existing === event.setting.value) break;
			set(
				(state) => {
					const next = new Map(state.settings);
					next.set(event.setting.key, event.setting.value);
					return { settings: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "setting:deleted": {
			if (!get().settings.has(event.key)) break;
			set(
				(state) => {
					const next = new Map(state.settings);
					next.delete(event.key);
					return { settings: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "claude-usage:updated": {
			set(
				{ claudeUsage: event.usage, claudeUsageStatus: event.status },
				false,
				`ws/${event.type}`,
			);
			break;
		}
		case "linear-task-link:created": {
			const existing = get().linearTaskLinks.get(event.link.task_id);
			if (existing && shallowEqual(existing, event.link)) break;
			set(
				(state) => {
					const next = new Map(state.linearTaskLinks);
					next.set(event.link.task_id, event.link);
					return { linearTaskLinks: next };
				},
				false,
				`ws/${event.type}`,
			);
			break;
		}
	}
}
