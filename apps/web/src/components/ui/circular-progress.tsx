import { cn } from "@/lib/utils";

const SIZE = 36;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getColorClass(value: number) {
	if (value >= 90) return "text-red-500";
	if (value >= 70) return "text-amber-500";
	return "text-blue-500";
}

function CircularProgress({
	value,
	label,
	className,
	...props
}: {
	value: number;
	label?: string;
} & Omit<React.ComponentProps<"div">, "children">) {
	const clamped = Math.max(0, Math.min(100, value));
	const offset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

	return (
		<div
			data-slot="circular-progress"
			className={cn("flex flex-col items-center gap-0.5", className)}
			{...props}
		>
			<svg
				width={SIZE}
				height={SIZE}
				viewBox={`0 0 ${SIZE} ${SIZE}`}
				className="block -rotate-90"
			>
				<circle
					cx={SIZE / 2}
					cy={SIZE / 2}
					r={RADIUS}
					fill="none"
					strokeWidth={STROKE}
					className="stroke-muted"
				/>
				<circle
					cx={SIZE / 2}
					cy={SIZE / 2}
					r={RADIUS}
					fill="none"
					strokeWidth={STROKE}
					strokeLinecap="round"
					strokeDasharray={CIRCUMFERENCE}
					strokeDashoffset={offset}
					className={cn(
						"transition-[stroke-dashoffset] duration-800 ease-in-out",
						getColorClass(clamped),
					)}
					style={{ stroke: "currentColor" }}
				/>
			</svg>
			<span
				className={cn(
					"text-[10px] font-medium leading-none",
					getColorClass(clamped),
				)}
			>
				{clamped}%
			</span>
			{label && (
				<span className="text-muted-foreground text-[9px] leading-none">
					{label}
				</span>
			)}
		</div>
	);
}

export { CircularProgress };
