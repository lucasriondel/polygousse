// src/index.ts - Library export for Ralph
import chalk from "chalk";
import { loadConfig, validateConfig } from "./config";
import { executeIteration, printLoopSummary, runLoop } from "./executor";
import { cleanupBranchContext, initializeBranchContext, validateGitState } from "./git";
import { runHook } from "./hooks";
import { formatPromptForDisplay } from "./prompts";
import { renderIterationBanner } from "./stream-renderer";
import type { HookContext, RalphInput, RalphOptions } from "./types";

// Re-export types for library consumers
export type {
	BranchStrategy,
	OperationType,
	RalphConfig,
	RalphInput,
	RalphOptions,
	StepName,
} from "./types";

export interface RalphResult {
	success: boolean;
	error?: string;
}

/**
 * Run a single instruction (existing behavior)
 */
async function runSingleInstruction(options: RalphOptions): Promise<RalphResult> {
	// Load and validate configuration
	const config = loadConfig(options);
	validateConfig(config);

	if (options.verbose) {
		console.log(chalk.dim("Ralph initialized"));
		console.log(chalk.dim("Configuration:"), JSON.stringify(config, null, 2));
	}

	// Dry-run mode: show assembled prompt and exit (before git validation)
	if (options.dryRun) {
		console.log(chalk.cyan("\n=== DRY RUN MODE ===\n"));
		console.log(formatPromptForDisplay(config));
		console.log(chalk.cyan("\n=== END DRY RUN ===\n"));

		// Show execution details
		console.log(chalk.dim("Execution settings:"));
		console.log(chalk.dim(`  Operation: ${config.operation}`));
		console.log(chalk.dim(`  Iterations: ${config.iterations}`));
		console.log(chalk.dim(`  Docker: ${config.docker}`));
		console.log(chalk.dim(`  Stream: ${config.stream}`));
		console.log(chalk.dim(`  Completion marker: ${config.completionMarker}`));
		if (config.git.multiRepo) {
			console.log(chalk.dim(`  Multi-repo: true`));
		}
		if (config.git.branchStrategy !== "none") {
			console.log(chalk.dim(`  Branch strategy: ${config.git.branchStrategy}`));
			console.log(chalk.dim(`  Branch prefix: ${config.git.branchPrefix}`));
		}
		// Show configured hooks
		const hookEntries = Object.entries(config.hooks).filter(([, v]) => v);
		if (hookEntries.length > 0) {
			console.log(chalk.dim("  Hooks:"));
			for (const [name, cmd] of hookEntries) {
				console.log(chalk.dim(`    ${name}: ${cmd}`));
			}
		}
		return { success: true };
	}

	// Validate git state if using branch strategies
	const gitError = await validateGitState(config);
	if (gitError) {
		console.error(chalk.red(`Git error: ${gitError}`));
		return { success: false, error: gitError };
	}

	// Initialize branch context (skip for multi-repo workspaces - no root git repo)
	const branchContext = config.git.multiRepo
		? { originalBranch: "", workingBranch: null }
		: await initializeBranchContext(config, options.verbose);

	// Run the main loop
	const result = await runLoop(config, options.verbose);

	// Cleanup branch context
	await cleanupBranchContext(config, branchContext, options.verbose);

	// Return result
	if (result.error) {
		return { success: false, error: result.error };
	}

	return { success: true };
}

/**
 * Run sequential multi-step instructions.
 * The outer loop is iteration count, inner loop is the sequence of instructions.
 */
