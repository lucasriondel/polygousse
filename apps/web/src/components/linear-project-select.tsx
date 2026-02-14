import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { wsRequest } from "@/lib/ws-client";
import type { LinearProject } from "@/store/types";

interface LinearProjectSelectProps {
	teamId: string | null;
	value: string[];
	onChange: (projectIds: string[]) => void;
}

export function LinearProjectSelect({ teamId, value, onChange }: LinearProjectSelectProps) {
	const [projects, setProjects] = useState<LinearProject[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!teamId) {
			setProjects([]);
			return;
		}
		let cancelled = false;
		setLoading(true);
		wsRequest("linear:team-projects", { teamId })
			.then((data) => {
				if (!cancelled) setProjects(data);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [teamId]);

	if (!teamId) return null;

	function toggleProject(projectId: string) {
		if (value.includes(projectId)) {
			onChange(value.filter((id) => id !== projectId));
		} else {
			onChange([...value, projectId]);
		}
	}

	return (
		<div className="space-y-2">
			<Label>Linear Projects</Label>
			{loading ? (
				<p className="text-sm text-muted-foreground">Loading projects...</p>
			) : projects.length === 0 ? (
				<p className="text-sm text-muted-foreground">No projects found for this team.</p>
			) : (
				<div className="space-y-1.5 rounded-md border p-3 max-h-48 overflow-y-auto">
					{projects.map((project) => (
						<label
							key={project.id}
							className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
						>
							<input
								type="checkbox"
								checked={value.includes(project.id)}
								onChange={() => toggleProject(project.id)}
								className="rounded border-input"
							/>
							<span className="truncate">{project.name}</span>
						</label>
					))}
				</div>
			)}
		</div>
	);
}
