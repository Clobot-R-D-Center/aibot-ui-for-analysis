import type { XY } from "#/features/map/overlays/overlay-data";
import type { RobotPose } from "#/features/map/ros-map";

// Folds the gateway's live messages into one fleet snapshot. The gateway
// speaks one neutral protocol whatever robots its adapter talks to — see
// LiveMessage in apps/gateway/src/main.ts.

export interface LiveRobot {
	name: string;
	pose: RobotPose | null;
	/** local receive time (ms) of the last pose; never the robot's own clock */
	seenAt: number;
	/** planned path (map frame); kept until replaced */
	plan: XY[];
	online: boolean;
	/** normalized: idle | run | pause | error | other */
	mode: string;
	/** the robot stack's own name for its state */
	label: string;
}

export type Fleet = Record<string, LiveRobot>;

const blank = (name: string): LiveRobot => ({
	name,
	pose: null,
	seenAt: 0,
	plan: [],
	online: true,
	mode: "other",
	label: "",
});

// Off the wire, so nothing is trusted: every field read below is checked, and a
// malformed entry is skipped (this runs inside a React state updater, where a
// throw would take down the dashboard instead of dropping one packet).
// biome-ignore lint/suspicious/noExplicitAny: untrusted JSON, narrowed field by field below
type Wire = any;

const isNum = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Returns a new fleet with `msg` applied; unknown types and bad entries are ignored. */
export function applyMessage(fleet: Fleet, msg: unknown, now = 0): Fleet {
	const m = (msg ?? {}) as Wire;
	if (typeof m !== "object") return fleet;
	const next = { ...fleet };
	const robot = typeof m.robot === "string" && m.robot ? m.robot : null;
	const patch = (name: string, p: Partial<LiveRobot>) => {
		next[name] = { ...(next[name] ?? blank(name)), ...p };
	};

	switch (m.type) {
		case "poses": {
			if (!Array.isArray(m.poses)) return fleet;
			for (const p of m.poses)
				if (
					typeof p?.robot === "string" &&
					isNum(p.x) &&
					isNum(p.y) &&
					isNum(p.theta)
				)
					patch(p.robot, {
						pose: { x: p.x, y: p.y, theta: p.theta },
						seenAt: now,
					});
			return next;
		}
		case "state":
			if (!robot || typeof m.online !== "boolean") return fleet;
			patch(robot, {
				online: m.online,
				mode: str(m.mode),
				label: str(m.label),
			});
			return next;
		case "plan": {
			if (!robot || !Array.isArray(m.points)) return fleet;
			const ok = m.points.every(
				(p: Wire) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]),
			);
			if (!ok) return fleet;
			patch(robot, { plan: m.points.map((p: number[]) => [p[0], p[1]]) });
			return next;
		}
		default:
			return fleet;
	}
}

/**
 * No pose for this long → the position is not current: the source went quiet
 * (gateway's upstream down, robot unreachable) while our WebSocket stayed open.
 */
// ponytail: tuning knob — poses arrive at ~10 Hz; raise it if a source pauses longer
export const STALE_MS = 3000;

export function isStale(r: LiveRobot, now: number): boolean {
	return !r.online || now - r.seenAt > STALE_MS;
}
