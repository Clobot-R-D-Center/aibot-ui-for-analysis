import { useMemo, useState } from "react";
import { MapPanel } from "#/features/map/MapPanel";
import { getOverlays } from "#/features/map/overlays/overlay-data";
import { m } from "#/paraglide/messages.js";
import { getRobotData, type RangeDays, ROBOTS } from "./demo-data";
import { EventLog } from "./EventLog";
import { KpiStrip } from "./KpiStrip";
import { Panel } from "./Panel";
import { TopBar } from "./TopBar";
import { TrendChart } from "./TrendChart";

const MAP_SRC = "/demo-map";

export function DashboardShell() {
	const [robotId, setRobotId] = useState(ROBOTS[0].id);
	const [range, setRange] = useState<RangeDays>(7);
	const data = getRobotData(robotId, range);
	const overlays = useMemo(() => getOverlays(robotId), [robotId]);

	const lastDistance = data.distance.at(-1)?.value ?? 0;
	const lastSuccess = data.success.at(-1)?.value ?? 0;

	return (
		<div className="flex h-[100dvh] flex-col bg-canvas text-ink">
			<TopBar
				robots={ROBOTS}
				robotId={robotId}
				onRobot={setRobotId}
				range={range}
				onRange={setRange}
			/>

			<main className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
					<KpiStrip kpis={data.kpis} />

					{/* Map hero — its own bordered panel, fills a tall band above the fold */}
					<div className="h-[60vh] min-h-[380px]">
						<MapPanel src={MAP_SRC} pose={data.pose} overlays={overlays} />
					</div>

					{/* Trends — scroll down for detail */}
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
						<Panel
							title={m.chart_distance()}
							action={
								<span className="tnum text-ink text-sm tabular-nums">
									{lastDistance} <span className="text-faint">km</span>
								</span>
							}
						>
							<TrendChart
								points={data.distance}
								color="var(--data-2)"
								unit="km"
							/>
						</Panel>
						<Panel
							title={m.chart_success()}
							action={
								<span className="tnum text-ink text-sm tabular-nums">
									{lastSuccess} <span className="text-faint">%</span>
								</span>
							}
						>
							<TrendChart
								points={data.success}
								color="var(--data-3)"
								unit="%"
							/>
						</Panel>
					</div>

					<Panel title={m.panel_events()}>
						<EventLog events={data.events} />
					</Panel>
				</div>
			</main>
		</div>
	);
}
