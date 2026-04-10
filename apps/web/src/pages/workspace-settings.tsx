import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { IconPicker } from "@/components/icon-picker";
import { LinearProjectSelect } from "@/components/linear-project-select";
import { LinearTeamSelect } from "@/components/linear-team-select";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useWorkspaces, type Workspace } from "@/hooks/use-workspaces";
import { useStore } from "@/store";
import { selectIsLinearConfigured } from "@/store/selectors";

export function WorkspaceSettingsPage({ workspace }: { workspace: Workspace }) {
	const navigate = useNavigate();
	const { update, remove } = useWorkspaces();
	const isLinearConfigured = useStore(selectIsLinearConfigured);
	const [name, setName] = useState(workspace.name);
	const [icon, setIcon] = useState<string | null>(workspace.icon);
	const [linearTeamId, setLinearTeamId] = useState<string | null>(workspace.linear_team_id);
	const [linearProjectIds, setLinearProjectIds] = useState<string[]>(() => {
		if (!workspace.linear_project_ids) return [];
		try {
			return JSON.parse(workspace.linear_project_ids) as string[];
		} catch {
			return [];
		}
	});
	const [nestedRepos, setMultiRepo] = useState(!!workspace.nested_repos);
	const [saving, setSaving] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const savedProjectIds: string[] = (() => {
		if (!workspace.linear_project_ids) return [];
		try {
			return JSON.parse(workspace.linear_project_ids) as string[];
		} catch {
			return [];
		}
	})();

	const projectIdsChanged =
		linearProjectIds.length !== savedProjectIds.length ||
		linearProjectIds.some((id) => !savedProjectIds.includes(id));

	const hasChanges =
		name.trim() !== workspace.name ||
		icon !== workspace.icon ||
		linearTeamId !== workspace.linear_team_id ||
		projectIdsChanged ||
		nestedRepos !== !!workspace.nested_repos;

	function handleTeamChange(teamId: string | null) {
		setLinearTeamId(teamId);
		if (teamId !== linearTeamId) {
			setLinearProjectIds([]);
		}
	}

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim() || !hasChanges) return;
		setSaving(true);
		try {
			await update(
				workspace.id,
				name.trim(),
				workspace.folder_path,
				icon,
				linearTeamId,
				linearProjectIds.length > 0 ? linearProjectIds : null,
				nestedRepos,
			);
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete() {
		setDeleting(true);
		try {
			await remove(workspace.id);
			navigate({ to: "/" });
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div className="mx-auto max-w-2xl px-4 py-16">
			<button
				type="button"
				className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
				onClick={() =>
					navigate({
						to: "/workspaces/$workspaceId",
						params: { workspaceId: String(workspace.id) },
					})
				}
			>
				<ArrowLeft className="h-4 w-4" />
				Back to workspace
			</button>

			<form onSubmit={handleSave} className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="workspace-name">Name</Label>
					<div className="flex items-center gap-2">
						<IconPicker icon={icon} fallback={name} onChange={setIcon} />
						<Input id="workspace-name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
					</div>
				</div>
				<div className="space-y-2">
					<Label>Folder Path</Label>
					<p className="text-sm text-muted-foreground font-mono">{workspace.folder_path}</p>
				</div>
				<div className="flex items-center gap-2">
						<Checkbox
							id="nested-repos"
							checked={nestedRepos}
							onCheckedChange={(checked) => setMultiRepo(checked === true)}
						/>
						<Label htmlFor="nested-repos" className="font-normal">
							Nested repos workspace
						</Label>
					</div>
					<p className="text-xs text-muted-foreground -mt-2">
						Enable if this workspace folder contains nested git repositories. Ralph will commit in each sub-directory's repo separately.
					</p>
				{isLinearConfigured && (
					<>
						<LinearTeamSelect value={linearTeamId} onChange={handleTeamChange} />
						<LinearProjectSelect
							teamId={linearTeamId}
							value={linearProjectIds}
							onChange={setLinearProjectIds}
						/>
					</>
				)}
				<Button type="submit" disabled={!hasChanges || !name.trim() || saving}>
					{saving ? "Saving..." : "Save"}
				</Button>
			</form>

			<Separator className="my-8" />

			<div className="space-y-4">
				<div>
					<h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Permanently delete this workspace and all its tasks.
					</p>
				</div>
				<Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
					Delete workspace
				</Button>
			</div>

			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete workspace</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete{" "}
							<span className="font-semibold">{workspace.name}</span>? This will permanently remove
							the workspace and all its tasks. This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={handleDelete} disabled={deleting}>
							{deleting ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
