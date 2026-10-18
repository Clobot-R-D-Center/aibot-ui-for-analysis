import { GATEWAY_HTTP } from "#/features/live/use-fleet-live";

// The robot's history as the gateway's GET /history returns it (see
// apps/gateway/src/history.ts), and the fetch every dashboard panel uses.

export type KpiKey =
	| "coverage"
	| "distance"
	| "uptime"
	| "run"
	| "errors"
	| "wait";

export interface Kpi {
	key: KpiKey;
	value: number;
	unit: string;
	/** signed % change vs previous period */
	delta: number;
}

/** Mirrors the gateway's history events (apps/gateway/src/history.ts). */
export type EventKind =
	| "online"
	| "offline"
	| "run_start"
	| "run_end"
	| "error"
	| "pause"
	| "state"
	| "wait";

export interface RobotEvent {
	/** ms */
	t: number;
	time: string;
	kind: EventKind;
	detail: string;
}

/** World-aligned visited cell: [floor(x / cell), floor(y / cell), samples]. */
export type Cell = [number, number, number];

export interface RobotData {
	kpis: Kpi[];
	events: RobotEvent[];
	/** coverage cells (cell size in m) — coverage % needs the map, so the UI computes it */
	cell: number;
	cells: Cell[];
	prevCells: [number, number][];
}

/** The data boundary: every panel renders off one of these. Mirrors MapState. */
export type AsyncState<T> =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: T };

/** KPIs (deltas against the stretch before), events and coverage over [from, to). */
export async function fetchRobotData(
	robotId: string,
	range: { from: number; to: number },
	signal?: AbortSignal,
): Promise<RobotData> {
	const q = new URLSearchParams({
		robot: robotId,
		from: String(Math.round(range.from)),
		to: String(Math.round(range.to)),
	});
	const res = await fetch(`${GATEWAY_HTTP}/history?${q}`, { signal });
	if (!res.ok) throw new Error(`history: HTTP ${res.status}`);
	return res.json();
}
