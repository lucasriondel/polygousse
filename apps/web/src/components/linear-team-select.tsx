import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { wsRequest } from "@/lib/ws-client";
import type { LinearTeam } from "@/store/types";

interface LinearTeamSelectProps {
	value: string | null;
	onChange: (teamId: string | null) => void;
}

export function LinearTeamSelect({ value, onChange }: LinearTeamSelectProps) {
	const [teams, setTeams] = useState<LinearTeam[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		wsRequest("linear:teams", {})
			.then((data) => {
				if (!cancelled) setTeams(data);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<div className="space-y-2">
			<Label htmlFor="linear-team">Linear Team</Label>
			<select
				id="linear-team"
				value={value ?? ""}
				onChange={(e) => onChange(e.target.value || null)}
				disabled={loading}
				className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
			>
				<option value="">{loading ? "Loading teams..." : "None"}</option>
				{teams.map((team) => (
					<option key={team.id} value={team.id}>
						{team.key} — {team.name}
					</option>
				))}
			</select>
		</div>
	);
}
