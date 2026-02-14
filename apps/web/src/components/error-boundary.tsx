import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("ErrorBoundary caught:", error, info.componentStack);
	}

	render() {
		if (this.state.error) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="flex h-screen w-screen items-center justify-center">
					<div className="flex max-w-md flex-col items-center gap-3 px-4 text-center">
						<div className="text-destructive font-medium">Something went wrong</div>
						<pre className="max-h-40 w-full overflow-auto rounded-md bg-muted p-3 text-left text-muted-foreground text-xs">
							{this.state.error.message}
						</pre>
						<button
							type="button"
							onClick={() => {
								this.setState({ error: null });
							}}
							className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm hover:bg-primary/90"
						>
							Try again
						</button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
