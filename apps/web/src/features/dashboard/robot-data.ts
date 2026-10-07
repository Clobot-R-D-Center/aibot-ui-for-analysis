import { HISTORY_URL } from "#/features/live/use-fleet-live";

// The robot's history as the gateway's GET /history returns it (see
// apps/gateway/src/history.ts), and the fetch every dashboard panel uses.

export type RangeDays = 1 | 7 | 30;
export const RANGES: RangeDays[] = [1, 7, 30];

export type KpiKey =
	| "coverage"
	| "distance"
	| "uptime"
	| "run"
	| "success"
	| "errors"
	| "wait";

export interface Kpi {
	key: KpiKey;
	/** null = no data for it (e.g. the source reports no tasks) */
	value: number | null;
	unit: string;
	/** signed % change vs previous period */
	delta: number;
}

export interface Point {
	/** short x label, e.g. "7/3" or "14:00" */
	label: string;
	value: number;
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
	| "wait"
	| "task_ok"
	| "task_fail"
	| "alarm"
	| "obstacle"
	| "recovery"
	| "recovery_fail"
	| "zone"
	| "pending";

export interface RobotEvent {
	time: string;
	kind: EventKind;
	detail: string;
}

/** World-aligned visited cell: [floor(x / cell), floor(y / cell), samples]. */
export type Cell = [number, number, number];

export interface RobotData {
	kpis: Kpi[];
	distance: Point[]; // km per bucket
	run: Point[]; // % of online time in RUN, per bucket
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

export async function fetchRobotData(
	robotId: string,
	days: RangeDays,
	signal?: AbortSignal,
): Promise<RobotData> {
	const q = new URLSearchParams({ robot: robotId, days: String(days) });
	const res = await fetch(`${HISTORY_URL}?${q}`, { signal });
	if (!res.ok) throw new Error(`history: HTTP ${res.status}`);
	return res.json();
}
