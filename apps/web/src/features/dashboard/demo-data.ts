import { HISTORY_URL } from "#/features/live/use-fleet-live";
import type { RobotPose } from "#/features/map/ros-map";

// Representative demo data for the dashboard shell. Deterministic (no Math.random)
// so nothing flickers across re-renders. With a gateway configured,
// fetchRobotData() reads the same shape from its GET /history instead.

export interface Robot {
	id: string;
	name: string;
	pose: RobotPose;
}

export const ROBOTS: Robot[] = [
	{ id: "pinky-01", name: "Pinky-01", pose: { x: -5, y: 2, theta: 0.6 } },
	{ id: "pinky-02", name: "Pinky-02", pose: { x: 3.2, y: -1.4, theta: -2.1 } },
	{
		id: "cleanbot-a",
		name: "Cleanbot-A",
		pose: { x: -1.5, y: -4.2, theta: 1.9 },
	},
];

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
	/** live only: coverage cells — coverage % needs the map, so the UI computes it */
	cell?: number;
	cells?: Cell[];
	prevCells?: [number, number][];
}

/** The data boundary: every panel renders off one of these. Mirrors MapState. */
export type AsyncState<T> =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: T };

// deterministic pseudo-noise in [0,1) from two integer seeds
function noise(a: number, b: number): number {
	const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
	return s - Math.floor(s);
}

function seriesFor(
	seed: number,
	days: RangeDays,
	base: number,
	swing: number,
): Point[] {
	const n = days === 1 ? 24 : days;
	return Array.from({ length: n }, (_, i) => {
		const wave = Math.sin((i / n) * Math.PI * 2 + seed) * 0.5 + 0.5;
		const value = base + swing * (0.35 * wave + 0.65 * noise(seed, i));
		const label =
			days === 1
				? `${String(i).padStart(2, "0")}:00`
				: `${(i % 12) + 1}/${((i * 3) % 28) + 1}`;
		return { label, value: Math.round(value * 10) / 10 };
	});
}

// Details follow the live format: state transitions and wait-node ids.
const EVENT_POOL: Array<{ kind: EventKind; detail: string }> = [
	{ kind: "task_ok", detail: "arrived at goal" },
	{ kind: "run_end", detail: "RUN → IDLE" },
	{ kind: "obstacle", detail: "obstacle ahead" },
	{ kind: "wait", detail: "Node_04" },
	{ kind: "run_start", detail: "IDLE → RUN" },
	{ kind: "error", detail: "RUN → ERROR" },
	{ kind: "state", detail: "ERROR → IDLE" },
	{ kind: "pause", detail: "RUN → PAUSE" },
	{ kind: "online", detail: "IDLE" },
];

const seedOf = (robotId: string) =>
	robotId.split("").reduce((s, c) => s + c.charCodeAt(0), 0);

export function getRobotData(robotId: string, days: RangeDays): RobotData {
	const seed = seedOf(robotId);

	const coverage = 72 + Math.round(noise(seed, 1) * 22);
	const distance = 8 + Math.round(noise(seed, 2) * 60) / 10;
	const uptime = 78 + Math.round(noise(seed, 4) * 20);
	const run = 45 + Math.round(noise(seed, 3) * 40);
	const errors = Math.round(noise(seed, 9) * 4 * (days === 1 ? 1 : days / 3));
	const wait = Math.round(noise(seed, 10) * 90) / (days === 1 ? 4 : 1);

	const kpis: Kpi[] = [
		{
			key: "coverage",
			value: coverage,
			unit: "%",
			delta: Math.round((noise(seed, 5) - 0.4) * 80) / 10,
		},
		{
			key: "distance",
			value: distance * (days === 1 ? 1 : days / 4),
			unit: "km",
			delta: Math.round((noise(seed, 6) - 0.3) * 120) / 10,
		},
		{
			key: "uptime",
			value: uptime,
			unit: "%",
			delta: Math.round((noise(seed, 8) - 0.5) * 30) / 10,
		},
		{
			key: "run",
			value: run,
			unit: "%",
			delta: Math.round((noise(seed, 7) - 0.45) * 40) / 10,
		},
		{
			key: "success",
			value: 82 + Math.round(noise(seed, 13) * 16),
			unit: "%",
			delta: Math.round((noise(seed, 14) - 0.45) * 40) / 10,
		},
		{
			key: "errors",
			value: errors,
			unit: "",
			delta: Math.round((noise(seed, 11) - 0.5) * 400) / 10,
		},
		{
			key: "wait",
			value: wait,
			unit: "min",
			delta: Math.round((noise(seed, 12) - 0.5) * 200) / 10,
		},
	];

	const events: RobotEvent[] = EVENT_POOL.map((e, i) => ({
		...e,
		time: `${String(23 - Math.floor(i * 2.5)).padStart(2, "0")}:${String((seed * (i + 1)) % 60).padStart(2, "0")}`,
	}));

	return {
		kpis,
		distance: seriesFor(seed, days, 6, 14),
		run: seriesFor(seed + 1, days, 50, 40).map((p) => ({
			...p,
			value: Math.min(100, p.value),
		})),
		events,
	};
}

/**
 * The async data seam: the gateway's GET /history when one is configured,
 * else the deterministic mock after a short delay (so loading states show).
 */
export async function fetchRobotData(
	robotId: string,
	days: RangeDays,
	signal?: AbortSignal,
): Promise<RobotData> {
	if (HISTORY_URL) {
		const q = new URLSearchParams({ robot: robotId, days: String(days) });
		const res = await fetch(`${HISTORY_URL}?${q}`, { signal });
		if (!res.ok) throw new Error(`history: HTTP ${res.status}`);
		return res.json();
	}
	return new Promise((resolve, reject) => {
		// ponytail: demo latency only — a real data source replaces this whole body.
		const id = setTimeout(() => resolve(getRobotData(robotId, days)), 350);
		signal?.addEventListener("abort", () => {
			clearTimeout(id);
			reject(new DOMException("aborted", "AbortError"));
		});
	});
}
