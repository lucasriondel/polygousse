// src/prompts.ts - Prompt assembly for Ralph CLI

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveStepConfig } from "./config";
import { getStepsForOperation } from "./operations";
import type { RalphConfig, StepName } from "./types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "..", "prompts");

// Default prompts for each step (fallback if template files are missing)
const DEFAULT_PROMPTS: Record<StepName, string> = {
	select: "@PRD.md @progress.txt Find the highest-priority incomplete task.",
	implement: "Implement the task.",
	verify: "Run your tests and type checks.",
	update: "Update the PRD with what was done.\nAppend your progress to progress.txt.",
	commit: "Commit your changes.",
	constraints: "ONLY WORK ON A SINGLE TASK.",
	completion: "If the PRD is complete, output {{COMPLETION_MARKER}}.",
};

/**
 * Load a step's default prompt from the prompts/ directory
 */
function loadStepPrompt(stepName: StepName): string {
	const promptPath = join(PROMPTS_DIR, `${stepName}.txt`);

	if (existsSync(promptPath)) {
		return readFileSync(promptPath, "utf-8").trim();
	}

	return DEFAULT_PROMPTS[stepName];
}

/**
 * Get the effective prompt text for a step, considering overrides and skips
 */
function getStepPrompt(stepName: StepName, config: RalphConfig): string | null {
	const stepConfig = resolveStepConfig(stepName, config);

	// Skip this step if configured to skip
	if (stepConfig.skip) {
		return null;
	}

	// Use override if provided, otherwise load default prompt
	let prompt = stepConfig.override ?? loadStepPrompt(stepName);

	// Replace completion marker placeholder (applies to both default and overrides)
	prompt = prompt.replace("{{COMPLETION_MARKER}}", config.completionMarker);

	return prompt;
}

/**
 * Build the step instructions portion of the prompt
 */
function buildStepsSection(config: RalphConfig): string {
	const steps = getStepsForOperation(config.operation);
	const instructions: string[] = [];
	let stepNumber = 1;

	for (const stepName of steps) {
		const prompt = getStepPrompt(stepName, config);
		if (prompt !== null) {
			const stepLabel = stepName.toUpperCase();
			instructions.push(`${stepNumber}. ${stepLabel}: ${prompt}`);
			stepNumber++;
		}
	}

	return instructions.join("\n");
}

/**
 * Assemble the complete prompt from all components
 */
export function assemblePrompt(config: RalphConfig): string {
	return buildStepsSection(config);
}

/**
 * Get the system prompt if configured (reserved for future use)
 */
export function getSystemPrompt(_config: RalphConfig): string | null {
	return null;
}

/**
 * Build the complete Claude command arguments
 */
export function buildClaudeArgs(config: RalphConfig): string[] {
	const args: string[] = [];

	// Add system prompt if provided
	const systemPrompt = getSystemPrompt(config);
	if (systemPrompt) {
		args.push("--system", systemPrompt);
	}

	// Add streaming flag for Claude CLI (enables streaming output mode)
	// Note: --verbose is required when using stream-json with -p (print mode)
	// --include-partial-messages enables real-time text deltas instead of waiting for complete messages
	if (config.stream) {
		args.push("--output-format", "stream-json", "--verbose", "--include-partial-messages");
	}

	// Skip permission prompts for non-interactive execution
	args.push("--dangerously-skip-permissions");

	// Add the assembled prompt
	args.push("-p", assemblePrompt(config));

	return args;
}

/**
 * Format the prompt for display (dry-run mode)
 */
export function formatPromptForDisplay(config: RalphConfig): string {
	const lines: string[] = [];

	const systemPrompt = getSystemPrompt(config);
	if (systemPrompt) {
		lines.push("=== SYSTEM PROMPT ===");
		lines.push(systemPrompt);
		lines.push("");
	}

	lines.push("=== USER PROMPT ===");
	lines.push(assemblePrompt(config));

	return lines.join("\n");
}
