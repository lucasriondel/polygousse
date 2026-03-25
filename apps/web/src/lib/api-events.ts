type Direction = "in" | "out";

export interface SocketEvent {
	id: number;
	direction: Direction;
	type: string;
	payload: unknown;
	timestamp: number;
}

let nextId = 1;

export function getNextEventId(): number {
	return nextId++;
}

// ── Module-level event store (survives tab switches & HMR) ────────────

const MAX_STORED_EVENTS = 2000;

let storedEvents: SocketEvent[] = [];
let storeListeners = new Set<() => void>();

export function getStoredEvents(): SocketEvent[] {
	return storedEvents;
}

export function pushEvent(event: SocketEvent) {
	storedEvents = [...storedEvents, event];
	if (storedEvents.length > MAX_STORED_EVENTS) {
		storedEvents = storedEvents.slice(-MAX_STORED_EVENTS);
	}
	for (const cb of storeListeners) cb();
}

export function clearStoredEvents() {
	storedEvents = [];
	for (const cb of storeListeners) cb();
}

export function subscribeToEventStore(cb: () => void): () => void {
	storeListeners.add(cb);
	return () => {
		storeListeners.delete(cb);
	};
}

/**
 * Record an outgoing WS event in the debug event store.
 */
export function recordOutgoingEvent(action: string, payload: unknown) {
	pushEvent({
		id: getNextEventId(),
		direction: "out",
		type: action,
		payload,
		timestamp: Date.now(),
	});
}

// Preserve across Vite HMR
if (import.meta.hot) {
	if (import.meta.hot.data.storedEvents) {
		storedEvents = import.meta.hot.data.storedEvents;
		storeListeners = import.meta.hot.data.storeListeners;
		nextId = import.meta.hot.data.nextId ?? nextId;
	}
	import.meta.hot.dispose((data) => {
		data.storedEvents = storedEvents;
		data.storeListeners = storeListeners;
		data.nextId = nextId;
	});
}
