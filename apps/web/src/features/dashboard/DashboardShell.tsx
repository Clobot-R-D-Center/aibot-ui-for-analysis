import { useMemo, useState } from "react";
import { MAP_URL, useFleetLive } from "#/features/live/use-fleet-live";
import {
	type CellGrid,
	coveragePct,
	heatFrom,
	mapFreeGrid,
} from "#/features/map/coverage";
import { MapPanel } from "#/features/map/MapPanel";
import { useRosMap } from "#/features/map/use-ros-map";
import { m } from "#/paraglide/messages.js";
import { AsyncContent } from "./AsyncContent";
import { type Kpi, type RangeDays, ROBOTS, type RobotData } from "./demo-data";
import { EventLog } from "./EventLog";
import { KpiStrip } from "./KpiStrip";
import { Panel } from "./Panel";
import { TopBar } from "./TopBar";
import { TrendChart } from "./TrendChart";
import { useRobotData } from "./use-robot-data";

const DEMO_MAP = "/demo-map";

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Live history leaves coverage to us (it needs the map); demo data has it already. */
function withCoverage(data: RobotData, grid: CellGrid | null): Kpi[] {
	if (!data.cells || !grid) return data.kpis;
	const cur = coveragePct(grid, data.cells);
	const prev = coveragePct(grid, data.prevCells ?? []);
	const coverage: Kpi = {
		key: "coverage",
		value: round1(cur),
		unit: "%",
		delta: prev > 0 ? round1(((cur - prev) / prev) * 100) : 0,
	};
	return [coverage, ...data.kpis];
}

export function DashboardShell() {
	const live = useFleetLive();
	const robots = live
		? live.robots.map((r) => ({ id: r.name, name: r.name }))
		: ROBOTS;
	const [picked, setPicked] = useState(ROBOTS[0].id);
	// Live list arrives after first render; fall back to its first robot.
	const robotId = robots.some((r) => r.id === picked)
		? picked
		: (robots[0]?.id ?? picked);
	const [range, setRange] = useState<RangeDays>(7);
	const { state, retry } = useRobotData(robotId, range);
	const [mapNonce, setMapNonce] = useState(0);
	// Live: the gateway's map, reloaded whenever its version changes (SLAM).
	const map = useRosMap(
		live ? live.mapVersion && (MAP_URL ?? null) : DEMO_MAP,
		`${live?.mapVersion}:${mapNonce}`,
	);

	const ready = state.status === "ready" ? state.data : null;
	const lastDistance = ready?.distance.at(-1)?.value ?? 0;
	const lastRun = ready?.run.at(-1)?.value ?? 0;

	const cell = ready?.cell;
	const loaded = map.status === "ready" ? map.map : null;
	// ponytail: reads every map pixel once per map/cell size (~ms for a few Mpx)
	const grid = useMemo(
		() => (loaded && cell ? mapFreeGrid(loaded, cell) : null),
		[loaded, cell],
	);
	const heat = useMemo(
		() => (grid && ready?.cells ? heatFrom(grid, ready.cells) : undefined),
		[grid, ready],
	);

	return (
		<div className="flex h-[100dvh] flex-col bg-canvas text-ink">
			<TopBar
				robots={robots}
				robotId={robotId}
				onRobot={setPicked}
				range={range}
				onRange={setRange}
			/>

			<main className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
					<AsyncContent
						state={state}
						onRetry={retry}
						skeleton={<KpiSkeleton />}
					>
						{(data) => <KpiStrip kpis={withCoverage(data, grid)} />}
					</AsyncContent>

					{/* Map hero — its own bordered panel, fills a tall band above the fold */}
					<div className="h-[60vh] min-h-[380px]">
						<MapPanel
							state={map}
							onRetry={() => setMapNonce((n) => n + 1)}
							robotId={robotId}
							live={live}
							heat={heat}
						/>
					</div>

					{/* Trends — scroll down for detail */}
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
						<Panel
							title={m.chart_distance()}
							action={
								ready ? (
									<span className="tnum text-ink text-sm tabular-nums">
										{lastDistance} <span className="text-faint">km</span>
									</span>
								) : undefined
							}
						>
							<AsyncContent
								state={state}
								onRetry={retry}
								skeleton={<ChartSkeleton />}
							>
								{(data) => (
									<TrendChart
										points={data.distance}
										color="var(--data-2)"
										unit="km"
									/>
								)}
							</AsyncContent>
						</Panel>
						<Panel
							title={m.chart_run()}
							action={
								ready ? (
									<span className="tnum text-ink text-sm tabular-nums">
										{lastRun} <span className="text-faint">%</span>
									</span>
								) : undefined
							}
						>
							<AsyncContent
								state={state}
								onRetry={retry}
								skeleton={<ChartSkeleton />}
							>
								{(data) => (
									<TrendChart
										points={data.run}
										color="var(--data-3)"
										unit="%"
									/>
								)}
							</AsyncContent>
						</Panel>
					</div>

					<Panel title={m.panel_events()}>
						<AsyncContent
							state={state}
							onRetry={retry}
							skeleton={<ListSkeleton />}
						>
							{(data) => <EventLog events={data.events} />}
						</AsyncContent>
					</Panel>
				</div>
			</main>
		</div>
	);
}

function KpiSkeleton() {
	return (
		<div className="stats stats-vertical w-full border border-base-300 bg-base-100 shadow-sm sm:stats-horizontal">
			{[
				"coverage",
				"distance",
				"uptime",
				"run",
				"success",
				"errors",
				"wait",
			].map((k) => (
				<div className="stat gap-2" key={k}>
					<div className="skeleton h-3 w-20" />
					<div className="skeleton h-7 w-24" />
					<div className="skeleton h-3 w-16" />
				</div>
			))}
		</div>
	);
}

function ChartSkeleton() {
	return <div className="skeleton h-[168px] w-full" />;
}

function ListSkeleton() {
	return (
		<div className="flex flex-col gap-2.5">
			{["a", "b", "c", "d", "e"].map((k) => (
				<div className="skeleton h-11 w-full" key={k} />
			))}
		</div>
	);
}
