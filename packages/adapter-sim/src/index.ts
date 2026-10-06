// Simulated fleet: three robots looping routes on the demo floor plan
// (apps/web/public/demo-map), cycling through runs and idles, task successes
// and failures, obstacle stops, waits, errors with alarms, battery drain and
// charge, and one robot that drops offline now and then — enough to exercise
// every panel without real robots. It's also the reference adapter.
//
// The map is "SLAM'd" too: the world starts unknown and fills in around each
// robot as it drives, so the dashboard's live map updates can be seen.
// SIM_REMAP_MS=<ms> restarts the mapping that often (a new mapping session).
import type {
	Alarm,
	FleetSink,
	Mode,
	StartAdapter,
} from "@aibot/fleet-adapter";

type XY = [number, number];
interface Route {
	length: number;
	at(s: number): XY;
}

const circle = (cx: number, cy: number, r: number): Route => ({
	length: 2 * Math.PI * r,
	at: (s) => [cx + r * Math.cos(s / r), cy + r * Math.sin(s / r)],
});

/** Closed polyline through `pts`, walked at constant speed. */
function loop(pts: XY[]): Route {
	const segs = pts.map((a, i) => {
		const b = pts[(i + 1) % pts.length];
		return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
	});
	const length = segs.reduce((s, g) => s + g.len, 0);
	return {
		length,
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

/** The simulated world: what SLAM would eventually discover. */
const WORLD = { minX: -25, minY: -3, maxX: 2, maxY: 15, res: 0.1 };
const REVEAL_M = 4.5; // sensor range: cells this close to a robot become known
const COLS = Math.round((WORLD.maxX - WORLD.minX) / WORLD.res);
const ROWS = Math.round((WORLD.maxY - WORLD.minY) / WORLD.res);

/** True occupancy at a point: outer walls, two inner walls and a box, clear of the routes. */
function wall(x: number, y: number): boolean {
	const edge = 0.2;
	return (
		x < WORLD.minX + edge ||
		x > WORLD.maxX - edge ||
		y < WORLD.minY + edge ||
		y > WORLD.maxY - edge ||
		(Math.abs(y - 8) < 0.15 && x < -12) || // corridor wall
		(Math.abs(x + 12) < 0.15 && y < 4) || // room divider
		(x > -21 && x < -19 && y > 10 && y < 11.5) // a crate
	);
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
	battery: number;
	alarms: Alarm[];
	/** robots that drop offline: [every ms, for ms] */
	flaky?: [number, number];
	nextDrop: number;
}

const start: StartAdapter = (sink: FleetSink, env) => {
	const remapMs = Number(env.SIM_REMAP_MS ?? 0);
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
		battery: 60 + Math.random() * 35,
		alarms: [],
		flaky,
		nextDrop: flaky ? now + flaky[0] : Infinity,
	});
	const bots = [
		bot("sim-1", circle(-18, 3, 3)),
		bot(
			"sim-2",
			loop([
				[-8, 6],
				[-2, 6],
				[-2, 7],
				[-8, 7],
			]),
		),
		bot(
			"sim-3",
			loop([
				[-10, 9],
				[-4, 9],
				[-4, 12],
				[-10, 12],
			]),
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

	for (const b of bots) sink.link(b.name, true);

	// SLAM'd map: -1 until a robot has been within REVEAL_M, then the truth.
	const grid = new Int8Array(COLS * ROWS).fill(-1);
	const reveal = (x: number, y: number) => {
		let changed = false;
		const r = Math.ceil(REVEAL_M / WORLD.res);
		const c0 = Math.floor((x - WORLD.minX) / WORLD.res);
		const r0 = Math.floor((y - WORLD.minY) / WORLD.res);
		for (let row = Math.max(0, r0 - r); row < Math.min(ROWS, r0 + r); row++)
			for (let col = Math.max(0, c0 - r); col < Math.min(COLS, c0 + r); col++) {
				const i = row * COLS + col;
				if (grid[i] !== -1 || (col - c0) ** 2 + (row - r0) ** 2 > r * r)
					continue;
				const cx = WORLD.minX + (col + 0.5) * WORLD.res;
				const cy = WORLD.minY + (row + 0.5) * WORLD.res;
				grid[i] = wall(cx, cy) ? 100 : 0;
				changed = true;
			}
		return changed;
	};
	const mapGrid = {
		resolution: WORLD.res,
		origin: { x: WORLD.minX, y: WORLD.minY, yaw: 0 },
		width: COLS,
		height: ROWS,
		data: grid,
		session: "sim-run-1",
	};

	let ticks = 0;
	let nextRemap = Date.now() + remapMs;
	let run = 1;
	const timer = setInterval(() => {
		const t = Date.now();
		ticks++;
		for (const b of bots) {
			// Flaky robot: offline for a while, then back where it was.
			if (t >= b.nextDrop && b.flaky) {
				b.online = !b.online;
				b.nextDrop = t + (b.online ? b.flaky[0] : b.flaky[1]);
				sink.link(b.name, b.online);
				sink.state(b.name, {
					online: b.online,
					mode: b.mode,
					label: b.mode.toUpperCase(),
				});
			}
			if (!b.online) continue;

			if (t >= b.until) {
				if (b.mode === "run") {
					if (Math.random() < 0.1) {
						b.alarms = [
							{ code: 301, level: "ERROR", text: "motor overcurrent" },
						];
						sink.alarms(b.name, b.alarms);
						setMode(b, "error", 8_000, t);
					} else {
						const ok = Math.random() < 0.85;
						sink.task(
							b.name,
							ok,
							ok ? "arrived at goal" : "blocked by obstacle",
						);
						setMode(b, "idle", 10_000 + Math.random() * 20_000, t);
					}
				} else if (b.mode === "error") {
					b.alarms = [];
					sink.alarms(b.name, b.alarms);
					sink.task(b.name, false, "aborted by error");
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
						b.holdUntil = t + 3_000;
						sink.event(b.name, "obstacle", "obstacle ahead");
					} else if (chance(1 / 90)) {
						b.waitingAt = `N${1 + Math.floor(Math.random() * 12)}`;
						b.holdUntil = t + 6_000;
						sink.wait(b.name, b.waitingAt);
					} else {
						b.s += SPEED * (TICK / 1000);
					}
				}
				b.battery = Math.max(5, b.battery - 0.03 * (TICK / 1000));
			} else if (b.mode === "idle") {
				b.battery = Math.min(100, b.battery + 0.15 * (TICK / 1000));
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
		if (remapMs > 0 && t >= nextRemap) {
			nextRemap = t + remapMs;
			grid.fill(-1); // a new SLAM run: everything unknown again
			mapGrid.session = `sim-run-${++run}`; // we know it restarted: say so
		}
		if (ticks % 10 === 0) {
			let grew = false;
			for (const b of online) {
				const [x, y] = b.route.at(b.s);
				grew = reveal(x, y) || grew;
			}
			if (grew) sink.map(mapGrid);
		}
		if (ticks % 10 === 0)
			for (const b of bots) {
				sink.state(b.name, {
					online: b.online,
					mode: b.mode,
					label: b.mode.toUpperCase(),
				});
				if (b.online)
					sink.battery(b.name, {
						charge: Math.round(b.battery * 10) / 10,
						charging: b.mode === "idle" && b.battery < 100,
						eStop: false,
					});
			}
	}, TICK);

	return { stop: () => clearInterval(timer) };
};

export default start;
