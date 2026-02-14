// src/executor.ts - Claude execution (spawn process)

import chalk from "chalk";
import { runHook } from "./hooks";
import { buildClaudeArgs } from "./prompts";
import { renderIterationBanner, StreamRenderer } from "./stream-renderer";
import type { ExecutionResult, HookContext, RalphConfig } from "./types";

/**
 * Execute Claude with the assembled prompt
 */
export async function executeIteration(
	config: RalphConfig,
	iterationNumber: number,
	verbose: boolean = false,
): Promise<ExecutionResult> {
	const args = buildClaudeArgs(config);

	// Build the command and arguments
	let command: string;
	let commandArgs: string[];

	if (config.docker) {
		command = "docker";
		commandArgs = ["sandbox", "run", "claude", ...args];
	} else {
		command = "claude";
		commandArgs = args;
	}

	if (verbose) {
		console.log(
			chalk.dim(`[Iteration ${iterationNumber}] Executing: ${command} ${commandArgs.join(" ")}`),
		);
	}

	const renderer = new StreamRenderer(verbose);

	try {
		// Use Bun's native spawn for proper streaming
		// stdin: 'ignore' prevents Claude from waiting for user input
		const proc = Bun.spawn([command, ...commandArgs], {
			stdout: "pipe",
			stderr: "pipe",
			stdin: "ignore",
			env: {
				...process.env,
				RALPH_ITERATION: String(iterationNumber),
			},
		});

		const decoder = new TextDecoder();

		// Read stdout and stderr concurrently to avoid deadlocks
		const readStdout = async () => {
			const reader = proc.stdout.getReader();
			let buffer = "";

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					if (verbose) {
						console.log(chalk.dim(`[DEBUG] Received ${chunk.length} bytes`));
					}
					buffer += chunk;

					// Process complete lines
					const lines = buffer.split("\n");
					buffer = lines.pop() || ""; // Keep incomplete line in buffer

					for (const line of lines) {
						renderer.processLine(line);
					}
				}

				// Process any remaining buffer content
				if (buffer.trim()) {
					renderer.processLine(buffer);
				}
			} finally {
				reader.releaseLock();
			}
		};

		const readStderr = async () => {
			const reader = proc.stderr.getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					process.stderr.write(decoder.decode(value, { stream: true }));
				}
			} finally {
				reader.releaseLock();
			}
		};

		// Run both readers concurrently, and also wait for process exit
		const [, , exitCode] = await Promise.all([readStdout(), readStderr(), proc.exited]);

		const output = renderer.getOutput();

		if (verbose) {
			console.log(chalk.dim(`\n[DEBUG] Claude process exited with code: ${exitCode}`));
			console.log(chalk.dim(`[DEBUG] Total output length: ${output.length} chars`));
		}

		// Ensure output ends with newline
		if (output && !output.endsWith("\n")) {
			process.stdout.write("\n");
		}

		// Check if completion marker appears at the end of output
		const completionMarkerFound = output.trimEnd().endsWith(config.completionMarker);

		if (verbose) {
			console.log(
				chalk.dim(`[DEBUG] Checking for completion marker: "${config.completionMarker}"`),
			);
			console.log(chalk.dim(`[DEBUG] Completion marker found: ${completionMarkerFound}`));
			if (!completionMarkerFound && output.length > 0) {
				// Show last 500 chars of output to help debug
				const tail = output.slice(-500);
				console.log(chalk.dim(`[DEBUG] Last 500 chars of output:\n${tail}`));
			}
		}

		if (exitCode === 0) {
			return {
				success: true,
				output,
				completionMarkerFound,
			};
		} else {
			return {
				success: false,
				output,
				completionMarkerFound: false,
				error: `Process exited with code ${exitCode}`,
			};
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			output: renderer.getOutput(),
			completionMarkerFound: false,
			error: errorMessage,
		};
	}
}

/**
 * Format a duration in milliseconds to a human-readable string
 */
function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		const remainingMinutes = minutes % 60;
		return `${hours}h ${remainingMinutes}m`;
	}
	if (minutes > 0) {
		const remainingSeconds = seconds % 60;
		return `${minutes}m ${remainingSeconds}s`;
	}
	return `${seconds}s`;
}