async function runSequentialInstructions(instructions: RalphOptions[]): Promise<RalphResult> {
	// Use first instruction's settings for iteration control and git
	const primaryOptions = instructions[0]!;
	const primaryConfig = loadConfig(primaryOptions);
	validateConfig(primaryConfig);

	const verbose = primaryOptions.verbose ?? false;

	if (verbose) {
		console.log(chalk.dim("Ralph initialized (multi-step mode)"));
		console.log(chalk.dim(`Number of steps: ${instructions.length}`));
	}

	// Dry-run mode: show all assembled prompts and exit
	if (primaryOptions.dryRun) {
		console.log(chalk.cyan("\n=== DRY RUN MODE (Multi-Step) ===\n"));

		for (let step = 0; step < instructions.length; step++) {
			const stepConfig = loadConfig(instructions[step]!);
			const stepName = instructions[step]!.stepName || `Step ${step + 1}`;
			console.log(chalk.yellow(`\n--- ${stepName} ---\n`));
			console.log(formatPromptForDisplay(stepConfig));
		}

		console.log(chalk.cyan("\n=== END DRY RUN ===\n"));

		// Show execution details from primary config
		console.log(chalk.dim("Execution settings:"));
		console.log(chalk.dim(`  Steps: ${instructions.length}`));
		console.log(chalk.dim(`  Iterations: ${primaryConfig.iterations}`));
		console.log(chalk.dim(`  Docker: ${primaryConfig.docker}`));
		console.log(chalk.dim(`  Stream: ${primaryConfig.stream}`));
		console.log(chalk.dim(`  Completion marker: ${primaryConfig.completionMarker}`));
		if (primaryConfig.git.multiRepo) {
			console.log(chalk.dim(`  Multi-repo: true`));
		}
		if (primaryConfig.git.branchStrategy !== "none") {
			console.log(chalk.dim(`  Branch strategy: ${primaryConfig.git.branchStrategy}`));
			console.log(chalk.dim(`  Branch prefix: ${primaryConfig.git.branchPrefix}`));
		}
		// Show configured hooks
		const hookEntries = Object.entries(primaryConfig.hooks).filter(([, v]) => v);
		if (hookEntries.length > 0) {
			console.log(chalk.dim("  Hooks:"));
			for (const [name, cmd] of hookEntries) {
				console.log(chalk.dim(`    ${name}: ${cmd}`));
			}
		}
		return { success: true };
	}

	// Validate git state if using branch strategies
	const gitError = await validateGitState(primaryConfig);
	if (gitError) {
		console.error(chalk.red(`Git error: ${gitError}`));
		return { success: false, error: gitError };
	}

	// Initialize branch context (skip for multi-repo workspaces - no root git repo)
	const branchContext = primaryConfig.git.multiRepo
		? { originalBranch: "", workingBranch: null }
		: await initializeBranchContext(primaryConfig, verbose);

	// Determine max iterations from primary config
	const maxIterations =
		primaryConfig.iterations === "infinite" ? Infinity : primaryConfig.iterations;
	const hooks = primaryConfig.hooks;

	// Build hook context for a given state
	const buildHookContext = (
		iteration: number,
		completionMarkerFound: boolean,
		lastExecutionSuccess: boolean,
		stepName?: string,
		stepIndex?: number,
	): HookContext => ({
		iteration,
		maxIterations: primaryConfig.iterations,
		completionMarkerFound,
		lastExecutionSuccess,
		workingDirectory: process.cwd(),
		operation: primaryConfig.operation,
		stepName,
		stepIndex,
		totalSteps: instructions.length,
	});

	const startTime = Date.now();

	console.log(
		chalk.blue(
			`\n🔄 Starting Ralph loop (${primaryConfig.iterations === "infinite" ? "infinite" : primaryConfig.iterations} iterations, ${instructions.length} steps per iteration)`,
		),
	);
	console.log(chalk.dim(`   Completion marker: ${primaryConfig.completionMarker}\n`));

	// Run onLoopStart hook
	await runHook("onLoopStart", hooks, buildHookContext(0, false, true), verbose);

	let completedIterations = 0;

	// Outer loop: iterations
	for (let iteration = 1; iteration <= maxIterations; iteration++) {
		renderIterationBanner(iteration, primaryConfig.iterations);

		// Inner loop: execute each instruction in sequence
		for (let step = 0; step < instructions.length; step++) {
			const stepOptions = instructions[step]!;
			const stepConfig = loadConfig(stepOptions);
			const stepName = stepOptions.stepName || `Step ${step + 1}`;

			console.log(chalk.yellow(`\n--- ${stepName} (${step + 1}/${instructions.length}) ---\n`));

			if (verbose) {
				console.log(chalk.dim(`[DEBUG] Starting ${stepName}...`));
			}

			// Execute single Claude call for this step
			const result = await executeIteration(stepConfig, iteration, verbose);

			if (verbose) {
				console.log(
					chalk.dim(
						`[DEBUG] ${stepName} finished. success=${result.success}, completionMarkerFound=${result.completionMarkerFound}`,
					),
				);
			}

			if (!result.success) {
				console.log(chalk.red(`\n❌ ${stepName} failed: ${result.error}`));
				await runHook(
					"onLoopEnd",
					hooks,
					buildHookContext(iteration, false, false, stepName, step),
					verbose,
				);
				await cleanupBranchContext(primaryConfig, branchContext, verbose);
				printLoopSummary(completedIterations, false, Date.now() - startTime, instructions.length);
				return { success: false, error: result.error };
			}

			// Check completion marker after EACH step - any step can end the loop
			if (result.completionMarkerFound) {
				completedIterations++;
				console.log(
					chalk.green(`\n✅ Completion marker found at ${stepName}! All tasks complete.`),
				);
				await runHook(
					"onLoopEnd",
					hooks,
					buildHookContext(iteration, true, true, stepName, step),
					verbose,
				);
				await cleanupBranchContext(primaryConfig, branchContext, verbose);
				printLoopSummary(completedIterations, true, Date.now() - startTime, instructions.length);
				return { success: true };
			}

			// Run afterInstruction hook (exit 0 = stop loop)
			const instructionHookResult = await runHook(
				"afterInstruction",
				hooks,
				buildHookContext(iteration, false, true, stepName, step),
				verbose,
			);
			if (instructionHookResult.shouldStop) {
				completedIterations++;
				await runHook(
					"onLoopEnd",
					hooks,
					buildHookContext(iteration, false, true, stepName, step),
					verbose,
				);
				await cleanupBranchContext(primaryConfig, branchContext, verbose);
				printLoopSummary(completedIterations, true, Date.now() - startTime, instructions.length);
				return { success: true };
			}
		}

		completedIterations++;

		// Run afterIteration hook (exit 0 = stop loop)
		const iterationHookResult = await runHook(
			"afterIteration",
			hooks,
			buildHookContext(iteration, false, true),
			verbose,
		);
		if (iterationHookResult.shouldStop) {
			await runHook("onLoopEnd", hooks, buildHookContext(iteration, false, true), verbose);
			await cleanupBranchContext(primaryConfig, branchContext, verbose);
			printLoopSummary(completedIterations, true, Date.now() - startTime, instructions.length);
			return { success: true };
		}

		if (iteration < maxIterations) {
			console.log(
				chalk.dim(`\n   Iteration ${iteration} complete. Continuing to next iteration...`),
			);
		}
	}

	console.log(
		chalk.yellow(
			`\n⚠️  Reached maximum iterations (${maxIterations}) without finding completion marker.`,
		),
	);
	await runHook(
		"onLoopEnd",
		hooks,
		buildHookContext(maxIterations === Infinity ? -1 : maxIterations, false, true),
		verbose,
	);
	await cleanupBranchContext(primaryConfig, branchContext, verbose);
	printLoopSummary(completedIterations, false, Date.now() - startTime, instructions.length);
	return { success: true };
}

/**
 * Run the Ralph loop with the given options.
 * This is the main entry point for programmatic use.
 *
 * Supports two modes:
 * - Single instruction: ralph(options) - existing behavior
 * - Multi-step sequential: ralph([options1, options2, ...]) - executes steps in sequence per iteration
 */
export async function ralph(input: RalphInput): Promise<RalphResult> {
	try {
		// Normalize to array
		const instructions = Array.isArray(input) ? input : [input];

		// Single instruction: use existing flow
		if (instructions.length === 1) {
			return runSingleInstruction(instructions[0]!);
		}

		// Multi-step: use sequential flow
		return runSequentialInstructions(instructions);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(chalk.red("Error:"), errorMessage);
		return { success: false, error: errorMessage };
	}
}
