import { shallowArrayEqual } from "@/lib/shallow-array-equal";
import { useStore } from "@/store";
import { selectActiveClaudeSessions, selectWaitingClaudeSessions } from "@/store/selectors";

// Re-export type so existing consumers don't need to change imports
export type { ClaudeSession } from "@/store/types";

export function useClaudeSessions() {
	const sessions = useStore(selectActiveClaudeSessions, shallowArrayEqual);

	return { sessions };
}

export function useWaitingClaudeSessions() {
	const sessions = useStore(selectWaitingClaudeSessions, shallowArrayEqual);

	return { sessions };
}
