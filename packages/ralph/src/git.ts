// src/git.ts - Git branch management for Ralph CLI

import chalk from "chalk";
import { execa } from "execa";
import type { RalphConfig } from "./types";

export interface BranchContext {
	originalBranch: string;
	workingBranch: string | null;
}

/**
 * Get the current git branch name
 */
export async function getCurrentBranch(): Promise<string> {
	const { stdout } = await execa("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
	return stdout.trim();
}

/**
 * Check if we're in a git repository
 */
export async function isGitRepo(): Promise<boolean> {
	try {
		await execa("git", ["rev-parse", "--git-dir"]);
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(): Promise<boolean> {
	const { stdout } = await execa("git", ["status", "--porcelain"]);
	return stdout.trim().length > 0;
}

/**
 * Create and checkout a new branch
 */
export async function createBranch(branchName: string): Promise<void> {
	await execa("git", ["checkout", "-b", branchName]);
}

/**
 * Checkout an existing branch
 */
export async function checkoutBranch(branchName: string): Promise<void> {
	await execa("git", ["checkout", branchName]);
}

/**
 * Check if a branch exists
 */
export async function branchExists(branchName: string): Promise<boolean> {
	try {
		await execa("git", ["rev-parse", "--verify", branchName]);
		return true;
	} catch {
		return false;
	}
}

/**
 * Generate a branch name for a task
 */
export function generateBranchName(prefix: string, iteration: number): string {
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	return `${prefix}task-${iteration}-${timestamp}`;
}

/**
 * Initialize branch context at the start of the loop
 * For 'single' strategy, creates one branch for all iterations
 * For 'per-task' strategy, just records the original branch
 * For 'none' strategy, does nothing
 */
export async function initializeBranchContext(
	config: RalphConfig,
	verbose: boolean = false,
): Promise<BranchContext> {
	const { branchStrategy, branchPrefix } = config.git;

	if (branchStrategy === "none") {
		// No branch management needed — don't require a git repo
		let originalBranch = "";
		try {
			originalBranch = await getCurrentBranch();
		} catch {
			// Not in a git repo, that's fine for "none" strategy
		}
		return {
			originalBranch,
			workingBranch: null,
		};
	}

	const originalBranch = await getCurrentBranch();

	if (branchStrategy === "single") {
		// Create a single branch for all iterations
		const branchName = `${branchPrefix}session-${Date.now()}`;

		if (verbose) {
			console.log(chalk.blue(`Creating branch: ${branchName}`));
		}

		await createBranch(branchName);

		return {
			originalBranch,
			workingBranch: branchName,
		};
	}

	// per-task: branch will be created per iteration
	return {
		originalBranch,
		workingBranch: null,
	};
}

/**
 * Setup branch for a specific iteration
 * For 'per-task' strategy, creates a new branch
 * For other strategies, does nothing (already handled)
 */
export async function setupIterationBranch(
	config: RalphConfig,
	context: BranchContext,
	iteration: number,
	verbose: boolean = false,
): Promise<string | null> {
	const { branchStrategy, branchPrefix, returnBranch } = config.git;

	if (branchStrategy !== "per-task") {
		return context.workingBranch;
	}

	// If returnBranch is true and we're not on the original branch, go back first
	if (returnBranch && iteration > 1) {
		const currentBranch = await getCurrentBranch();
		if (currentBranch !== context.originalBranch) {
			if (verbose) {
				console.log(chalk.blue(`Returning to branch: ${context.originalBranch}`));
			}
			await checkoutBranch(context.originalBranch);
		}
	}

	// Create a new branch for this task
	const branchName = generateBranchName(branchPrefix, iteration);

	if (verbose) {
		console.log(chalk.blue(`Creating branch for task ${iteration}: ${branchName}`));
	}

	await createBranch(branchName);

	return branchName;
}

/**
 * Cleanup branch context after loop completes
 * If returnBranch is true, returns to the original branch
 */
export async function cleanupBranchContext(
	config: RalphConfig,
	context: BranchContext,
	verbose: boolean = false,
): Promise<void> {
	const { branchStrategy, returnBranch } = config.git;

	if (branchStrategy === "none") {
		return;
	}

	if (returnBranch) {
		const currentBranch = await getCurrentBranch();
		if (currentBranch !== context.originalBranch) {
			if (verbose) {
				console.log(chalk.blue(`Returning to original branch: ${context.originalBranch}`));
			}
			await checkoutBranch(context.originalBranch);
		}
	}
}

/**
 * Validate git state before starting
 * Returns error message if validation fails, null if OK
 */
export async function validateGitState(config: RalphConfig): Promise<string | null> {
	const { branchStrategy, multiRepo } = config.git;

	if (branchStrategy === "none") {
		return null;
	}

	// Multi-repo workspaces don't have a git repo at root - branch strategies aren't supported
	if (multiRepo) {
		return "Branch strategies are not supported with --multi-repo. Use --branch-strategy none.";
	}

	// Check if we're in a git repo
	if (!(await isGitRepo())) {
		return "Not in a git repository. Use --branch-strategy none or run from a git repo.";
	}

	// Check for uncommitted changes (could cause issues when switching branches)
	if (await hasUncommittedChanges()) {
		return "Uncommitted changes detected. Please commit or stash changes before using branch strategies.";
	}

	return null;
}
