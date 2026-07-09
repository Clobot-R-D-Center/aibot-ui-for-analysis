import type { RobotPose } from "#/features/map/ros-map";

// Representative demo data for the dashboard shell. Deterministic (no Math.random)
// so nothing flickers across re-renders. Real data replaces getRobotData() later.

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

export interface Kpi {
	key: "coverage" | "distance" | "success" | "uptime";
	value: number;
	unit: string;
	/** signed % change vs previous period */
	delta: number;
}

export interface Point {
	/** short x label, e.g. "7/3" or "14:00" */
	label: string;
	value: number;
}

export type EventKind =
	| "task_start"
	| "task_done"
	| "warning"
	| "avoid"
	| "dock";

export interface RobotEvent {
	time: string;
	kind: EventKind;
	detail: string;
}

export interface RobotData {
	pose: RobotPose;
	kpis: Kpi[];
	distance: Point[]; // km per bucket
	success: Point[]; // % per bucket
	events: RobotEvent[];
}

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

const EVENT_POOL: Array<{ kind: EventKind; detail: string }> = [
	{ kind: "task_done", detail: "Cleaning route B completed" },
	{ kind: "avoid", detail: "Obstacle avoided near dock" },
	{ kind: "task_start", detail: "Started patrol route A" },
	{ kind: "warning", detail: "Low battery (18%)" },
	{ kind: "dock", detail: "Returned to charging dock" },
	{ kind: "task_done", detail: "Zone 3 coverage complete" },
	{ kind: "avoid", detail: "Pedestrian avoided in corridor" },
];

const seedOf = (robotId: string) =>
	robotId.split("").reduce((s, c) => s + c.charCodeAt(0), 0);

export function getRobotData(robotId: string, days: RangeDays): RobotData {
	const robot = ROBOTS.find((r) => r.id === robotId) ?? ROBOTS[0];
	const seed = seedOf(robotId);

	const coverage = 72 + Math.round(noise(seed, 1) * 22);
	const distance = 8 + Math.round(noise(seed, 2) * 60) / 10;
	const success = 88 + Math.round(noise(seed, 3) * 10);
	const uptime = days === 1 ? 18 + Math.round(noise(seed, 4) * 5) : days * 8;

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
			key: "success",
			value: success,
			unit: "%",
			delta: Math.round((noise(seed, 7) - 0.45) * 40) / 10,
		},
		{
			key: "uptime",
			value: uptime,
			unit: "h",
			delta: Math.round((noise(seed, 8) - 0.5) * 30) / 10,
		},
	];

	const events: RobotEvent[] = EVENT_POOL.map((e, i) => ({
		...e,
		time: `${String(23 - Math.floor(i * 2.5)).padStart(2, "0")}:${String((seed * (i + 1)) % 60).padStart(2, "0")}`,
	}));

	return {
		pose: robot.pose,
		kpis,
		distance: seriesFor(seed, days, 6, 14),
		success: seriesFor(seed + 1, days, 82, 16).map((p) => ({
			...p,
			value: Math.min(100, p.value),
		})),
		events,
	};
}
