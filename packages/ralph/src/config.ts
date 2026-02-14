// src/config.ts - Config loading & CLI arg merging
import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type {
	CLIOptions,
	ConfigFile,
	RalphConfig,
	RalphOptions,
	StepConfig,
	StepName,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

const STEP_NAMES: StepName[] = [
	"select",
	"implement",
	"verify",
	"update",
	"commit",
	"constraints",
	"completion",
];

/**
 * Load config file from disk
 */
export function loadConfigFile(configPath: string): ConfigFile | null {
	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		return parseYaml(content) as ConfigFile;
	} catch (error) {
		throw new Error(`Failed to parse config file ${configPath}: ${error}`);
	}
}

/**
 * Read file contents, throwing a helpful error if file doesn't exist
 */
export function readFileContents(filePath: string, description: string): string {
	if (!existsSync(filePath)) {
		throw new Error(`${description} file not found: ${filePath}`);
	}
	return readFileSync(filePath, "utf-8");
}

/**
 * Merge config file settings into the default config
 */
function mergeConfigFile(config: RalphConfig, fileConfig: ConfigFile): RalphConfig {
	const merged = { ...config };

	// Top-level settings
	if (fileConfig.operation !== undefined) merged.operation = fileConfig.operation;
	if (fileConfig.iterations !== undefined) merged.iterations = fileConfig.iterations;
	if (fileConfig.docker !== undefined) merged.docker = fileConfig.docker;
	if (fileConfig.stream !== undefined) merged.stream = fileConfig.stream;
	if (fileConfig.completionMarker !== undefined)
		merged.completionMarker = fileConfig.completionMarker;

	// Git settings
	if (fileConfig.git) {
		merged.git = { ...merged.git };
		if (fileConfig.git.branchStrategy !== undefined)
			merged.git.branchStrategy = fileConfig.git.branchStrategy;
		if (fileConfig.git.branchPrefix !== undefined)
			merged.git.branchPrefix = fileConfig.git.branchPrefix;
		if (fileConfig.git.returnBranch !== undefined)
			merged.git.returnBranch = fileConfig.git.returnBranch;
	}

	// Hooks from config file
	if (fileConfig.hooks) {
		merged.hooks = { ...merged.hooks, ...fileConfig.hooks };
	}

	// Step overrides from config file
	if (fileConfig.steps) {
		merged.steps = { ...merged.steps };
		for (const [stepName, stepConfig] of Object.entries(fileConfig.steps)) {
			if (stepConfig) {
				merged.steps[stepName as StepName] = {
					...merged.steps[stepName as StepName],
					...stepConfig,
				};
			}
		}
	}

	return merged;
}

/**
 * Merge CLI/programmatic options into config (options take precedence)
 */
function mergeOptions(config: RalphConfig, options: CLIOptions | RalphOptions): RalphConfig {
	const merged = { ...config };

	// Handle --once shorthand
	if (options.once) {
		merged.iterations = 1;
	} else if (options.iterations !== undefined) {
		if (typeof options.iterations === "number") {
			merged.iterations = options.iterations;
		} else {
			merged.iterations =
				options.iterations === "infinite" ? "infinite" : parseInt(options.iterations, 10);
		}
	}

	// Top-level options
	if (options.operation !== undefined) merged.operation = options.operation;
	if (options.docker !== undefined) merged.docker = options.docker;
	if (options.stream !== undefined) merged.stream = options.stream;
	if (options.completionMarker !== undefined) merged.completionMarker = options.completionMarker;

	// Git settings
	merged.git = { ...merged.git };
	if (options.branchStrategy !== undefined) merged.git.branchStrategy = options.branchStrategy;
	if (options.branchPrefix !== undefined) merged.git.branchPrefix = options.branchPrefix;
	if (options.returnBranch !== undefined) merged.git.returnBranch = options.returnBranch;

	// Step overrides (individual --select, --implement, etc.)
	merged.steps = { ...merged.steps };
	for (const stepName of STEP_NAMES) {
		const override = (options as Record<string, unknown>)[stepName] as string | undefined;
		if (override !== undefined) {
			merged.steps[stepName] = { ...merged.steps[stepName], override };
		}
	}

	// Skip steps
	if (options.skipStep && options.skipStep.length > 0) {
		merged.steps = { ...merged.steps };
		for (const stepName of options.skipStep) {
			if (!STEP_NAMES.includes(stepName as StepName)) {
				throw new Error(
					`Invalid step name: ${stepName}. Valid steps are: ${STEP_NAMES.join(", ")}`,
				);
			}
			merged.steps[stepName as StepName] = { ...merged.steps[stepName as StepName], skip: true };
		}
	}

	// Hooks: structured hooks object first, then individual CLI flags override
	if ("hooks" in options && (options as RalphOptions).hooks) {
		merged.hooks = { ...merged.hooks, ...(options as RalphOptions).hooks };
	}
	if (options.onLoopStart !== undefined)
		merged.hooks = { ...merged.hooks, onLoopStart: options.onLoopStart };
	if (options.afterIteration !== undefined)
		merged.hooks = { ...merged.hooks, afterIteration: options.afterIteration };
	if (options.afterInstruction !== undefined)
		merged.hooks = { ...merged.hooks, afterInstruction: options.afterInstruction };
	if (options.onLoopEnd !== undefined)
		merged.hooks = { ...merged.hooks, onLoopEnd: options.onLoopEnd };

	return merged;
}

/**
 * Load and merge configuration from all sources
 * Priority: Options > Config file > Defaults
 */
export function loadConfig(options: CLIOptions | RalphOptions): RalphConfig {
	// Start with defaults
	let config: RalphConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

	// Load config file if it exists
	const configPath = options.config || ".ralphrc.yaml";
	const fileConfig = loadConfigFile(configPath);
	if (fileConfig) {
		config = mergeConfigFile(config, fileConfig);
	}

	// Merge options (highest priority)
	config = mergeOptions(config, options);

	return config;
}

/**
 * Validate the final configuration
 */
export function validateConfig(config: RalphConfig): void {
	// Validate iterations
	if (typeof config.iterations === "number" && config.iterations < 1) {
		throw new Error("Iterations must be at least 1");
	}

	// Validate operation type
	const validOperations = ["implement", "enrich", "research", "custom"];
	if (!validOperations.includes(config.operation)) {
		throw new Error(
			`Invalid operation type: ${config.operation}. Valid types are: ${validOperations.join(", ")}`,
		);
	}

	// Validate branch strategy
	const validStrategies = ["none", "per-task", "single"];
	if (!validStrategies.includes(config.git.branchStrategy)) {
		throw new Error(
			`Invalid branch strategy: ${config.git.branchStrategy}. Valid strategies are: ${validStrategies.join(", ")}`,
		);
	}
}

/**
 * Get a step's configuration, resolving file contents if needed
 */
export function resolveStepConfig(stepName: StepName, config: RalphConfig): StepConfig {
	const stepConfig = config.steps[stepName];

	if (stepConfig.overrideFile && !stepConfig.override) {
		// Load override from file
		const content = readFileContents(stepConfig.overrideFile, `Step override for ${stepName}`);
		return { ...stepConfig, override: content };
	}

	return stepConfig;
}
