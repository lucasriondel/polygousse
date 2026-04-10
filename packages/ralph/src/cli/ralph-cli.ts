#!/usr/bin/env bun
import { Command } from "commander";
import { ralph } from "../index";
import type { RalphOptions } from "../types";

const program = new Command();

program
	.name("ralph")
	.description("Configurable CLI for the Ralph Wiggum Loop - supercharge your prompts")
	.version("1.0.0")
	.enablePositionalOptions()

	// Core operation modes
	.option("--operation <type>", "Operation type (implement|enrich|research|custom)", "implement")
	.option("--iterations <n>", 'Number of iterations (number or "infinite")', "infinite")
	.option("--once", "Single iteration mode (shorthand for --iterations 1)")

	// Execution environment
	.option("--docker", "Use docker sandbox")
	.option("--stream", "Stream output (default: true)", true)
	.option("--no-stream", "Disable streaming output")

	// Configuration
	.option("--config <file>", "Config file path", ".ralphrc.yaml")
	.option("--dry-run", "Show assembled prompt, don't execute")
	.option("--verbose", "Debug output")

	// Step overrides (in execution order)
	.option("--select <text>", "1. SELECT: Override the task selection step")
	.option("--implement <text>", "2. IMPLEMENT: Override the implementation step")
	.option("--verify <text>", "3. VERIFY: Override the verification step")
	.option("--update <text>", "4. UPDATE: Override the progress update step")
	.option("--commit <text>", "5. COMMIT: Override the commit step")
	.option("--constraints <text>", "6. CONSTRAINTS: Override the constraints step")
	.option("--completion <text>", "7. COMPLETION: Override the completion check step")
	.option(
		"--skip-step <step...>",
		"Skip step(s): select, implement, verify, update, commit, constraints, completion",
	)

	// Completion configuration
	.option("--completion-marker <text>", "Custom completion marker", "<ralph:done/>")

	// Git/branching
	.option("--branch-strategy <type>", "Branch strategy: none|per-task|single", "none")
	.option("--branch-prefix <prefix>", "Branch prefix", "ralph/")
	.option("--return-branch", "Return to original branch after each task")
	.option("--nested-repos", "Nested-repos workspace: commit in each sub-directory's git repo separately")

	// Lifecycle hooks
	.option("--on-loop-start <cmd>", "Shell command to run before the loop starts")
	.option("--after-iteration <cmd>", "Shell command after each iteration (exit 0 = stop loop)")
	.option(
		"--after-instruction <cmd>",
		"Shell command after each step in multi-step mode (exit 0 = stop loop)",
	)
	.option("--on-loop-end <cmd>", "Shell command to run after the loop ends")

	.action(async () => {
		const options = program.opts<RalphOptions>();
		const result = await ralph(options);
		if (!result.success) {
			process.exit(1);
		}
	});

program.parse();
