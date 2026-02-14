import type { LinearTaskLink } from "../types";

export interface LinearSlice {
	linearTaskLinks: Map<number, LinearTaskLink>;
}

export const createLinearSlice = (): LinearSlice => ({
	linearTaskLinks: new Map(),
});
