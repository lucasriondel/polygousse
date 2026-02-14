import { type ReactNode, useCallback, useEffect } from "react";
import { useAppSocket } from "@/hooks/use-app-socket";
import { useStore } from "@/store";

export function StoreHydrator({ children }: { children: ReactNode }) {
	const hydrated = useStore((s) => s.hydrated);
	const hydrationError = useStore((s) => s.hydrationError);
	const hydrate = useStore((s) => s.hydrate);

	// Connect the WebSocket (feeds events into the store automatically)
	useAppSocket();

	useEffect(() => {
		hydrate();
	}, [hydrate]);

	const handleRetry = useCallback(() => {
		hydrate();
	}, [hydrate]);

	if (!hydrated) {
		if (hydrationError) {
			return (
				<div className="flex h-screen w-screen items-center justify-center">
					<div className="flex flex-col items-center gap-3">
						<div className="text-destructive text-sm">Failed to connect: {hydrationError}</div>
						<button
							type="button"
							onClick={handleRetry}
							className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm hover:bg-primary/90"
						>
							Retry
						</button>
					</div>
				</div>
			);
		}

		return (
			<div className="flex h-screen w-screen items-center justify-center">
				<div className="text-muted-foreground text-sm">Loading…</div>
			</div>
		);
	}

	return <>{children}</>;
}
