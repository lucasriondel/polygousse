import { IconPicker } from "@/components/icon-picker";
import { LinearTeamSelect } from "@/components/linear-team-select";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Workspace } from "@/hooks/use-workspaces";
import { wsRequest } from "@/lib/ws-client";
import { useStore } from "@/store";
import { selectIsLinearConfigured } from "@/store/selectors";
import type { BrowseResult } from "@polygousse/types";
import { AlertTriangle, ChevronUp, Folder, FolderOpen } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";

interface CreateWorkspaceDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreate: (name: string, folderPath: string, icon?: string | null, linearTeamId?: string | null, multiRepo?: boolean) => Promise<Workspace>;
}

export function CreateWorkspaceDialog({
	open,
	onOpenChange,
	onCreate,
}: CreateWorkspaceDialogProps) {
	const [name, setName] = useState("");
	const [icon, setIcon] = useState<string | null>(null);
	const [folderPath, setFolderPath] = useState("");
	const [linearTeamId, setLinearTeamId] = useState<string | null>(null);
	const [multiRepo, setMultiRepo] = useState(false);
	const [browsing, setBrowsing] = useState(false);
	const [browseData, setBrowseData] = useState<BrowseResult | null>(null);
	const [browseLoading, setBrowseLoading] = useState(false);
	const [confirmInit, setConfirmInit] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const isLinearConfigured = useStore(selectIsLinearConfigured);

	async function browse(path?: string) {
		setBrowseLoading(true);
		try {
			const data = await wsRequest("filesystem:browse", { path });
			setBrowseData(data);
			setBrowsing(true);
		} finally {
			setBrowseLoading(false);
		}
	}

	function selectFolder(path: string) {
		setFolderPath(path);
		if (!name.trim()) {
			const folderName = path.split("/").pop() || "";
			setName(folderName);
		}
		setBrowsing(false);
	}

	async function finishCreate() {
		setSubmitting(true);
		try {
			await onCreate(name.trim(), folderPath.trim(), icon, linearTeamId, multiRepo);
			setName("");
			setIcon(null);
			setFolderPath("");
			setLinearTeamId(null);
			setMultiRepo(false);
			setBrowsing(false);
			setBrowseData(null);
			setConfirmInit(false);
			onOpenChange(false);
		} finally {
			setSubmitting(false);
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim() || !folderPath.trim()) return;
		setSubmitting(true);
		try {
			const { exists } = await wsRequest("workspace:check-path", { folder_path: folderPath.trim() });
			if (!exists) {
				setConfirmInit(true);
				return;
			}
			await finishCreate();
		} finally {
			setSubmitting(false);
		}
	}

	async function handleConfirmInit() {
		setSubmitting(true);
		try {
			await wsRequest("workspace:init-repo", { folder_path: folderPath.trim() });
			await finishCreate();
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New Workspace</DialogTitle>
				</DialogHeader>
				{confirmInit ? (
					<div className="space-y-4">
						<div className="flex gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
							<AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
							<div className="space-y-1 text-sm">
								<p className="font-medium">Folder does not exist</p>
								<p className="text-muted-foreground">
									<code className="text-xs">{folderPath.trim()}</code> does not exist. Do you want to create
									it and initialize a git repository?
								</p>
							</div>
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setConfirmInit(false)} disabled={submitting}>
								Back
							</Button>
							<Button type="button" onClick={handleConfirmInit} disabled={submitting}>
								{submitting ? "Creating…" : "Create folder & init repo"}
							</Button>
						</DialogFooter>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="workspace-name">Name</Label>
							<div className="flex items-center gap-2">
								<IconPicker icon={icon} fallback={name} onChange={setIcon} />
								<Input
									id="workspace-name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="My Project"
									autoFocus
									className="flex-1"
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="workspace-path">Folder Path</Label>
							<div className="flex gap-2">
								<Input
									id="workspace-path"
									value={folderPath}
									onChange={(e) => setFolderPath(e.target.value)}
									placeholder="/home/user/projects/my-project"
									className="flex-1"
								/>
								<Button
									type="button"
									variant="outline"
									size="icon"
									onClick={() => browse(folderPath || undefined)}
									disabled={browseLoading}
								>
									<FolderOpen className="h-4 w-4" />
								</Button>
							</div>
						</div>

						<div className="space-y-1">
							<div className="flex items-center gap-2">
								<Checkbox
									id="multi-repo"
									checked={multiRepo}
									onCheckedChange={(checked) => setMultiRepo(checked === true)}
								/>
								<Label htmlFor="multi-repo" className="font-normal">
									Multi-repo workspace
								</Label>
							</div>
							<p className="text-xs text-muted-foreground ml-6">
								Enable if this workspace contains multiple git repositories (not a monorepo). Ralph will commit in each sub-project's repo separately.
							</p>
						</div>

						{isLinearConfigured && (
							<LinearTeamSelect value={linearTeamId} onChange={setLinearTeamId} />
						)}

						{browsing && browseData && (
							<div className="rounded-md border">
								<div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
									{browseData.parent && (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="h-6 w-6"
											onClick={() => browse(browseData.parent!)}
											disabled={browseLoading}
										>
											<ChevronUp className="h-4 w-4" />
										</Button>
									)}
									<span className="truncate text-sm font-mono">{browseData.path}</span>
								</div>
								<div className="max-h-100 overflow-y-auto">
									{browseData.directories.length === 0 ? (
										<p className="px-3 py-4 text-sm text-muted-foreground text-center">
											No subdirectories
										</p>
									) : (
										browseData.directories.map((dir) => (
											<button
												key={dir.path}
												type="button"
												className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 text-left"
												onClick={() => browse(dir.path)}
											>
												<Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
												{dir.name}
											</button>
										))
									)}
								</div>
								<div className="flex justify-end border-t px-3 py-2">
									<Button type="button" size="sm" onClick={() => selectFolder(browseData.path)}>
										Select this folder
									</Button>
								</div>
							</div>
						)}

						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={!name.trim() || !folderPath.trim() || submitting}>
								{submitting ? "Checking…" : "Create"}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
