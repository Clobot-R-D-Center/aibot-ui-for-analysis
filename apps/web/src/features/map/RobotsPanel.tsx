import { m } from "#/paraglide/messages.js";

export interface RobotChoice {
	id: string;
	name: string;
	/** live only: the robot stack's state name, or "offline" when stale */
	status?: string;
	tone?: "run" | "error" | "idle" | "stale";
}

// Status is spelled out next to the dot, so color is never the only cue.
const DOT: Record<NonNullable<RobotChoice["tone"]>, string> = {
	run: "bg-success",
	error: "bg-error",
	idle: "bg-base-content/40",
	stale: "bg-base-content/20",
};

/** Floating HUD list of the fleet: pick the robot the dashboard follows. */
export function RobotsPanel({
	robots,
	selected,
	onSelect,
}: {
	robots: RobotChoice[];
	selected: string;
	onSelect: (id: string) => void;
}) {
	if (robots.length === 0) return null;
	return (
		<div className="absolute top-4 left-4 z-10 flex max-h-[calc(100%-11rem)] w-64 flex-col rounded-lg border border-border bg-surface p-2.5 shadow-sm">
			<h2 className="mb-1.5 flex items-baseline justify-between px-1.5 font-medium text-faint text-xs uppercase tracking-wide">
				{m.robot_label()}
				<span className="tnum normal-case tracking-normal">
					{robots.length}
				</span>
			</h2>
			<ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
				{robots.map((r) => {
					const on = r.id === selected;
					return (
						<li key={r.id}>
							<button
								type="button"
								onClick={() => onSelect(r.id)}
								aria-pressed={on}
								title={r.name}
								className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors ${on ? "bg-primary/10 text-primary" : "text-ink hover:bg-surface-raised"} ${r.tone === "stale" ? "opacity-60" : ""}`}
							>
								{r.tone && (
									<span
										className={`size-2 shrink-0 rounded-full ${DOT[r.tone]}`}
										aria-hidden
									/>
								)}
								<span className="min-w-0 flex-1 truncate">{r.name}</span>
								{r.status && (
									<span
										className={`tnum shrink-0 text-xs ${r.tone === "error" ? "text-error" : "text-faint"}`}
									>
										{r.status}
									</span>
								)}
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
