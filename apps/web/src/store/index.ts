import { devtools } from "zustand/middleware";
import { createWithEqualityFn } from "zustand/traditional";
import { applyEvent } from "./apply-event";
import { hydrate } from "./hydrate";
import type { AttachmentSlice } from "./slices/attachment-slice";
import { createAttachmentSlice } from "./slices/attachment-slice";
import type { FolderSlice } from "./slices/folder-slice";
import { createFolderSlice } from "./slices/folder-slice";
import type { LinearSlice } from "./slices/linear-slice";
import { createLinearSlice } from "./slices/linear-slice";
import type { SessionSlice } from "./slices/session-slice";
import { createSessionSlice } from "./slices/session-slice";
import type { SettingsSlice } from "./slices/settings-slice";
import { createSettingsSlice } from "./slices/settings-slice";
import type { TaskSlice } from "./slices/task-slice";
import { createTaskSlice } from "./slices/task-slice";
import type { UsageSlice } from "./slices/usage-slice";
import { createUsageSlice } from "./slices/usage-slice";
import type { WorkspaceSlice } from "./slices/workspace-slice";
import { createWorkspaceSlice } from "./slices/workspace-slice";
import type { StoreSet, WsEvent } from "./types";

export interface AppState
	extends WorkspaceSlice,
		TaskSlice,
		FolderSlice,
		AttachmentSlice,
		SessionSlice,
		SettingsSlice,
		LinearSlice,
		UsageSlice {
	hydrated: boolean;
	hydrationError: string | null;
	hydrate: () => Promise<void>;
	applyEvent: (event: WsEvent) => void;
}

export const useStore = createWithEqualityFn<AppState>()(
	devtools(
		(set, get) => {
			const storeSet = set as StoreSet;
			return {
				...createWorkspaceSlice(),
				...createTaskSlice(),
				...createFolderSlice(),
				...createAttachmentSlice(),
				...createSessionSlice(),
				...createSettingsSlice(),
				...createLinearSlice(),
				...createUsageSlice(),

				hydrated: false,
				hydrationError: null,
				hydrate: () => hydrate(storeSet),
				applyEvent: (event: WsEvent) => applyEvent(storeSet, get, event),
			};
		},
		{
			name: "PolygousseStore",
			enabled: import.meta.env.DEV,
			serialize: {
				replacer: (_key: string, value: unknown) =>
					value instanceof Map ? Object.fromEntries(value) : value,
			},
		} as Parameters<typeof devtools>[1],
	),
);
