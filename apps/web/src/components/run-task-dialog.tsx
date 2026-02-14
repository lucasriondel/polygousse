import {
	GitBranch,
	Loader2,
	Map as MapIcon,
	Paperclip,
	Play,
	Repeat,
	ShieldOff,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LinearIssueDetail } from "@/store/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Task } from "@/hooks/use-tasks";
import type { Workspace } from "@/hooks/use-workspaces";
import { wsRequest } from "@/lib/ws-client";
import { sanitizeBranchName } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/config";
import { useStore } from "@/store";

interface RunOptions {
	permissionMode?: string;
	planMode?: boolean;
	worktreePath?: string;
	ralphMode?: boolean;
	maxIterations?: number;
}

interface LinearIssueInfo {
	id: string;
	identifier: string;
	title: string;
	teamId: string;
}

interface RunTaskDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	task: Task | null;
	workspace: Workspace | null;
	onRun: (taskId: number, options: RunOptions) => void;
	linearIssue?: LinearIssueInfo | null;
	onRunLinearIssue?: (issue: LinearIssueInfo, options: RunOptions) => void;
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|svg|ico)(\?|$)/i;

function isImageUrl(url: string): boolean {
	return IMAGE_EXTENSIONS.test(url);
}

export function RunTaskDialog({ open, onOpenChange, task, workspace, onRun, linearIssue, onRunLinearIssue }: RunTaskDialogProps) {
	const isLinearMode = !!linearIssue && !task;
	const [planMode, setPlanMode] = useState(false);
	const [dangerouslySkipPermissions, setDangerouslySkipPermissions] = useState(true);
	const [ralphMode, setRalphMode] = useState(false);
	const [maxIterations, setMaxIterations] = useState(50);
	const [worktreeEnabled, setWorktreeEnabled] = useState(false);
	const [branchName, setBranchName] = useState("");
	const [loading, setLoading] = useState(false);

	const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);

	const [linearDetail, setLinearDetail] = useState<LinearIssueDetail | null>(null);
	const [linearDetailLoading, setLinearDetailLoading] = useState(false);

	useEffect(() => {
		if (!open || !linearIssue || task) {
			setLinearDetail(null);
			return;
		}
		setLinearDetailLoading(true);
		wsRequest("linear:issue-detail", { issueId: linearIssue.id })
			.then(setLinearDetail)
			.catch(() => setLinearDetail(null))
			.finally(() => setLinearDetailLoading(false));
	}, [open, linearIssue, task]);

	const sanitized = useMemo(() => sanitizeBranchName(branchName), [branchName]);

	const attachments = useStore((s) => s.attachments);
	const taskAttachments = useMemo(() => {
		if (!task) return [];
		return [...attachments.values()]
			.filter((a) => a.task_id === task.id)
			.sort((a, b) => a.created_at.localeCompare(b.created_at));
	}, [attachments, task]);

	const canRun = (task || isLinearMode) && !loading && (!worktreeEnabled || sanitized.length > 0);

	async function handleRun() {
		if (!canRun) return;
		setLoading(true);
		try {
			let worktreePath: string | undefined;
			if (worktreeEnabled && workspace) {
				const result = await wsRequest("worktree:create", {
					workspaceId: workspace.id,
					branchName: sanitized,
				});
				worktreePath = result.path;
			}
			const options: RunOptions = {
				permissionMode: dangerouslySkipPermissions ? "dangerously-skip-permissions" : undefined,
				planMode,
				worktreePath,
				ralphMode: ralphMode || undefined,
				maxIterations: ralphMode ? maxIterations : undefined,
			};
			if (isLinearMode && onRunLinearIssue) {
				onRunLinearIssue(linearIssue, options);
			} else if (task) {
				onRun(task.id, options);
			}
			onOpenChange(false);
			setPlanMode(false);
			setDangerouslySkipPermissions(true);
			setRalphMode(false);
			setMaxIterations(50);
			setWorktreeEnabled(false);
			setBranchName("");
		} finally {
			setLoading(false);
		}
	}

	return (<>
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Play className="h-5 w-5 text-green-500" />
						{isLinearMode ? "Run Linear Issue" : "Run Task"}
					</DialogTitle>
					<DialogDescription>Review and configure before starting.</DialogDescription>
				</DialogHeader>

				{isLinearMode && (
					<div className="rounded-md bg-muted p-3 text-sm space-y-2 max-h-[30vh] overflow-y-auto">
						<p className="font-medium">
							<span className="font-mono text-xs text-muted-foreground mr-2">{linearIssue.identifier}</span>
							{linearIssue.title}
						</p>
						{linearDetailLoading && (
							<p className="text-xs text-muted-foreground flex items-center gap-1.5">
								<Loader2 className="h-3 w-3 animate-spin" />
								Loading details…
							</p>
						)}
						{linearDetail?.description && (
							<p className="text-muted-foreground text-xs line-clamp-4 whitespace-pre-wrap">{linearDetail.description}</p>
						)}
						{linearDetail && linearDetail.attachments.length > 0 && (
							<div className="flex flex-wrap gap-1.5 pt-1 items-center">
								{linearDetail.attachments.map((a) => {
									if (isImageUrl(a.url)) {
										return (
											<button
												key={a.id}
												type="button"
												onClick={() => setPreviewImage({ src: a.url, alt: a.title || "Attachment" })}
												className="h-10 w-10 rounded border border-border overflow-hidden hover:ring-2 hover:ring-ring transition-shadow cursor-pointer"
											>
												<img src={a.url} alt={a.title || "Attachment"} className="h-full w-full object-cover" />
											</button>
										);
									}
									return (
										<a
											key={a.id}
											href={a.url}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
										>
											<Paperclip className="h-3 w-3" />
											{a.title || "Attachment"}
										</a>
									);
								})}
							</div>
						)}
					</div>
				)}

				{task && !isLinearMode && (
					<div className="rounded-md bg-muted p-3 text-sm space-y-1 max-h-[30vh] overflow-y-auto">
						<p className="font-medium">{task.title}</p>
						{task.description && <p className="text-muted-foreground">{task.description}</p>}
						{taskAttachments.length > 0 && (
							<div className="flex flex-wrap gap-1.5 pt-1 items-center">
								{taskAttachments.map((a) => {
									const isImage = a.mime_type.startsWith("image/");
									const src = `${API_BASE_URL}/attachments/${a.id}/file`;
									if (isImage) {
										return (
											<button
												key={a.id}
												type="button"
												onClick={() => setPreviewImage({ src, alt: a.filename })}
												className="h-10 w-10 rounded border border-border overflow-hidden hover:ring-2 hover:ring-ring transition-shadow cursor-pointer"
											>
												<img src={src} alt={a.filename} className="h-full w-full object-cover" />
											</button>
										);
									}
									return (
										<span
											key={a.id}
											className="inline-flex items-center gap-1 text-xs text-muted-foreground"
										>
											<Paperclip className="h-3 w-3" />
											{a.filename}
										</span>
									);
								})}
							</div>
						)}
					</div>
				)}

				<div className="space-y-4">
					<div className="flex items-center gap-2">
						<Checkbox
							id="plan-mode"
							checked={planMode}
							onCheckedChange={(v) => setPlanMode(v === true)}
						/>
						<Label htmlFor="plan-mode" className="flex items-center gap-1.5">
							<MapIcon className="h-3.5 w-3.5 text-blue-500" />
							Plan mode
						</Label>
					</div>

					<div className="flex items-center gap-2">
						<Checkbox
							id="skip-permissions"
							checked={dangerouslySkipPermissions}
							disabled={ralphMode}
							onCheckedChange={(v) => setDangerouslySkipPermissions(v === true)}
						/>
						<Label htmlFor="skip-permissions" className="flex items-center gap-1.5">
							<ShieldOff className="h-3.5 w-3.5 text-amber-500" />
							Dangerously skip permissions
						</Label>
					</div>

					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Checkbox
								id="ralph-mode"
								checked={ralphMode}
								onCheckedChange={(v) => {
									const on = v === true;
									setRalphMode(on);
									if (on) {
										setDangerouslySkipPermissions(true);
									}
								}}
							/>
							<Label htmlFor="ralph-mode" className="flex items-center gap-1.5">
								<Repeat className="h-3.5 w-3.5 text-orange-500" />
								Ralph mode
							</Label>
						</div>

						{planMode && ralphMode && (
							<p className="text-xs text-muted-foreground ml-6">
								Plan mode will run first, then ralph will execute the generated plan.
							</p>
						)}

						{ralphMode && (
							<div className="ml-6 space-y-1.5">
								<Label htmlFor="max-iterations" className="text-xs text-muted-foreground">
									Max iterations
								</Label>
								<Input
									id="max-iterations"
									type="number"
									min={1}
									max={200}
									value={maxIterations}
									onChange={(e) =>
										setMaxIterations(Math.max(1, Math.min(200, Number(e.target.value) || 1)))
									}
									className="w-24"
								/>
							</div>
						)}
					</div>

					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Checkbox
								id="worktree"
								checked={worktreeEnabled}
								onCheckedChange={(v) => setWorktreeEnabled(v === true)}
							/>
							<Label htmlFor="worktree" className="flex items-center gap-1.5">
								<GitBranch className="h-3.5 w-3.5 text-purple-500" />
								Create worktree
							</Label>
						</div>

						{worktreeEnabled && (
							<div className="ml-6 space-y-1.5">
								<Input
									placeholder="Branch name"
									value={branchName}
									onChange={(e) => setBranchName(e.target.value)}
								/>
								{sanitized && (
									<p className="text-xs text-muted-foreground">
										Branch: <code>{sanitized}</code>
									</p>
								)}
							</div>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
						Cancel
					</Button>
					<Button onClick={handleRun} disabled={!canRun} className="gap-1.5">
						{loading ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								Creating…
							</>
						) : (
							<>
								<Play className="h-4 w-4" />
								Run
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>

		<DialogPrimitive.Root open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
				<DialogPrimitive.Content
					className="fixed inset-0 z-[100] flex items-center justify-center p-8 outline-none"
					onClick={() => setPreviewImage(null)}
				>
					<DialogPrimitive.Title className="sr-only">
						{previewImage?.alt ?? "Image preview"}
					</DialogPrimitive.Title>
					<button
						type="button"
						onClick={() => setPreviewImage(null)}
						className="absolute top-4 right-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors cursor-pointer"
					>
						<X className="h-5 w-5" />
					</button>
					{previewImage && (
						<img
							src={previewImage.src}
							alt={previewImage.alt}
							className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
							onClick={(e) => e.stopPropagation()}
						/>
					)}
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	</>
	);
}
