import { Link, useSearch } from "@tanstack/react-router";
import {
	AlertCircle,
	ArrowLeft,
	Bot,
	ChevronDown,
	Eye,
	EyeOff,
	GitBranch,
	User,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptContentBlock, TranscriptEntry } from "@polygousse/types";
import { wsRequest } from "@/lib/ws-client";
import { cn } from "@/lib/utils";

type ContentBlock = TranscriptContentBlock;

// ── Tool color mapping ────────────────────────────────────────────────

const TOOL_COLORS: Record<string, { bg: string; text: string }> = {
	Read: { bg: "bg-blue-500/15", text: "text-blue-400" },
	Write: { bg: "bg-amber-500/15", text: "text-amber-400" },
	Edit: { bg: "bg-orange-500/15", text: "text-orange-400" },
	Bash: { bg: "bg-green-500/15", text: "text-green-400" },
	Glob: { bg: "bg-cyan-500/15", text: "text-cyan-400" },
	Grep: { bg: "bg-teal-500/15", text: "text-teal-400" },
	Task: { bg: "bg-violet-500/15", text: "text-violet-400" },
	WebFetch: { bg: "bg-pink-500/15", text: "text-pink-400" },
	WebSearch: { bg: "bg-rose-500/15", text: "text-rose-400" },
	TodoWrite: { bg: "bg-indigo-500/15", text: "text-indigo-400" },
	EnterPlanMode: { bg: "bg-purple-500/15", text: "text-purple-400" },
	ExitPlanMode: { bg: "bg-purple-500/15", text: "text-purple-400" },
	AskUserQuestion: { bg: "bg-yellow-500/15", text: "text-yellow-400" },
};

function getToolColors(name: string) {
	return TOOL_COLORS[name] ?? { bg: "bg-zinc-500/15", text: "text-zinc-400" };
}

// ── Collapsible panel ─────────────────────────────────────────────────

