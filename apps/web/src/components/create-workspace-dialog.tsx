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
import { ChevronUp, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";

interface CreateWorkspaceDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreate: (name: string, folderPath: string, icon?: string | null, linearTeamId?: string | null) => Promise<Workspace>;
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
	const [browsing, setBrowsing] = useState(false);
	const [browseData, setBrowseData] = useState<BrowseResult | null>(null);
	const [browseLoading, setBrowseLoading] = useState(false);
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

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim() || !folderPath.trim()) return;
		await onCreate(name.trim(), folderPath.trim(), icon, linearTeamId);
		setName("");
		setIcon(null);
		setFolderPath("");
		setLinearTeamId(null);
		setBrowsing(false);
		setBrowseData(null);
		onOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New Workspace</DialogTitle>
				</DialogHeader>
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
						<Button type="submit" disabled={!name.trim() || !folderPath.trim()}>
							Create
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
