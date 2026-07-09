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
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
			{kpis.map((k) => {
				const up = k.delta >= 0;
				return (
					<div
						key={k.key}
						className="rounded-xl border border-border bg-surface px-4 py-3.5 shadow-sm"
					>
						<div className="text-muted text-xs">{label(k.key)}</div>
						<div className="mt-1.5 flex items-baseline gap-1">
							<span className="tnum font-semibold text-2xl text-ink tabular-nums">
								{fmt(k.value)}
							</span>
							<span className="text-faint text-sm">{k.unit}</span>
						</div>
						<div
							className="mt-1 flex items-center gap-1 text-xs"
							style={{ color: up ? "var(--data-3)" : "var(--data-1)" }}
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
