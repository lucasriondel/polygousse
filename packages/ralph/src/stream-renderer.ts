// src/stream-renderer.ts - Rich terminal UI for Claude CLI stream-json output

import chalk from "chalk";

interface ToolState {
	name: string;
	id: string;
	summary: string;
	lineLength: number; // track printed length for same-line result
}

/**
 * Parses Claude CLI stream-json events and renders a rich terminal UI.
 * Accumulates text output for completion marker detection.
 */
export class StreamRenderer {
	private output = "";
	private currentTool: ToolState | null = null;
	private verbose: boolean;
	// Track tool IDs we've already rendered from assistant messages
	// to avoid duplicating when stream_event also fires
	private renderedToolIds = new Set<string>();
	// Track whether we're in a streaming text block
	private isStreamingText = false;
	// Track whether we're inside a text block (for box-drawing prefix)
	private hasTextContent = false;

	constructor(verbose = false) {
		this.verbose = verbose;
	}

	/**
	 * Process a single JSON line from Claude CLI stdout
	 */
	processLine(line: string): void {
		if (!line.trim()) return;

		try {
			const parsed = JSON.parse(line);
			switch (parsed.type) {
				case "system":
					this.handleSystem(parsed);
					break;
				case "assistant":
					this.handleAssistant(parsed);
					break;
				case "user":
					this.handleUser(parsed);
					break;
				case "result":
					this.handleResult(parsed);
					break;
				default:
					// stream_event wraps inner events
					if (parsed.type === "content_block_start") {
						this.handleContentBlockStart(parsed);
					} else if (parsed.type === "content_block_delta") {
						this.handleContentBlockDelta(parsed);
					} else if (parsed.type === "content_block_stop") {
						this.handleContentBlockStop(parsed);
					}
					// Silently ignore: message_start, message_delta, message_stop, rate_limit_event
					break;
			}
		} catch {
			// Not valid JSON, ignore
			if (this.verbose) {
				console.log(chalk.dim(`[stream] non-JSON line: ${line.slice(0, 80)}`));
			}
		}
	}

	/**
	 * Get accumulated text output (for completion marker checking)
	 */
	getOutput(): string {
		return this.output;
	}

	// ── Event handlers ──────────────────────────────────────────────

	private handleSystem(parsed: any): void {
		// Show init info only
		if (parsed.subtype === "init" && parsed.session_id) {
			const model = parsed.model ?? "unknown";
			process.stderr.write(chalk.dim(`\n⚡ Session initialized (${model})\n\n`));
		}
		// Skip hook_started, hook_response, etc.
	}

	private handleAssistant(parsed: any): void {
		const content = parsed.message?.content;
		if (!Array.isArray(content)) return;

		for (const block of content) {
			if (block.type === "text") {
				// Only accumulate from assistant messages if we're NOT getting stream deltas
				// (stream deltas handle output when --include-partial-messages is on)
				if (!this.isStreamingText) {
					this.output += block.text;
					this.writeText(block.text);
				}
			} else if (block.type === "tool_use") {
				this.endTextBlock();
				// Avoid rendering twice if stream_event already rendered this tool
				if (!this.renderedToolIds.has(block.id)) {
					this.renderToolStart(block.name, block.id, block.input);
				}
			}
		}
	}

	private handleUser(parsed: any): void {
		// Tool results come as user messages
		const content = parsed.message?.content;
		if (!Array.isArray(content)) return;

		for (const block of content) {
			if (block.type === "tool_result") {
				this.renderToolResult(block.tool_use_id, block.is_error);
			}
		}
	}

	private handleContentBlockStart(parsed: any): void {
		const block = parsed.content_block;
		if (!block) return;

		if (block.type === "tool_use") {
			this.endTextBlock();
			this.renderedToolIds.add(block.id);
			this.renderToolStart(block.name, block.id, block.input);
		} else if (block.type === "text") {
			this.isStreamingText = true;
		}
	}

	private handleContentBlockDelta(parsed: any): void {
		const delta = parsed.delta;
		if (!delta) return;

		if (delta.type === "text_delta" && delta.text) {
			this.output += delta.text;
			this.writeText(delta.text);
		}
		// input_json_delta: ignore (tool input streaming)
	}

	private handleContentBlockStop(_parsed: any): void {
		if (this.isStreamingText) {
			this.endTextBlock();
		}
		this.isStreamingText = false;
	}