/**
 * Print the loop summary
 */
export function printLoopSummary(
	completedIterations: number,
	completed: boolean,
	durationMs: number,
	stepsPerIteration: number = 1,
): void {
	const totalRuns = completedIterations * stepsPerIteration;
	const duration = formatDuration(durationMs);

	console.log(chalk.dim("\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈"));
	console.log(
		chalk.bold(`\n  Ralph loop ${completed ? chalk.green("completed") : chalk.yellow("stopped")}`),
	);
	console.log(
		chalk.dim(
			`  ${completedIterations} iteration${completedIterations !== 1 ? "s" : ""} \u2022 ${totalRuns} Claude run${totalRuns !== 1 ? "s" : ""} \u2022 ${duration}\n`,
		),
	);
}

/**
 * Run the Ralph loop for the configured number of iterations
 */
export async function runLoop(
	config: RalphConfig,
	verbose: boolean = false,
): Promise<{ completedIterations: number; completed: boolean; error?: string }> {
	const maxIterations = config.iterations === "infinite" ? Infinity : config.iterations;
	let completedIterations = 0;
	const hooks = config.hooks;
	const startTime = Date.now();

	console.log(
		chalk.blue(
			`\n🔄 Starting Ralph loop (${config.iterations === "infinite" ? "infinite" : config.iterations} iterations)`,
		),
	);
	console.log(chalk.dim(`   Completion marker: ${config.completionMarker}\n`));

	// Build base hook context (updated per iteration)
	const buildHookContext = (
		iteration: number,
		completionMarkerFound: boolean,
		lastExecutionSuccess: boolean,
	): HookContext => ({
		iteration,
		maxIterations: config.iterations,
		completionMarkerFound,
		lastExecutionSuccess,
		workingDirectory: process.cwd(),
		operation: config.operation,
	});

	// Run onLoopStart hook
	await runHook("onLoopStart", hooks, buildHookContext(0, false, true), verbose);

	for (let i = 1; i <= maxIterations; i++) {
		renderIterationBanner(i, config.iterations);

		if (verbose) {
			console.log(chalk.dim(`[DEBUG] Starting iteration ${i}...`));
		}

		const result = await executeIteration(config, i, verbose);
		completedIterations++;

		if (verbose) {
			console.log(
				chalk.dim(
					`[DEBUG] Iteration ${i} finished. success=${result.success}, completionMarkerFound=${result.completionMarkerFound}`,
				),
			);
		}

		if (!result.success) {
			console.log(chalk.red(`\n❌ Iteration ${i} failed: ${result.error}`));
			await runHook("onLoopEnd", hooks, buildHookContext(i, false, false), verbose);
			printLoopSummary(completedIterations, false, Date.now() - startTime);
			return {
				completedIterations,
				completed: false,
				error: result.error,
			};
		}

		if (result.completionMarkerFound) {
			console.log(chalk.green(`\n✅ Completion marker found! All tasks complete.`));
			await runHook("onLoopEnd", hooks, buildHookContext(i, true, true), verbose);
			printLoopSummary(completedIterations, true, Date.now() - startTime);
			return {
				completedIterations,
				completed: true,
			};
		}

		// Run afterIteration hook (exit 0 = stop loop)
		const hookResult = await runHook(
			"afterIteration",
			hooks,
			buildHookContext(i, false, true),
			verbose,
		);
		if (hookResult.shouldStop) {
			await runHook("onLoopEnd", hooks, buildHookContext(i, false, true), verbose);
			printLoopSummary(completedIterations, true, Date.now() - startTime);
			return {
				completedIterations,
				completed: true,
			};
		}

		if (i < maxIterations) {
			console.log(chalk.dim(`\n   Iteration ${i} complete. Continuing to next iteration...`));
		}
	}

	console.log(
		chalk.yellow(
			`\n⚠️  Reached maximum iterations (${maxIterations}) without finding completion marker.`,
		),
	);
	await runHook("onLoopEnd", hooks, buildHookContext(completedIterations, false, true), verbose);
	printLoopSummary(completedIterations, false, Date.now() - startTime);
	return {
		completedIterations,
		completed: false,
	};
}
