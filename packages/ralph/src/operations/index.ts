// src/operations/index.ts - Operation definitions for Ralph CLI

import type { Operation, OperationType, StepName } from "../types";

/**
 * Base class for operations that defines the interface
 */
abstract class BaseOperation implements Operation {
	abstract name: OperationType;
	abstract getSteps(): StepName[];
}

/**
 * Implement operation - the standard Ralph loop
 * Includes all steps: select, implement, verify, update, commit, constraints, completion
 */
class ImplementOperation extends BaseOperation {
	name: OperationType = "implement";

	getSteps(): StepName[] {
		return ["select", "implement", "verify", "update", "commit", "constraints", "completion"];
	}
}

/**
 * Enrich operation - for enriching/updating data without running tests
 * Skips verify and commit steps by default
 */
class EnrichOperation extends BaseOperation {
	name: OperationType = "enrich";

	getSteps(): StepName[] {
		return ["select", "implement", "update", "constraints", "completion"];
	}
}

/**
 * Research operation - read-only exploration and analysis
 * No commits, no updates - just research and report
 */
class ResearchOperation extends BaseOperation {
	name: OperationType = "research";

	getSteps(): StepName[] {
		return ["select", "implement", "constraints", "completion"];
	}
}

/**
 * Custom operation - uses all steps, user customizes via --skip-step
 * Same as implement but intended for user-defined workflows
 */
class CustomOperation extends BaseOperation {
	name: OperationType = "custom";

	getSteps(): StepName[] {
		return ["select", "implement", "verify", "update", "commit", "constraints", "completion"];
	}
}

// Operation instances
const operations: Record<OperationType, Operation> = {
	implement: new ImplementOperation(),
	enrich: new EnrichOperation(),
	research: new ResearchOperation(),
	custom: new CustomOperation(),
};

/**
 * Get an operation by type
 */
export function getOperation(type: OperationType): Operation {
	return operations[type];
}

/**
 * Get the steps for an operation type
 */
export function getStepsForOperation(type: OperationType): StepName[] {
	return getOperation(type).getSteps();
}

/**
 * Get all available operation types
 */
export function getAvailableOperations(): OperationType[] {
	return Object.keys(operations) as OperationType[];
}

// Export the operation classes for extension
export { BaseOperation, ImplementOperation, EnrichOperation, ResearchOperation, CustomOperation };
