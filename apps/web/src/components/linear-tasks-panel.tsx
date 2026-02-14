import { Check, ExternalLink, Import, Loader2, Paperclip, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RunTaskDialog } from "@/components/run-task-dialog";
import { Button } from "@/components/ui/button";
import type { Workspace } from "@/hooks/use-workspaces";
import { wsRequest } from "@/lib/ws-client";
import { useStore } from "@/store";
import type { LinearIssue } from "@/store/types";

interface LinearTasksPanelProps {
	workspace: Workspace;
}

const stateColors: Record<string, string> = {
	started: "bg-amber-500/20 text-amber-400",
	unstarted: "bg-zinc-500/20 text-zinc-400",
	backlog: "bg-zinc-500/20 text-zinc-400",
	triage: "bg-blue-500/20 text-blue-400",
	completed: "bg-emerald-500/20 text-emerald-400",
};

const stateOrder: Record<string, number> = {
	started: 0,
	unstarted: 1,
	backlog: 2,
	triage: 3,
	completed: 4,
};

export function LinearTasksPanel({ workspace }: LinearTasksPanelProps) {
	const [issues, setIssues] = useState<LinearIssue[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);
	const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
	const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
	const linearTaskLinks = useStore((s) => s.linearTaskLinks);

	const linkedIssueIds = new Set(
		Array.from(linearTaskLinks.values()).map((l) => l.linear_issue_id),
	);

	const projectIdsParam = useMemo(() => {
		if (!workspace.linear_project_ids) return "";
		try {
			const ids = JSON.parse(workspace.linear_project_ids) as string[];
			return ids.length > 0 ? ids.join(",") : "";
		} catch {
			return "";
		}
	}, [workspace.linear_project_ids]);

	const fetchIssues = useCallback(() => {
		if (!workspace.linear_team_id) return;
		setLoading(true);
		setError(null);
		wsRequest("linear:team-issues", {
			teamId: workspace.linear_team_id,
			projectIds: projectIdsParam || undefined,
		})
			.then(setIssues)
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load issues"))
			.finally(() => setLoading(false));
	}, [workspace.linear_team_id, projectIdsParam]);

	useEffect(() => {
		fetchIssues();
	}, [fetchIssues]);

	const handleRunLinearIssue = async (
		issue: { id: string; identifier: string; title: string; teamId: string },
		options: {
			permissionMode?: string;
			planMode?: boolean;
			worktreePath?: string;
			ralphMode?: boolean;
			maxIterations?: number;
		},
	) => {
		await wsRequest("linear:create-and-start", {
			issueId: issue.id,
			issueIdentifier: issue.identifier,
			issueTitle: issue.title,
			teamId: issue.teamId,
			workspaceId: workspace.id,
			permissionMode: options.permissionMode,
			planMode: options.planMode,
			worktreePath: options.worktreePath,
			ralphMode: options.ralphMode,
			maxIterations: options.maxIterations,
		});
	};

	const handleImportLinearIssue = async (issue: LinearIssue) => {
		if (!workspace.linear_team_id) return;
		setImportingIds((prev) => new Set(prev).add(issue.id));
		try {
			await wsRequest("linear:import", {
				issueId: issue.id,
				issueIdentifier: issue.identifier,
				issueTitle: issue.title,
				teamId: workspace.linear_team_id,
				workspaceId: workspace.id,
			});
			setImportedIds((prev) => new Set(prev).add(issue.id));
		} finally {
			setImportingIds((prev) => {
				const next = new Set(prev);
				next.delete(issue.id);
				return next;
			});
		}
	};

	const sortedIssues = useMemo(
		() => [...issues].sort((a, b) => (stateOrder[a.state.type] ?? 99) - (stateOrder[b.state.type] ?? 99)),
		[issues],
	);

	if (loading) {
		return <div className="py-4 text-sm text-muted-foreground">Loading issues...</div>;
	}

	if (error) {
		return (
			<div className="py-4 text-sm text-red-400">
				{error}
				<button type="button" className="ml-2 text-amber-500 hover:underline" onClick={fetchIssues}>
					Retry
				</button>
			</div>
		);
	}

	if (issues.length === 0) {
		return <div className="py-4 text-sm text-muted-foreground">No issues found.</div>;
	}

	return (
		<>
			<div className="space-y-1">
				{sortedIssues.map((issue) => {
					const isLinked = linkedIssueIds.has(issue.id);
					const colorClass = stateColors[issue.state.type] ?? "bg-zinc-500/20 text-zinc-400";

					return (
						<div
							key={issue.id}
							className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
						>
							<span className="font-mono text-xs text-muted-foreground shrink-0">
								{issue.identifier}
							</span>
							<span className="truncate flex-1">{issue.title}</span>
							<span className={`rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${colorClass}`}>
								{issue.state.name}
							</span>
							{issue.attachmentCount > 0 && (
								<span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground shrink-0" title={`${issue.attachmentCount} attachment${issue.attachmentCount > 1 ? "s" : ""}`}>
									<Paperclip className="h-3 w-3" />
									{issue.attachmentCount}
								</span>
							)}
							{isLinked ? (
								<span className="rounded-full bg-amber-500/20 text-amber-400 px-2 py-0.5 text-xs font-medium shrink-0">
									Linked
								</span>
							) : importedIds.has(issue.id) ? (
								<span className="inline-flex items-center text-emerald-400 shrink-0">
									<Check className="h-3.5 w-3.5" />
								</span>
							) : (
								<>
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() => handleImportLinearIssue(issue)}
										disabled={importingIds.has(issue.id)}
										title="Import as task"
									>
										{importingIds.has(issue.id) ? (
											<Loader2 className="h-3.5 w-3.5 animate-spin" />
										) : (
											<Import className="h-3.5 w-3.5" />
										)}
									</Button>
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() => setSelectedIssue(issue)}
										title="Create and run task from this issue"
									>
										<Play className="h-3.5 w-3.5" />
									</Button>
								</>
							)}
							<a
								href={issue.url}
								target="_blank"
								rel="noopener noreferrer"
								className="text-muted-foreground hover:text-foreground shrink-0"
								title="Open in Linear"
							>
								<ExternalLink className="h-3.5 w-3.5" />
							</a>
						</div>
					);
				})}
			</div>
			<RunTaskDialog
				open={selectedIssue !== null}
				onOpenChange={(open) => {
					if (!open) setSelectedIssue(null);
				}}
				task={null}
				workspace={workspace}
				onRun={() => {}}
				linearIssue={
					selectedIssue && workspace.linear_team_id
						? {
								id: selectedIssue.id,
								identifier: selectedIssue.identifier,
								title: selectedIssue.title,
								teamId: workspace.linear_team_id,
							}
						: null
				}
				onRunLinearIssue={handleRunLinearIssue}
			/>
		</>
	);
}
