import { MapPin, Moon, Sun } from "lucide-react";
import { toggleTheme, useTheme } from "#/features/map/theme";
import { m } from "#/paraglide/messages.js";

export function TopBar() {
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
