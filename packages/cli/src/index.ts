export {};

const API_URL = process.env.POLYGOUSSE_API_URL ?? "http://localhost:5616/api";

try {
	const chunks: Buffer[] = [];
	for await (const chunk of Bun.stdin.stream()) {
		chunks.push(Buffer.from(chunk));
	}
	const body = Buffer.concat(chunks).toString("utf-8").trim();

	if (!body) {
		process.exit(0);
	}

	// Inject session IDs and iteration from env so the API can link sessions
	let payload = body;
	const terminalSessionId = process.env.POLYGOUSSE_TERMINAL_SESSION_ID;
	const ralphSessionId = process.env.POLYGOUSSE_RALPH_SESSION_ID;
	const ralphIteration = process.env.RALPH_ITERATION;
	if (terminalSessionId || ralphSessionId || ralphIteration) {
		const parsed = JSON.parse(body);
		if (terminalSessionId) parsed.terminal_session_id = terminalSessionId;
		if (ralphSessionId) parsed.ralph_session_id = ralphSessionId;
		if (ralphIteration) parsed.ralph_iteration = Number(ralphIteration);
		payload = JSON.stringify(parsed);
	}

	await fetch(`${API_URL}/hooks/event`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: payload,
	});
} catch (err) {
	console.error("[polygousse-cli]", err);
}

process.exit(0);