function CollapsiblePanel({
	label,
	badge,
	badgeColors,
	children,
	defaultOpen = false,
}: {
	label: string;
	badge?: string;
	badgeColors?: { bg: string; text: string };
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="rounded-md border border-border overflow-hidden">
			<button
				type="button"
				className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors cursor-pointer"
				onClick={() => setOpen(!open)}
			>
				<ChevronDown
					className={cn(
						"size-3.5 text-muted-foreground transition-transform shrink-0",
						!open && "-rotate-90",
					)}
				/>
				{badge && badgeColors && (
					<span
						className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeColors.bg} ${badgeColors.text}`}
					>
						{badge}
					</span>
				)}
				<span className="text-muted-foreground truncate">{label}</span>
			</button>
			{open && (
				<div className="border-t border-border">
					<pre className="p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all bg-muted/30">
						{children}
					</pre>
				</div>
			)}
		</div>
	);
}

// ── Message renderers ─────────────────────────────────────────────────

function TextContent({ text }: { text: string }) {
	return <div className="whitespace-pre-wrap text-sm">{text}</div>;
}

function ToolUseBlock({ block }: { block: ContentBlock }) {
	const colors = getToolColors(block.name ?? "");
	const inputStr =
		typeof block.input === "string" ? block.input : JSON.stringify(block.input, null, 2);

	return (
		<CollapsiblePanel
			label={block.id?.slice(0, 12) ?? "tool call"}
			badge={block.name}
			badgeColors={colors}
		>
			{inputStr}
		</CollapsiblePanel>
	);
}

function ToolResultBlock({ block }: { block: ContentBlock }) {
	const content = block.content;
	let text: string;
	if (typeof content === "string") {
		text = content;
	} else if (Array.isArray(content)) {
		text = content
			.map((c) => (typeof c === "string" ? c : (c.text ?? JSON.stringify(c))))
			.join("\n");
	} else {
		text = JSON.stringify(content, null, 2);
	}

	// Truncate very long tool results
	const truncated = text.length > 5000;
	const displayText = truncated ? text.slice(0, 5000) : text;

	return (
		<CollapsiblePanel label={`Result for ${block.tool_use_id?.slice(0, 12) ?? "?"}`}>
			{displayText}
			{truncated && (
				<span className="text-muted-foreground italic">
					{"\n"}... truncated ({text.length.toLocaleString()} chars)
				</span>
			)}
		</CollapsiblePanel>
	);
}

function AssistantMessage({ entry }: { entry: TranscriptEntry }) {
	const content = entry.message?.content;
	if (!content) return null;

	const blocks = typeof content === "string" ? [{ type: "text", text: content }] : content;

	return (
		<div className="flex gap-3 py-3">
			<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
				<Bot className="size-4" />
			</div>
			<div className="flex flex-col gap-2 min-w-0 flex-1">
				{blocks.map((block, i) => {
					if (block.type === "text" && block.text) {
						return <TextContent key={block.id ?? `text-${i}`} text={block.text} />;
					}
					if (block.type === "tool_use") {
						return <ToolUseBlock key={block.id ?? `tool-${i}`} block={block} />;
					}
					return null;
				})}
			</div>
		</div>
	);
}

function UserMessage({ entry }: { entry: TranscriptEntry }) {
	const content = entry.message?.content;
	if (!content) return null;

	const blocks = typeof content === "string" ? [{ type: "text", text: content }] : content;

	const hasText = blocks.some((b) => b.type === "text" && b.text);
	const toolResults = blocks.filter((b) => b.type === "tool_result");

	return (
		<div className="flex gap-3 py-3">
			<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
				<User className="size-4" />
			</div>
			<div className="flex flex-col gap-2 min-w-0 flex-1">
				{hasText && (
					<div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-3">
						{blocks.map((block, i) =>
							block.type === "text" && block.text ? (
								<TextContent key={block.id ?? `text-${i}`} text={block.text} />
							) : null,
						)}
					</div>
				)}
				{toolResults.map((block, i) => (
					<ToolResultBlock key={block.tool_use_id ?? `result-${i}`} block={block} />
				))}
			</div>
		</div>
	);
}

function ProgressEntry({ entry }: { entry: TranscriptEntry }) {
	const data = entry.data;
	if (!data) return null;

	if (data.type === "hook_progress") {
		return (
			<div className="flex items-center gap-2 py-1 px-10">
				<Zap className="size-3 text-muted-foreground/50" />
				<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-zinc-500/10 text-zinc-500">
					{data.hookEvent}
				</span>
				{data.hookName && (
					<span className="text-[10px] text-muted-foreground/50 truncate">{data.hookName}</span>
				)}
			</div>
		);
	}

	if (data.type === "agent_progress") {
		return (
			<div className="flex items-center gap-2 py-1 px-10">
				<GitBranch className="size-3 text-violet-400/50" />
				<span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-violet-500/10 text-violet-400">
					subagent
				</span>
				{data.agentId && (
					<span className="text-[10px] text-muted-foreground/50 font-mono">
						{data.agentId.slice(0, 10)}
					</span>
				)}
				{data.prompt && (
					<span className="text-[10px] text-muted-foreground/50 truncate max-w-md">
						{data.prompt.slice(0, 80)}
						{data.prompt.length > 80 ? "..." : ""}
					</span>
				)}
			</div>
		);
	}

	return null;
}

// ── Main page ─────────────────────────────────────────────────────────

export function TranscriptPage({ sessionId }: { sessionId: string }) {
	const search = useSearch({ strict: false }) as { cwd?: string };
	const cwd = search.cwd ?? "";

	const [entries, setEntries] = useState<TranscriptEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [showProgress, setShowProgress] = useState(false);
	const [showSidechain, setShowSidechain] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	const fetchTranscript = useCallback(async () => {
		try {
			const data = await wsRequest("transcript:get", { sessionId, cwd });
			setEntries(data);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load transcript");
		} finally {
			setLoading(false);
		}
	}, [sessionId, cwd]);

	useEffect(() => {
		fetchTranscript();
	}, [fetchTranscript]);

	const filtered = useMemo(() => {
		return entries.filter((e) => {
			if (!showProgress && e.type === "progress") return false;
			if (!showSidechain && e.isSidechain) return false;
			return true;
		});
	}, [entries, showProgress, showSidechain]);

	const stats = useMemo(() => {
		let user = 0;
		let assistant = 0;
		let progress = 0;
		for (const e of entries) {
			if (e.type === "user") user++;
			else if (e.type === "assistant") assistant++;
			else if (e.type === "progress") progress++;
		}
		return { user, assistant, progress };
	}, [entries]);

	if (loading) {
		return (
			<div className="mx-auto max-w-2xl px-4 py-16 text-center">
				<p className="text-muted-foreground">Loading transcript...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-[calc(100vh-3rem)] flex-col items-center justify-center text-center">
				<AlertCircle className="h-12 w-12 text-red-400/50" />
				<h2 className="mt-4 text-lg font-semibold">Transcript not found</h2>
				<p className="mt-1 text-sm text-muted-foreground">{error}</p>
				<Link
					to="/"
					className="mt-4 text-sm text-blue-400 hover:text-blue-300 transition-colors"
				>
					Back to Home
				</Link>
			</div>
		);
	}

	return (
		<div className="flex h-[calc(100vh-3rem)] flex-col">
			{/* Toolbar */}
			<div className="flex items-center gap-3 border-b border-border px-5 py-2">
				<Link
					to="/"
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="size-3.5" />
					Sessions
				</Link>

				<div className="h-4 w-px bg-border" />

				<span className="font-mono text-xs text-muted-foreground">{sessionId.slice(0, 8)}</span>

				<span className="text-xs text-muted-foreground">
					{stats.user} user · {stats.assistant} assistant · {stats.progress} progress
				</span>

				<div className="ml-auto flex items-center gap-2">
					<button
						type="button"
						onClick={() => setShowProgress(!showProgress)}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
							showProgress
								? "bg-zinc-500/15 text-zinc-300"
								: "text-muted-foreground/40 hover:text-muted-foreground",
						)}
					>
						{showProgress ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
						Progress
					</button>
					<button
						type="button"
						onClick={() => setShowSidechain(!showSidechain)}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
							showSidechain
								? "bg-violet-500/15 text-violet-300"
								: "text-muted-foreground/40 hover:text-muted-foreground",
						)}
					>
						{showSidechain ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
						Sidechain
					</button>
				</div>
			</div>

			{/* Chat area */}
			<div ref={scrollRef} className="flex-1 overflow-y-auto">
				<div className="mx-auto max-w-4xl px-5 py-4 flex flex-col divide-y divide-border/50">
					{filtered.map((entry, i) => {
						if (entry.type === "assistant") {
							return <AssistantMessage key={entry.uuid ?? i} entry={entry} />;
						}
						if (entry.type === "user") {
							return <UserMessage key={entry.uuid ?? i} entry={entry} />;
						}
						if (entry.type === "progress") {
							return <ProgressEntry key={entry.uuid ?? i} entry={entry} />;
						}
						return null;
					})}
				</div>
			</div>
		</div>
	);
}
