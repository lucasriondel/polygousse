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
