import type { ClaudeUsageData } from "../types";

export interface UsageSlice {
	claudeUsage: ClaudeUsageData | null;
	claudeUsageStatus: string;
}

export const createUsageSlice = (): UsageSlice => ({
	claudeUsage: null,
	claudeUsageStatus: "initializing",
});
