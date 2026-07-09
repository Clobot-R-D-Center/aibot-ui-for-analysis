import { TrendingDown, TrendingUp } from "lucide-react";
import { m } from "#/paraglide/messages.js";
import type { Kpi } from "./demo-data";

const label = (k: Kpi["key"]) =>
	k === "coverage"
		? m.kpi_coverage()
		: k === "distance"
			? m.kpi_distance()
			: k === "success"
				? m.kpi_success()
				: m.kpi_uptime();

function fmt(v: number) {
	return v >= 100 ? Math.round(v).toString() : v.toFixed(1);
}

export function KpiStrip({ kpis }: { kpis: Kpi[] }) {
	return (
		<div className="stats stats-vertical w-full border border-base-300 bg-base-100 shadow-sm sm:stats-horizontal">
			{kpis.map((k) => {
				const up = k.delta >= 0;
				return (
					<div className="stat" key={k.key}>
						<div className="stat-title text-xs">{label(k.key)}</div>
						<div className="stat-value flex items-baseline gap-1 font-semibold text-2xl text-base-content">
							<span className="tnum tabular-nums">{fmt(k.value)}</span>
							<span className="font-normal text-base-content/50 text-sm">
								{k.unit}
							</span>
						</div>
						<div
							className={`stat-desc mt-1 flex items-center gap-1 ${up ? "text-success" : "text-error"}`}
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
