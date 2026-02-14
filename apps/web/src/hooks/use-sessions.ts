import { shallowArrayEqual } from "@/lib/shallow-array-equal";
import { useStore } from "@/store";
import { selectActiveSessions } from "@/store/selectors";

export function useActiveSessions() {
	const sessions = useStore(selectActiveSessions, shallowArrayEqual);

	return { sessions };
}
