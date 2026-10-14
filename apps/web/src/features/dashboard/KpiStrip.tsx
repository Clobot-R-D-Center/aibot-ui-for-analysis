import { TrendingDown, TrendingUp } from "lucide-react";
import { m } from "#/paraglide/messages.js";
import type { Kpi, KpiKey } from "./robot-data";

const LABEL: Record<KpiKey, () => string> = {
	coverage: () => m.kpi_coverage(),
	distance: () => m.kpi_distance(),
	uptime: () => m.kpi_uptime(),
	run: () => m.kpi_run(),
	errors: () => m.kpi_errors(),
	wait: () => m.kpi_wait(),
};

/** For these a rise is bad news, so the delta's color flips (its arrow doesn't). */
const LOWER_IS_BETTER = new Set<KpiKey>(["errors", "wait"]);

function fmt(k: Kpi) {
	if (k.key === "errors") return Math.round(k.value).toString();
	return k.value >= 100 ? Math.round(k.value).toString() : k.value.toFixed(1);
}

export function KpiStrip({ kpis }: { kpis: Kpi[] }) {
	return (
		<div className="stats stats-vertical w-full border border-base-300 bg-base-100 shadow-sm sm:stats-horizontal">
			{kpis.map((k) => {
				const up = k.delta >= 0;
				const good = LOWER_IS_BETTER.has(k.key) ? k.delta <= 0 : up;
				return (
					<div className="stat" key={k.key}>
						<div className="stat-title text-xs">{LABEL[k.key]()}</div>
						<div className="stat-value flex items-baseline gap-1 font-semibold text-2xl text-base-content">
							<span className="tnum tabular-nums">{fmt(k)}</span>
							<span className="font-normal text-base-content/50 text-sm">
								{k.unit}
							</span>
						</div>
						<div
							className={`stat-desc mt-1 flex items-center gap-1 ${good ? "text-success" : "text-error"}`}
						>
							{up ? (
								<TrendingUp className="size-3.5" aria-hidden />
							) : (
								<TrendingDown className="size-3.5" aria-hidden />
							)}
							<span className="tnum tabular-nums">
								{up ? "+" : ""}
								{k.delta.toFixed(1)}%
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
