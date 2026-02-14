// src/hooks.ts - Lifecycle hook execution for Ralph loops

import chalk from "chalk";
import type { HookContext, HookResult, HooksConfig } from "./types";

/**
 * Build environment variables from HookContext for RALPH_* env vars.
 */
export function buildHookEnv(context: HookContext): Record<string, string> {
	const env: Record<string, string> = {
		RALPH_ITERATION: String(context.iteration),
		RALPH_MAX_ITERATIONS: String(context.maxIterations),
		RALPH_COMPLETION_MARKER_FOUND: String(context.completionMarkerFound),
		RALPH_LAST_EXECUTION_SUCCESS: String(context.lastExecutionSuccess),
		RALPH_WORKING_DIRECTORY: context.workingDirectory,
		RALPH_OPERATION: context.operation,
	};

	if (context.stepName !== undefined) {
		env.RALPH_STEP_NAME = context.stepName;
	}
	if (context.stepIndex !== undefined) {
		env.RALPH_STEP_INDEX = String(context.stepIndex);
	}
	if (context.totalSteps !== undefined) {
		env.RALPH_TOTAL_STEPS = String(context.totalSteps);
	}

	return env;
}

/**
 * Execute a shell command hook via `sh -c`.
 * Returns the exit code or throws on spawn failure.
 */
async function executeHook(command: string, env: Record<string, string>): Promise<number> {
	const proc = Bun.spawn(["sh", "-c", command], {
		stdout: "pipe",
		stderr: "pipe",
		stdin: "ignore",
		env: { ...process.env, ...env },
		cwd: process.cwd(),
	});

	// Drain stdout/stderr to avoid blocking
	const [, , exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	return exitCode;
}

/**
 * Run a named hook if configured.
 *
 * For flow-control hooks (afterIteration, afterInstruction):
 *   - exit 0 = shouldStop: true (condition met, stop the loop)
 *   - non-zero = shouldStop: false (condition not met, continue)
 *
 * For informational hooks (onLoopStart, onLoopEnd):
 *   - shouldStop is always false regardless of exit code
 *
 * If the hook command fails to spawn/execute, logs a warning and returns
 * shouldStop: false so a typo doesn't silently end the loop.
 */
export async function runHook(
	hookName: keyof HooksConfig,
	hooks: HooksConfig,
	context: HookContext,
	verbose: boolean = false,
): Promise<HookResult> {
	const command = hooks[hookName];

	if (!command) {
		return { shouldStop: false, exitCode: -1 };
	}

	if (verbose) {
		console.log(chalk.dim(`[Hook] Running ${hookName}: ${command}`));
	}

	const env = buildHookEnv(context);

	try {
		const exitCode = await executeHook(command, env);

		if (verbose) {
			console.log(chalk.dim(`[Hook] ${hookName} exited with code ${exitCode}`));
		}

		// Flow-control hooks: exit 0 means stop
		const isFlowControl = hookName === "afterIteration" || hookName === "afterInstruction";
		const shouldStop = isFlowControl && exitCode === 0;

		if (shouldStop) {
			console.log(chalk.green(`\n✅ Hook "${hookName}" signaled stop (exit 0).`));
		}

		return { shouldStop, exitCode };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.warn(chalk.yellow(`\n⚠️  Hook "${hookName}" failed to execute: ${errorMessage}`));

		if (verbose) {
			console.log(chalk.dim(`[Hook] ${hookName} execution error: ${errorMessage}`));
		}

		// Spawn/execution failure: don't stop the loop
		return { shouldStop: false, exitCode: -1, error: errorMessage };
	}
}
