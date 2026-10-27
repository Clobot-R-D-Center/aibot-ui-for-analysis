// Demo history: the simulator on a mocked clock, 08–20 h daily for the last
// DAYS days, recorded the way the gateway records it. Takes ~20 s on tmpfs;
// on disk every row is an fsync and it takes ~20 min.
// usage: node scripts/demo/history.mts <history.db> [DAYS=14]
import { rmSync } from "node:fs";
import { mock } from "node:test";
import { fileURLToPath } from "node:url";

const DB = process.argv[2];
const DAYS = Number(process.argv[3] ?? 14);
if (!DB) throw new Error("usage: history.mts <history.db> [days]");
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) rmSync(f, { force: true });

const H = 3_600_000;
const realNow = Date.now();
const day0 = new Date(realNow).setHours(0, 0, 0, 0) - DAYS * 24 * H;
// Before the imports below: they read the clock and start the sim's timers.
mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: day0 });
const { openHistory } = await import("../../apps/gateway/src/history.ts");
const { readMap } = await import("../../apps/gateway/src/map.ts");
const { default: start } = await import(
	"../../packages/adapter-sim/src/index.ts"
);

const history = openHistory(DB, Date.now());
// The map session the gateway will find for the sim's map, so coverage counts.
const mapDir = fileURLToPath(
	new URL("../../packages/adapter-sim/map", import.meta.url),
);
history.mapSeen(Date.now(), readMap(mapDir).version);

// As apps/gateway/src/main.ts records (no live relay).
const sink = {
	state: (r, s) => history.state(r, Date.now(), s),
	poses: (ps) => {
		const t = Date.now();
		for (const { robot, pose } of ps)
			history.pose(robot, t, pose.x, pose.y, pose.theta);
	},
	plan() {},
	place: (r, at) => history.place(r, Date.now(), at),
	wait: (r, at) => history.wait(r, Date.now(), at),
	lost: () => history.markAllOffline(Date.now()),
};

// One sim tick (100 ms) per step: a longer tick fires an interval only once.
const advanceTo = (t: number) => {
	while (Date.now() < t) mock.timers.tick(Math.min(100, t - Date.now()));
};
for (let d = 0; d <= DAYS; d++) {
	const base = day0 + d * 24 * H;
	// Shifts start a little after 08 h and end around 20 h, or a bit before now.
	const on = base + 8 * H + Math.random() * H;
	const off = Math.min(
		realNow - 120_000,
		base + 19 * H + Math.random() * 2 * H,
	);
	if (on >= off) break;
	advanceTo(on);
	const sim = await start(sink, {});
	advanceTo(off);
	sim.stop();
	history.markAllOffline(Date.now());
	console.log(`[demo] ${new Date(base).toDateString()}`);
}
