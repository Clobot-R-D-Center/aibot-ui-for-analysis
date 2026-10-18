import { useCallback, useEffect, useMemo, useState } from "react";
import { MAP_URL, useFleetLive } from "#/features/live/use-fleet-live";
import {
	type CellGrid,
	coveragePct,
	heatFrom,
	mapFreeGrid,
} from "#/features/map/coverage";
import { MapPanel } from "#/features/map/MapPanel";
import { useRosMap } from "#/features/map/use-ros-map";
import { type Range, Timeline } from "#/features/timeline/Timeline";
import { LIVE_DAY, type Window } from "#/features/timeline/time-view";
import { useTimeline } from "#/features/timeline/use-timeline";
import { m } from "#/paraglide/messages.js";
import { AsyncContent } from "./AsyncContent";
import { EventLog } from "./EventLog";
import { KpiStrip } from "./KpiStrip";
import { Panel } from "./Panel";
import type { Kpi, RobotData } from "./robot-data";
import { TopBar } from "./TopBar";
import { useRobotData } from "./use-robot-data";

const round1 = (v: number) => Math.round(v * 10) / 10;

/** History leaves coverage to us: it needs the map. */
function withCoverage(data: RobotData, grid: CellGrid | null): Kpi[] {
	if (!grid) return data.kpis;
	const cur = coveragePct(grid, data.cells);
	const prev = coveragePct(grid, data.prevCells);
	const coverage: Kpi = {
		key: "coverage",
		value: round1(cur),
		unit: "%",
		delta: prev > 0 ? round1(((cur - prev) / prev) * 100) : 0,
	};
	return [coverage, ...data.kpis];
}

/** Wall clock, ticking so a live window slides. */
function useNow(ms: number) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), ms);
		return () => clearInterval(id);
	}, [ms]);
	return now;
}

export function DashboardShell() {
	const live = useFleetLive();
	const [picked, setPicked] = useState("");
	const now = useNow(1000);
	// What the timeline shows; the panels follow a selection inside it, or all of it.
	const [view, setView] = useState<Window>(LIVE_DAY);
	const [selection, setSelection] = useState<Range | null>(null);
	// ponytail: the moment the map will show (time travel); phase 3 wires it in
	const [cursor, setCursor] = useState<number | null>(null);
	const panels: Window = selection
		? { span: selection.to - selection.from, end: selection.to }
		: view;
	const [buckets, setBuckets] = useState(0);
	const onWidth = useCallback(
		(px: number) => setBuckets(Math.min(400, Math.max(10, Math.floor(px / 4)))),
		[],
	);
	const timeline = useTimeline(view, buckets);
	// Robots to pick: the live ones with a pose (a fleet source may also report
	// participants that never send one, e.g. a central planner), then those the
	// timeline has records of, so history stays readable with none online.
	const robots = [
		...new Set([
			...live.robots.filter((r) => r.pose).map((r) => r.name),
			...(timeline?.robots.map((r) => r.robot) ?? []),
		]),
	].map((name) => ({ id: name, name }));
	// The lists arrive after the first render; fall back to the first robot.
	const robotId = robots.some((r) => r.id === picked)
		? picked
		: (robots[0]?.id ?? "");
	// A new mapping session changes which coverage cells apply: reload then.
	const { state, retry } = useRobotData(robotId, panels, {
		key: live.mapSession ?? "",
	});
	const [mapNonce, setMapNonce] = useState(0);
	// The gateway's map, reloaded whenever its version changes.
	const map = useRosMap(
		live.mapVersion ? MAP_URL : null,
		`${live.mapVersion}:${mapNonce}`,
	);

	const ready = state.status === "ready" ? state.data : null;

	const cell = ready?.cell;
	const loaded = map.status === "ready" ? map.map : null;
	// ponytail: reads every map pixel once per map/cell size (~ms for a few Mpx)
	const grid = useMemo(
		() => (loaded && cell ? mapFreeGrid(loaded, cell) : null),
		[loaded, cell],
	);
	const heat = useMemo(
		() => (grid && ready ? heatFrom(grid, ready.cells) : undefined),
		[grid, ready],
	);

	return (
		<div className="flex h-[100dvh] flex-col bg-canvas text-ink">
			<TopBar />

			<main className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
					<Timeline
						data={timeline}
						now={now}
						view={view}
						setView={setView}
						selection={selection}
						setSelection={setSelection}
						cursor={cursor}
						setCursor={setCursor}
						selected={robotId}
						onWidth={onWidth}
					/>

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
							choices={robots}
							onSelect={setPicked}
							live={live}
							heat={heat}
						/>
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
			{["coverage", "distance", "uptime", "run", "errors", "wait"].map((k) => (
				<div className="stat gap-2" key={k}>
					<div className="skeleton h-3 w-20" />
					<div className="skeleton h-7 w-24" />
					<div className="skeleton h-3 w-16" />
				</div>
			))}
		</div>
	);
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
