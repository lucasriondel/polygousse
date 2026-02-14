import { Check, ExternalLink, Volume2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { playNotificationSound } from "@/lib/notification-sound";
import { terminalThemes } from "@/lib/terminal-themes";
import { useStore } from "@/store";
import {
	selectIsLinearConfigured,
	selectNotificationSoundEnabled,
	selectRalphLoopSoundEnabled,
	selectTerminalTheme,
} from "@/store/selectors";

export function SettingsPage() {
	const isConfigured = useStore(selectIsLinearConfigured);
	const currentTheme = useStore(selectTerminalTheme);
	const soundEnabled = useStore(selectNotificationSoundEnabled);
	const ralphSoundEnabled = useStore(selectRalphLoopSoundEnabled);
	const updateSetting = useStore((s) => s.updateSetting);
	const deleteSetting = useStore((s) => s.deleteSetting);

	const [token, setToken] = useState("");
	const [saving, setSaving] = useState(false);
	const [removing, setRemoving] = useState(false);

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		if (!token.trim()) return;
		setSaving(true);
		try {
			await updateSetting("linear_api_token", token.trim());
			setToken("");
		} finally {
			setSaving(false);
		}
	}

	async function handleRemove() {
		setRemoving(true);
		try {
			await deleteSetting("linear_api_token");
		} finally {
			setRemoving(false);
		}
	}

	return (
		<div className="mx-auto max-w-2xl px-4 py-16 space-y-12">
			<div className="space-y-4">
				<div>
					<h2 className="text-lg font-semibold">Linear Integration</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Connect your Linear account to sync issues with Polygousse tasks.
					</p>
				</div>

				{isConfigured ? (
					<div className="space-y-4">
						<div className="flex items-center gap-3 rounded-md border px-4 py-3">
							<div className="flex-1">
								<p className="text-sm font-medium">API Token</p>
								<p className="text-sm text-muted-foreground font-mono">{"••••••••"}</p>
							</div>
							<Button
								variant="destructive"
								size="sm"
								onClick={handleRemove}
								disabled={removing}
							>
								{removing ? "Removing..." : "Remove"}
							</Button>
						</div>
					</div>
				) : (
					<form onSubmit={handleSave} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="linear-token">API Token</Label>
							<Input
								id="linear-token"
								type="password"
								value={token}
								onChange={(e) => setToken(e.target.value)}
								placeholder="lin_api_..."
							/>
							<p className="text-xs text-muted-foreground">
								Create a personal API key at{" "}
								<a
									href="https://linear.app/settings/api"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 text-foreground underline underline-offset-4 hover:text-foreground/80"
								>
									linear.app/settings/api
									<ExternalLink className="size-3" />
								</a>
							</p>
						</div>
						<Button type="submit" disabled={!token.trim() || saving}>
							{saving ? "Saving..." : "Save token"}
						</Button>
					</form>
				)}
			</div>

			<div className="space-y-4">
				<div>
					<h2 className="text-lg font-semibold">Notifications</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Configure how you get notified when sessions need attention.
					</p>
				</div>

				<div className="flex items-center justify-between rounded-md border px-4 py-3">
					<div className="flex items-center gap-3">
						<Checkbox
							id="notification-sound"
							checked={soundEnabled}
							onCheckedChange={(checked) =>
								updateSetting("notification_sound", checked ? "on" : "off")
							}
						/>
						<Label htmlFor="notification-sound" className="cursor-pointer">
							Play sound on notification
						</Label>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => playNotificationSound()}
						className="gap-1.5"
					>
						<Volume2 className="size-3.5" />
						Preview
					</Button>
				</div>

				<div className="flex items-center justify-between rounded-md border px-4 py-3">
					<div className="flex items-center gap-3">
						<Checkbox
							id="ralph-loop-sound"
							checked={ralphSoundEnabled}
							onCheckedChange={(checked) =>
								updateSetting("ralph_loop_sound", checked ? "on" : "off")
							}
						/>
						<Label htmlFor="ralph-loop-sound" className="cursor-pointer">
							Play sound on Ralph loop notification
						</Label>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => playNotificationSound()}
						className="gap-1.5"
					>
						<Volume2 className="size-3.5" />
						Preview
					</Button>
				</div>
			</div>

			<div className="space-y-4">
				<div>
					<h2 className="text-lg font-semibold">Terminal</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Choose a color theme for terminal sessions.
					</p>
				</div>

				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{Object.entries(terminalThemes).map(([key, { name, theme }]) => {
						const isActive = key === currentTheme;
						return (
							<button
								key={key}
								type="button"
								onClick={() => updateSetting("terminal_theme", key)}
								className={`group relative rounded-lg border-2 p-1.5 text-left transition-colors ${
									isActive
										? "border-primary"
										: "border-transparent hover:border-muted-foreground/30"
								}`}
							>
								{isActive && (
									<div className="absolute -top-1.5 -right-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-primary">
										<Check className="size-3 text-primary-foreground" />
									</div>
								)}
								<div
									className="rounded-md px-3 py-2.5 font-mono text-[11px] leading-relaxed"
									style={{ backgroundColor: theme.background, color: theme.foreground }}
								>
									<div>
										<span style={{ color: theme.green }}>user</span>
										<span style={{ color: theme.foreground }}>@</span>
										<span style={{ color: theme.cyan }}>host</span>
										<span style={{ color: theme.foreground }}>{" $ "}</span>
										<span style={{ color: theme.yellow }}>ls</span>
									</div>
									<div>
										<span style={{ color: theme.blue }}>src/</span>
										{"  "}
										<span style={{ color: theme.magenta }}>lib/</span>
										{"  "}
										<span style={{ color: theme.foreground }}>README</span>
									</div>
									<div>
										<span style={{ color: theme.red }}>error:</span>
										<span style={{ color: theme.foreground }}> not found</span>
									</div>
								</div>
								<p className="mt-1.5 text-center text-xs font-medium">{name}</p>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
