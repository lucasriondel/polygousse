// src/types.ts - TypeScript interfaces for Ralph CLI

export type OperationType = "implement" | "enrich" | "research" | "custom";
export type BranchStrategy = "none" | "per-task" | "single";
export type StepName =
	| "select"
	| "implement"
	| "verify"
	| "update"
	| "commit"
	| "constraints"
	| "completion";

export interface StepConfig {
	skip?: boolean;
	override?: string; // Custom prompt text
	overrideFile?: string; // Path to custom prompt file
}

export interface GitConfig {
	branchStrategy: BranchStrategy;
	branchPrefix: string;
	returnBranch: boolean;
	multiRepo: boolean;
}

export interface RalphConfig {
	operation: OperationType;
	iterations: number | "infinite";
	docker: boolean;
	stream: boolean;
	completionMarker: string;

	// Git
	git: GitConfig;

	// Step configuration
	steps: Record<StepName, StepConfig>;

	// Hooks
	hooks: HooksConfig;
}

export interface Operation {
	name: OperationType;
	getSteps(): StepName[]; // Which steps to include
}

// CLI options as parsed by commander
export interface CLIOptions {
	operation?: OperationType;
	iterations?: string;
	once?: boolean;
	docker?: boolean;
	stream?: boolean;
	config?: string;
	dryRun?: boolean;
	verbose?: boolean;
	// Individual step overrides
	select?: string;
	implement?: string;
	verify?: string;
	update?: string;
	commit?: string;
	constraints?: string;
	completion?: string;
	skipStep?: string[];
	completionMarker?: string;
	branchStrategy?: BranchStrategy;
	branchPrefix?: string;
	returnBranch?: boolean;
	multiRepo?: boolean;
	// Optional step name for logging (unused in CLI, for type compatibility)
	stepName?: string;
	// Hook CLI flags
	onLoopStart?: string;
	afterIteration?: string;
	afterInstruction?: string;
	onLoopEnd?: string;
}

// Programmatic options for library use
export interface RalphOptions {
	operation?: OperationType;
	iterations?: string | number; // Allow number for programmatic use
	once?: boolean;
	docker?: boolean;
	stream?: boolean;
	config?: string;
	dryRun?: boolean;
	verbose?: boolean;
	// Step overrides
	select?: string;
	implement?: string;
	verify?: string;
	update?: string;
	commit?: string;
	constraints?: string;
	completion?: string;
	skipStep?: string[];
	completionMarker?: string;
	branchStrategy?: BranchStrategy;
	branchPrefix?: string;
	returnBranch?: boolean;
	multiRepo?: boolean;
	// Optional step name for logging in multi-step workflows
	stepName?: string;
	// Hooks (individual flags or structured object)
	onLoopStart?: string;
	afterIteration?: string;
	afterInstruction?: string;
	onLoopEnd?: string;
	hooks?: HooksConfig;
}

// Input type for ralph() - supports single instruction or sequential multi-step workflow
export type RalphInput = RalphOptions | RalphOptions[];

// Config file structure (matches .ralphrc.yaml)
export interface ConfigFile {
	operation?: OperationType;
	iterations?: number | "infinite";
	docker?: boolean;
	stream?: boolean;
	completionMarker?: string;
	git?: {
		branchStrategy?: BranchStrategy;
		branchPrefix?: string;
		returnBranch?: boolean;
		multiRepo?: boolean;
	};
	steps?: Partial<Record<StepName, StepConfig>>;
	hooks?: HooksConfig;
}

// Default configuration values
export const DEFAULT_CONFIG: RalphConfig = {
	operation: "implement",
	iterations: "infinite",
	docker: false,
	stream: true,
	completionMarker: "<ralph:done/>",
	git: {
		branchStrategy: "none",
		branchPrefix: "ralph/",
		returnBranch: false,
		multiRepo: false,
	},
	steps: {
		select: {},
		implement: {},
		verify: {},
		update: {},
		commit: {},
		constraints: {},
		completion: {},
	},
	hooks: {},
};

// Hooks configuration
export interface HooksConfig {
	onLoopStart?: string;
	afterIteration?: string;
	afterInstruction?: string;
	onLoopEnd?: string;
}

// Result of executing a hook
export interface HookResult {
	shouldStop: boolean; // true if exit code was 0 (for flow-control hooks)
	exitCode: number;
	error?: string;
}

// Context passed to hooks as RALPH_* environment variables
export interface HookContext {
	iteration: number;
	maxIterations: number | "infinite";
	stepName?: string;
	stepIndex?: number;
	totalSteps?: number;
	completionMarkerFound: boolean;
	lastExecutionSuccess: boolean;
	workingDirectory: string;
	operation: string;
}

// Execution result from Claude
export interface ExecutionResult {
	success: boolean;
	output: string;
	completionMarkerFound: boolean;
	error?: string;
}
