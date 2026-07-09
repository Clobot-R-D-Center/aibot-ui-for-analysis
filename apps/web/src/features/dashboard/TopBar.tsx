import { Bot, ChevronDown, MapPin, Moon, Sun } from "lucide-react";
import { toggleTheme, useTheme } from "#/features/map/theme";
import { m } from "#/paraglide/messages.js";
import { RANGES, type RangeDays, type Robot } from "./demo-data";

interface Props {
	robots: Robot[];
	robotId: string;
	onRobot: (id: string) => void;
	range: RangeDays;
	onRange: (r: RangeDays) => void;
}

const rangeLabel = (r: RangeDays) =>
	r === 1 ? m.range_today() : r === 7 ? m.range_7d() : m.range_30d();

export function TopBar({ robots, robotId, onRobot, range, onRange }: Props) {
	const theme = useTheme();
	return (
		<header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-border border-b bg-surface px-4 py-2.5">
			<div className="flex items-center gap-2">
				<MapPin className="size-5 text-accent" aria-hidden />
				<span className="font-semibold text-ink text-sm">{m.app_name()}</span>
				<span className="hidden text-faint sm:inline" aria-hidden>
					/
				</span>
				<span className="hidden text-muted text-sm sm:inline">
					{m.view_dashboard()}
				</span>
			</div>

			<div className="flex items-center gap-2">
				{/* Robot selector — native select for built-in a11y + keyboard */}
				<div className="relative">
					<Bot
						className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted"
						aria-hidden
					/>
					<select
						value={robotId}
						onChange={(e) => onRobot(e.target.value)}
						aria-label={m.robot_label()}
						className="h-9 appearance-none rounded-lg border border-border bg-surface pr-8 pl-8 text-ink text-sm transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent"
					>
						{robots.map((r) => (
							<option key={r.id} value={r.id}>
								{r.name}
							</option>
						))}
					</select>
					<ChevronDown
						className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-2.5 size-4 text-muted"
						aria-hidden
					/>
				</div>

				{/* Time range segmented control */}
				{/* biome-ignore lint/a11y/useSemanticElements: role=group is the correct ARIA for a segmented toggle; a fieldset would drag in unwanted layout defaults */}
				<div
					className="flex h-9 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5"
					role="group"
					aria-label={m.range_label()}
				>
					{RANGES.map((r) => {
						const active = r === range;
						return (
							<button
								key={r}
								type="button"
								onClick={() => onRange(r)}
								aria-pressed={active}
								className={`h-7 rounded-md px-2.5 font-medium text-xs transition-colors ${
									active
										? "bg-accent text-accent-ink"
										: "text-muted hover:text-ink"
								}`}
							>
								{rangeLabel(r)}
							</button>
						);
					})}
				</div>

				<button
					type="button"
					onClick={toggleTheme}
					className="grid size-9 place-items-center rounded-lg border border-border bg-surface text-muted transition-colors hover:border-border-strong hover:text-ink"
					aria-label={
						theme === "dark" ? m.action_theme_light() : m.action_theme_dark()
					}
				>
					{theme === "dark" ? (
						<Sun className="size-4" />
					) : (
						<Moon className="size-4" />
					)}
				</button>
			</div>
		</header>
	);
}
