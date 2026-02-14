import { useCallback, useEffect, useState } from "react";
import { useAppSocket } from "@/hooks/use-app-socket";

interface WsMessage {
	type: string;
	[key: string]: unknown;
}

export function HomePage() {
	const { subscribe } = useAppSocket();
	const [messages, setMessages] = useState<WsMessage[]>([]);

	const handleMessage = useCallback((data: unknown) => {
		const msg = data as WsMessage;
		setMessages((prev) => [...prev.slice(-49), msg]);
	}, []);

	useEffect(() => {
		// Subscribe to all known event types via the shared WebSocket
		const eventTypes = [
			"workspace:created",
			"workspace:updated",
			"workspace:deleted",
			"task:created",
			"task:updated",
			"task:deleted",
			"task:reordered",
			"task:attachment:created",
			"task:attachment:deleted",
			"folder:created",
			"folder:updated",
			"folder:deleted",
			"folder:reordered",
			"claude-session:created",
			"claude-session:updated",
			"terminal-session:created",
			"terminal-session:updated",
			"hook-event:raw",
			"ralph-session:created",
			"ralph-session:updated",
			"orchestrator:created",
			"orchestrator:updated",
		];

		const unsubscribes = eventTypes.map((type) => subscribe(type, handleMessage));

		return () => {
			for (const unsub of unsubscribes) {
				unsub();
			}
		};
	}, [subscribe, handleMessage]);

	return (
		<div className="mx-auto max-w-2xl px-4 py-16">
			<div className="mb-8 text-center">
				<h1 className="text-4xl font-bold tracking-tight">polygousse</h1>
				<p className="mt-2 text-muted-foreground">Monorepo with Fastify, React & WebSockets</p>
			</div>

			<div className="rounded-lg border border-border bg-card p-6">
				<div className="space-y-2">
					<h2 className="text-sm font-medium text-muted-foreground">Messages</h2>
					{messages.length === 0 ? (
						<p className="text-sm text-muted-foreground">Waiting for messages...</p>
					) : (
						<div className="max-h-64 space-y-1 overflow-y-auto">
							{messages.map((msg, i) => (
								<pre
									key={`${msg.type}-${i}`}
									className="rounded bg-muted px-3 py-2 text-xs font-mono"
								>
									{JSON.stringify(msg, null, 2)}
								</pre>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
