import { MapPin, Moon, Sun } from "lucide-react";
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
		<header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-base-300 border-b bg-base-100 px-4 py-2.5">
			<div className="flex items-center gap-2">
				<MapPin className="size-5 text-primary" aria-hidden />
				<span className="font-semibold text-base-content text-sm">
					{m.app_name()}
				</span>
				<span className="hidden text-base-content/40 sm:inline" aria-hidden>
					/
				</span>
				<span className="hidden text-base-content/60 text-sm sm:inline">
					{m.view_dashboard()}
				</span>
			</div>

			<div className="flex items-center gap-2">
				<select
					value={robotId}
					onChange={(e) => onRobot(e.target.value)}
					aria-label={m.robot_label()}
					className="select select-sm w-36"
				>
					{robots.map((r) => (
						<option key={r.id} value={r.id}>
							{r.name}
						</option>
					))}
				</select>

				{/* biome-ignore lint/a11y/useSemanticElements: join is daisyUI's segmented-control wrapper */}
				<div className="join" role="group" aria-label={m.range_label()}>
					{RANGES.map((r) => (
						<button
							key={r}
							type="button"
							onClick={() => onRange(r)}
							aria-pressed={r === range}
							className={`btn join-item btn-sm ${r === range ? "btn-primary" : "btn-ghost"}`}
						>
							{rangeLabel(r)}
						</button>
					))}
				</div>

				<button
					type="button"
					onClick={toggleTheme}
					className="btn btn-square btn-ghost btn-sm"
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
