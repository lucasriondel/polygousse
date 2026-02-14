import { wsRequest } from "@/lib/ws-client";
import type { Setting } from "../types";

export interface SettingsSlice {
	settings: Map<string, string>;
	updateSetting: (key: string, value: string) => Promise<Setting>;
	deleteSetting: (key: string) => Promise<void>;
}

export const createSettingsSlice = (): SettingsSlice => ({
	settings: new Map(),

	updateSetting: async (key, value) => {
		return wsRequest("setting:update", { key, value });
	},

	deleteSetting: async (key) => {
		await wsRequest("setting:delete", { key });
	},
});