	private handleResult(parsed: any): void {
		const result = parsed.result ?? parsed;
		const cost = result.cost_usd ?? result.cost;
		const turns = result.num_turns;
		const duration = result.duration_ms ?? result.duration_api_ms;
		const tokensOut = result.usage?.output_tokens;
		const isError = result.is_error;

		// Ensure there's a newline before the result bar
		process.stderr.write("\n");

		const parts: string[] = [];

		if (isError) {
			parts.push(chalk.red("✗ Error"));
		} else {
			parts.push(chalk.green("✓ Success"));
		}

		if (turns != null) parts.push(`${turns} turn${turns !== 1 ? "s" : ""}`);
		if (duration != null) parts.push(`${(duration / 1000).toFixed(1)}s`);
		if (cost != null) parts.push(`$${Number(cost).toFixed(2)}`);
		if (tokensOut != null) parts.push(`${tokensOut} tokens out`);

		process.stderr.write(chalk.dim("─── Result ───\n"));
		process.stderr.write(`${parts.join(chalk.dim(" · "))}\n`);
	}

	// ── Rendering helpers ───────────────────────────────────────────

	private writeText(text: string): void {
		if (!text) return;

		// Start a new text block if needed
		if (!this.hasTextContent) {
			this.hasTextContent = true;
			process.stderr.write("\n");
			process.stderr.write(chalk.dim("  ┌ "));
		}

		// Write text with line-prefix for multi-line content
		const lines = text.split("\n");
		for (let i = 0; i < lines.length; i++) {
			if (i > 0) {
				// For each new line in the text, add the dim bar prefix
				process.stderr.write(`\n${chalk.dim("  │ ")}`);
			}
			process.stderr.write(chalk.white(lines[i]));
		}
	}

	private endTextBlock(): void {
		if (this.hasTextContent) {
			process.stderr.write("\n");
			this.hasTextContent = false;
		}
	}

	private renderToolStart(name: string, id: string, input: any): void {
		// Close any pending tool that didn't get a result
		if (this.currentTool) {
			process.stderr.write(`${chalk.dim(" → ") + chalk.yellow("…")}\n`);
		}

		const summary = this.summarizeToolInput(name, input);

		// Build the line: "  ⚡ ToolName summary"
		const line = chalk.cyan(`  ⚡ ${name}`) + (summary ? chalk.dim(` ${summary}`) : "");
		// Calculate visible length for padding later
		const visibleLength = `  ⚡ ${name}${summary ? ` ${summary}` : ""}`.length;

		this.currentTool = { name, id, summary, lineLength: visibleLength };

		process.stderr.write(line);
		// Don't write newline — result will be appended on the same line
	}

	private renderToolResult(toolUseId: string, isError?: boolean): void {
		if (this.currentTool && this.currentTool.id === toolUseId) {
			if (isError) {
				process.stderr.write(`${chalk.dim(" → ") + chalk.red("error")}\n`);
			} else {
				process.stderr.write(`${chalk.dim(" → ") + chalk.green("done")}\n`);
			}
			this.currentTool = null;
		}
		// If tool IDs don't match, we might have missed something — just ignore
	}

	private summarizeToolInput(name: string, input: any): string {
		if (!input) return "";

		try {
			switch (name) {
				case "Read":
					return input.file_path ? this.shortenPath(input.file_path) : "";
				case "Edit":
					return input.file_path ? this.shortenPath(input.file_path) : "";
				case "Write":
					return input.file_path ? this.shortenPath(input.file_path) : "";
				case "Bash":
					return input.command ? this.truncate(input.command, 60) : "";
				case "Grep":
					return input.pattern ? `/${input.pattern}/` : "";
				case "Glob":
					return input.pattern ?? "";
				case "Task":
					return input.description ?? "";
				case "TodoWrite":
					return "";
				default:
					return "";
			}
		} catch {
			return "";
		}
	}

	private shortenPath(filepath: string): string {
		const cwd = process.cwd();
		if (filepath.startsWith(cwd)) {
			return filepath.slice(cwd.length + 1); // Remove cwd + leading /
		}
		return filepath;
	}

	private truncate(str: string, max: number): string {
		// Replace newlines with spaces for display
		const clean = str.replace(/\n/g, " ").trim();
		if (clean.length <= max) return clean;
		return `${clean.slice(0, max - 1)}…`;
	}
}

/**
 * Render a boxed iteration banner in the terminal.
 *
 *   ╭──────────────────────────╮
 *   │  ◆  Iteration  1 / 5    │
 *   ╰──────────────────────────╯
 */
export function renderIterationBanner(iteration: number, maxIterations: number | "infinite"): void {
	const max = maxIterations === "infinite" ? Infinity : maxIterations;
	const label = max === Infinity ? `Iteration  ${iteration}` : `Iteration  ${iteration} / ${max}`;

	const inner = `  ◆  ${label}  `;
	const width = inner.length;

	const top = `╭${"─".repeat(width)}╮`;
	const mid = `│${inner}│`;
	const bot = `╰${"─".repeat(width)}╯`;

	process.stderr.write("\n");
	process.stderr.write(`${chalk.cyan(top)}\n`);
	process.stderr.write(`${chalk.cyan(mid)}\n`);
	process.stderr.write(`${chalk.cyan(bot)}\n`);
}
