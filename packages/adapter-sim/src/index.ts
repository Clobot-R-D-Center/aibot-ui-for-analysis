// Simulated fleet: three robots looping routes in a small simulated world,
// cycling through runs, idles, waits and errors, and one robot that drops
// offline now and then — enough to exercise every panel without real robots.
// It's also the reference adapter. The world is the map folder ../map (the
// gateway serves its map.yaml, and the graph and zones in site.json); the routes
// keep clear of its walls and follow that graph: each robot reports the node
// or link it is on, and waits at the next node ahead.
import type {
	FleetSink,
	Mode,
	Place,
	StartAdapter,
} from "@aibot/fleet-adapter";

type XY = [number, number];
interface Route {
	length: number;
	at(s: number): XY;
	/** the graph nodes on the route (numbers of site.json's N…), by distance along it */
	stops: { s: number; n: number }[];
}

/** A circle walked counter-clockwise, its nodes at 0°, 90°, 180°, 270°. */
export const circle = (
	cx: number,
	cy: number,
	r: number,
	nodes: number[],
): Route => ({
	length: 2 * Math.PI * r,
	at: (s) => [cx + r * Math.cos(s / r), cy + r * Math.sin(s / r)],
	stops: nodes.map((n, i) => ({ s: (r * i * Math.PI) / 2, n })),
});

/** Closed polyline through `pts` (node numbers `nodes`), walked at constant speed. */
export function loop(pts: XY[], nodes: number[]): Route {
	const segs = pts.map((a, i) => {
		const b = pts[(i + 1) % pts.length];
		return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
	});
	const length = segs.reduce((s, g) => s + g.len, 0);
	let s0 = 0;
	const stops = segs.map((g, i) => {
		const stop = { s: s0, n: nodes[i] };
		s0 += g.len;
		return stop;
	});
	return {
		length,
		stops,
		at(s) {
			let d = ((s % length) + length) % length;
			for (const g of segs) {
				if (d <= g.len) {
					const f = d / g.len;
					return [
						g.a[0] + (g.b[0] - g.a[0]) * f,
						g.a[1] + (g.b[1] - g.a[1]) * f,
					];
				}
				d -= g.len;
			}
			return pts[0];
		},
	};
}

const NODE_M = 0.3; // this close to a node is "at" it, as a fleet manager would say

/** The node the robot is at, else the link it is on, as site.json names them. */
export function placeOf(route: Route, s: number): Place {
	const d = ((s % route.length) + route.length) % route.length;
	const { stops } = route;
	for (const p of stops) {
		const gap = Math.abs(d - p.s);
		if (Math.min(gap, route.length - gap) < NODE_M) return { node: `N${p.n}` };
	}
	const i = stops.findLastIndex((p) => p.s <= d);
	return { link: `L${stops[i].n}-${stops[(i + 1) % stops.length].n}` };
}

/** The next node ahead of the robot. */
export function nextNode(route: Route, s: number): string {
	const d = ((s % route.length) + route.length) % route.length;
	return `N${(route.stops.find((p) => p.s > d + NODE_M) ?? route.stops[0]).n}`;
}

const TICK = 100; // ms
const SPEED = 0.6; // m/s
const chance = (perSecond: number) => Math.random() < perSecond * (TICK / 1000);

interface Bot {
	name: string;
	route: Route;
	s: number;
	online: boolean;
	mode: Mode;
	until: number; // when the current mode ends
	holdUntil: number; // stopped for an obstacle or a wait until then
	waitingAt: string | null;
	/** robots that drop offline: [every ms, for ms] */
	flaky?: [number, number];
	nextDrop: number;
}

const start: StartAdapter = (sink: FleetSink) => {
	const now = Date.now();
	const bot = (name: string, route: Route, flaky?: [number, number]): Bot => ({
		name,
		route,
		s: Math.random() * route.length,
		online: true,
		mode: "run",
		until: now + 20_000 + Math.random() * 40_000,
		holdUntil: 0,
		waitingAt: null,
		flaky,
		nextDrop: flaky ? now + flaky[0] : Infinity,
	});
	const bots = [
		bot("sim-1", circle(-18, 3, 3, [9, 10, 11, 12])),
		bot(
			"sim-2",
			loop(
				[
					[-8, 6],
					[-2, 6],
					[-2, 7],
					[-8, 7],
				],
				[1, 2, 3, 4],
			),
		),
		bot(
			"sim-3",
			loop(
				[
					[-10, 9],
					[-4, 9],
					[-4, 12],
					[-10, 12],
				],
				[5, 6, 7, 8],
			),
			[240_000, 20_000],
		),
	];

	const heading = (b: Bot) => {
		const [x0, y0] = b.route.at(b.s);
		const [x1, y1] = b.route.at(b.s + 0.1);
		return Math.atan2(y1 - y0, x1 - x0);
	};
	const plan = (b: Bot): [number, number][] =>
		b.mode === "run"
			? Array.from({ length: 20 }, (_, i) => b.route.at(b.s + i * 0.5))
			: [];
	const setMode = (b: Bot, mode: Mode, ms: number, t: number) => {
		b.mode = mode;
		b.until = t + ms;
		sink.plan(b.name, plan(b));
	};

	let ticks = 0;
	const timer = setInterval(() => {
		const t = Date.now();
		ticks++;
		for (const b of bots) {
			// Flaky robot: offline for a while, then back where it was.
			if (t >= b.nextDrop && b.flaky) {
				b.online = !b.online;
				b.nextDrop = t + (b.online ? b.flaky[0] : b.flaky[1]);
				sink.state(b.name, {
					online: b.online,
					mode: b.mode,
					label: b.mode.toUpperCase(),
				});
			}
			if (!b.online) continue;

			if (t >= b.until) {
				if (b.mode === "run") {
					if (Math.random() < 0.1) setMode(b, "error", 8_000, t);
					else setMode(b, "idle", 10_000 + Math.random() * 20_000, t);
				} else if (b.mode === "error") {
					setMode(b, "idle", 15_000, t);
				} else {
					setMode(b, "run", 40_000 + Math.random() * 60_000, t);
				}
			}

			if (b.mode === "run") {
				if (t >= b.holdUntil) {
					if (b.waitingAt) {
						b.waitingAt = null;
						sink.wait(b.name, null);
					}
					if (chance(1 / 60)) {
						b.holdUntil = t + 3_000; // an obstacle
					} else if (chance(1 / 90)) {
						b.waitingAt = nextNode(b.route, b.s);
						b.holdUntil = t + 6_000;
						sink.wait(b.name, b.waitingAt);
					} else {
						b.s += SPEED * (TICK / 1000);
					}
				}
			}
		}

		const online = bots.filter((b) => b.online);
		sink.poses(
			online.map((b) => {
				const [x, y] = b.route.at(b.s);
				return { robot: b.name, pose: { x, y, theta: heading(b) } };
			}),
		);
		if (ticks % 5 === 0) for (const b of online) sink.plan(b.name, plan(b));
		if (ticks % 10 === 0)
			for (const b of bots) {
				sink.state(b.name, {
					online: b.online,
					mode: b.mode,
					label: b.mode.toUpperCase(),
				});
				if (b.online) sink.place(b.name, placeOf(b.route, b.s));
			}
	}, TICK);

	return { stop: () => clearInterval(timer) };
};

export default start;
