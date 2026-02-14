/**
 * WebSocket test client — connects to a test server, sends typed requests,
 * collects broadcasts, and provides assertion helpers.
 */

import type {
	WsActionMap,
	WsActionName,
	WsEvent,
} from "@polygousse/types";

type WelcomeMessage = {
	type: "welcome";
	clientId: string;
	connectedClients: number;
};

let nextRequestId = 1;

export class TestWsClient {
	private ws!: WebSocket;
	private pending = new Map<
		string,
		{
			resolve: (value: unknown) => void;
			reject: (reason: unknown) => void;
		}
	>();
	private broadcasts: WsEvent[] = [];
	private broadcastWaiters: {
		type: string;
		resolve: (event: WsEvent) => void;
		reject: (reason: unknown) => void;
	}[] = [];

	public welcome!: WelcomeMessage;

	/**
	 * Connects to the test server WebSocket and waits for the welcome message.
	 */
	async connect(baseUrl: string): Promise<void> {
		const wsUrl = baseUrl.replace(/^http/, "ws") + "/api/ws";

		return new Promise<void>((resolve, reject) => {
			this.ws = new WebSocket(wsUrl);

			this.ws.addEventListener("error", (e) => {
				reject(new Error(`WebSocket connection failed: ${e}`));
			});

			this.ws.addEventListener("message", (event) => {
				const data = JSON.parse(String(event.data));

				// Welcome message comes first
				if (data.type === "welcome") {
					this.welcome = data as WelcomeMessage;
					resolve();
					return;
				}

				// Response to a request (has id + ok fields)
				if ("id" in data && "ok" in data) {
					const waiter = this.pending.get(data.id);
					if (waiter) {
						this.pending.delete(data.id);
						waiter.resolve(data);
					}
					return;
				}

				// Broadcast event (has type field)
				if ("type" in data) {
					this.broadcasts.push(data as WsEvent);

					// Check if any waiters match
					for (let i = this.broadcastWaiters.length - 1; i >= 0; i--) {
						if (this.broadcastWaiters[i]!.type === data.type) {
							const waiter = this.broadcastWaiters.splice(i, 1)[0]!;
							waiter.resolve(data as WsEvent);
						}
					}
				}
			});
		});
	}

	/**
	 * Sends an action and asserts `ok: true`. Returns the typed response data.
	 */
	async sendOk<A extends WsActionName>(
		action: A,
		payload: WsActionMap[A]["payload"],
	): Promise<WsActionMap[A]["response"]> {
		const response = await this.send(action, payload);
		if (!response.ok) {
			throw new Error(
				`Expected ok:true for "${action}" but got error: ${response.error}`,
			);
		}
		return response.data as WsActionMap[A]["response"];
	}

	/**
	 * Sends an action and asserts `ok: false`. Returns the error string.
	 */
	async sendError<A extends WsActionName>(
		action: A,
		payload: WsActionMap[A]["payload"],
	): Promise<string> {
		const response = await this.send(action, payload);
		if (response.ok) {
			throw new Error(
				`Expected ok:false for "${action}" but got ok:true with data: ${JSON.stringify(response.data)}`,
			);
		}
		return response.error;
	}

	/**
	 * Returns all collected broadcast messages, optionally filtered by type.
	 */
	getBroadcasts<T extends WsEvent["type"]>(
		type?: T,
	): Extract<WsEvent, { type: T }>[] {
		if (!type) return this.broadcasts as Extract<WsEvent, { type: T }>[];
		return this.broadcasts.filter(
			(b) => b.type === type,
		) as Extract<WsEvent, { type: T }>[];
	}

	/**
	 * Waits for a specific broadcast event type, with a timeout.
	 */
	async waitForBroadcast<T extends WsEvent["type"]>(
		type: T,
		timeout = 2000,
	): Promise<Extract<WsEvent, { type: T }>> {
		// Check if already received
		const existing = this.broadcasts.find((b) => b.type === type);
		if (existing) return existing as Extract<WsEvent, { type: T }>;

		return new Promise<Extract<WsEvent, { type: T }>>((resolve, reject) => {
			const timer = setTimeout(() => {
				const idx = this.broadcastWaiters.findIndex(
					(w) => w.resolve === (resolve as unknown),
				);
				if (idx >= 0) this.broadcastWaiters.splice(idx, 1);
				reject(
					new Error(
						`Timed out waiting for broadcast "${type}" after ${timeout}ms`,
					),
				);
			}, timeout);

			const waiter = {
				type,
				resolve: (event: WsEvent) => {
					clearTimeout(timer);
					resolve(event as Extract<WsEvent, { type: T }>);
				},
				reject,
			};
			this.broadcastWaiters.push(waiter);
		});
	}

	/**
	 * Clears all collected broadcasts.
	 */
	clearBroadcasts(): void {
		this.broadcasts = [];
	}

	/**
	 * Disconnects from the server.
	 */
	close(): void {
		if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
			this.ws.close();
		}
	}

	// ── Internal ──────────────────────────────────────────────────────

	private send(
		action: string,
		payload: unknown,
	): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
		const id = String(nextRequestId++);

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(
					new Error(`WS request "${action}" (id=${id}) timed out after 5000ms`),
				);
			}, 5000);

			this.pending.set(id, {
				resolve: (value) => {
					clearTimeout(timer);
					resolve(value as { ok: true; data: unknown } | { ok: false; error: string });
				},
				reject: (reason) => {
					clearTimeout(timer);
					reject(reason);
				},
			});

			this.ws.send(JSON.stringify({ id, action, payload }));
		});
	}
}
