/**
 * Equality function for Zustand selectors that return arrays of objects.
 *
 * Compares two arrays by length, then does a shallow comparison of each
 * element's own enumerable properties. This prevents infinite re-renders
 * when selectors create new object references from the same underlying data.
 */
export function shallowArrayEqual<T>(
	a: T[] | null | undefined,
	b: T[] | null | undefined,
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	if (a.length !== b.length) return false;

	for (let i = 0; i < a.length; i++) {
		if (!shallowEqual(a[i], b[i])) return false;
	}

	return true;
}

function shallowEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
		return false;
	}

	const keysA = Object.keys(a);
	const keysB = Object.keys(b);

	if (keysA.length !== keysB.length) return false;

	for (const key of keysA) {
		if (
			!Object.hasOwn(b, key) ||
			!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
		) {
			return false;
		}
	}

	return true;
}
