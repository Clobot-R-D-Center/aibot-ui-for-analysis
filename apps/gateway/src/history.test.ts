import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { Mode } from "@aibot/fleet-adapter";
import {
	bucketsFor,
	intervals,
	isNewSession,
	msWhere,
	openHistory,
	sweptCells,
} from "./history.ts";

const at = (h: number, m = 0, s = 0) => new Date(2026, 9, 6, h, m, s).getTime();

test("buckets end at the current hour / day", () => {
	const now = at(12, 30);
	const h = bucketsFor(1, now);
	assert.equal(h.n, 24);
	assert.equal(h.from + 23 * h.size, at(12)); // last bucket holds "now"
	const d = bucketsFor(7, now);
	assert.equal(d.from + 6 * d.size, at(0));
});

test("intervals clip to the window and start from the prior value", () => {
	const ivs = intervals(
		"a",
		[
			{ t: 10, v: "b" },
			{ t: 20, v: "a" },
		],
		0,
		30,
	);
	assert.deepEqual(ivs, [
		{ start: 0, end: 10, v: "a" },
		{ start: 10, end: 20, v: "b" },
		{ start: 20, end: 30, v: "a" },
	]);
	assert.equal(
		msWhere(ivs, (v) => v === "a", 5, 25),
		10,
	);
	assert.deepEqual(intervals(undefined, [{ t: 10, v: 1 }], 0, 20), [
		{ start: 10, end: 20, v: 1 },
	]);
});

test("records a morning and aggregates it", () => {
	const h = openHistory(":memory:");
	const robot = "robot-a";
	const st = (t: number, mode: Mode, label: string, online = true) =>
		h.state(robot, t, { online, mode, label });

	h.pose(robot, at(9), 0, 0); // unknown/offline robot: a stale pose is not travel
	st(at(10), "idle", "IDLE");
	for (let i = 0; i <= 600; i++) h.pose(robot, at(10) + i * 1000, 4 * i, 0); // 2.4 km
	h.pose(robot, at(10) + 600_500, 9999, 0); // < 1 s since the last sample: ignored
	h.pose(robot, at(10, 10, 1), 2400.01, 0); // jitter: no row
	h.pose(robot, at(10, 10, 30), 2500, 0); // after a gap: new segment, no distance
	st(at(10, 30), "run", "RUN");
	st(at(10, 30), "run", "RUN"); // repeats are deduped
	h.task(robot, at(10, 50), true, "arrived");
	h.event(robot, at(10, 55), "obstacle", "front");
	st(at(11), "error", "ERROR");
	h.wait(robot, at(11), "N1");
	h.alarms(robot, at(11), [{ code: 7, level: "WARN", text: "low battery" }]);
	h.alarms(robot, at(11, 5), [{ code: 7, level: "WARN", text: "low battery" }]); // still active: not re-raised
	st(at(11, 10), "idle", "IDLE");
	h.wait(robot, at(11, 20), null);
	h.markAllOffline(at(12)); // source lost
	h.pose(robot, at(12, 10), 0, 0); // not online any more

	const r = h.query(robot, 1, at(12, 30));
	const kpi = Object.fromEntries(r.kpis.map((k) => [k.key, k.value]));
	assert.equal(kpi.distance, 2.4);
	assert.equal(kpi.uptime, 8.5); // 2 h of 23.5 h elapsed
	assert.equal(kpi.run, 25); // 30 min run / 120 min online
	assert.equal(kpi.success, 100);
	assert.equal(kpi.errors, 1);
	assert.equal(kpi.wait, 20);
	assert.ok(r.kpis.every((k) => k.delta === 0)); // empty previous period

	const bucket = (label: string) => r.run.find((p) => p.label === label);
	assert.equal(bucket("10:00")?.value, 50);
	assert.equal(bucket("11:00")?.value, 0);
	assert.equal(r.distance.find((p) => p.label === "10:00")?.value, 2.4);

	// swept band along y = 0: a cell between two samples is covered, one beyond
	// the 0.35 m radius isn't (0.1 m cells)
	const has = (cx: number, cy: number) =>
		r.cells.some(([x, y]) => x === cx && y === cy);
	assert.ok(has(20, 0)); // x = 2.05 m, between the samples at 0 and 4 m
	assert.ok(has(20, -3)); // y = -0.25 m: inside the band
	assert.ok(!has(20, 4)); // y = 0.45 m: outside
	assert.deepEqual(
		r.events.map((e) => [e.time, e.kind, e.detail]),
		[
			["12:00", "offline", "unknown"],
			["11:10", "state", "ERROR → IDLE"],
			["11:00", "error", "RUN → ERROR"],
			["11:00", "wait", "N1"],
			["11:00", "alarm", "[WARN] 7 low battery"],
			["10:55", "obstacle", "front"],
			["10:50", "task_ok", "arrived"],
			["10:30", "run_start", "IDLE → RUN"],
			["10:00", "online", "IDLE"],
		],
	);
});

test("no tasks recorded means no success rate, not 0 %", () => {
	const h = openHistory(":memory:");
	const r = h.query("nobody", 1, Date.now());
	assert.equal(r.kpis.find((k) => k.key === "success")?.value, null);
});

test("a restart closes a wait left open by a crash", () => {
	const file = join(mkdtempSync(join(tmpdir(), "hist-")), "h.db");
	const robot = "robot-a";
	const before = openHistory(file, at(10));
	before.state(robot, at(10), { online: true, mode: "run", label: "RUN" });
	before.wait(robot, at(10, 30), "N1");
	// crash at ~10:30, restart at 11:00: the restart closes the open wait
	const after = openHistory(file, at(11));
	after.state(robot, at(11, 30), { online: true, mode: "idle", label: "IDLE" });
	after.wait(robot, at(11, 40), null);
	const r = after.query(robot, 1, at(12));
	assert.equal(r.kpis.find((k) => k.key === "wait")?.value, 30); // 10:30–11:00
	assert.equal(r.kpis.find((k) => k.key === "uptime")?.value, 6.5); // 1.5 h online (10–11, 11:30–12) of 23 h elapsed
});

test("pruning keeps the state that still holds after the cutoff", () => {
	const h = openHistory(":memory:");
	const robot = "robot-a";
	const day = 24 * 60 * 60 * 1000;
	const now = at(12);
	h.state(robot, now - 70 * day, { online: true, mode: "idle", label: "IDLE" });
	h.prune(62, now);
	const uptime = h
		.query(robot, 1, now)
		.kpis.find((k) => k.key === "uptime")?.value;
	assert.equal(uptime, 100); // online, unchanged, for the whole day
});

test("a map that shrinks a lot or changes resolution is a new session", () => {
	const prev = { known: 1000, resolution: 0.05 };
	assert.ok(!isNewSession(prev, { known: 1500, resolution: 0.05 })); // grew
	assert.ok(!isNewSession(prev, { known: 900, resolution: 0.05 })); // loop closure trim
	assert.ok(isNewSession(prev, { known: 300, resolution: 0.05 })); // restarted
	assert.ok(isNewSession(prev, { known: 1000, resolution: 0.1 }));
});

test("coverage cells are kept per mapping session", () => {
	const h = openHistory(":memory:", at(9));
	const robot = "robot-a";
	h.state(robot, at(9), { online: true, mode: "run", label: "RUN" });
	const first = h.mapSeen(at(9), { known: 100, resolution: 0.05 });
	assert.equal(h.mapSeen(at(9, 30), { known: 400, resolution: 0.05 }), first); // grows
	for (let i = 0; i < 3; i++) h.pose(robot, at(10) + i * 1000, i, 0); // first session: 3 cells, 1 m apart
	const second = h.mapSeen(at(11), { known: 50, resolution: 0.05 }); // SLAM restarted
	assert.notEqual(second, first);
	h.pose(robot, at(11, 30), 40, 40);

	const r = h.query(robot, 1, at(12));
	assert.equal(r.session?.id, second);
	// only the new session's travel: a disk around (40, 40), none near the origin
	assert.ok(r.cells.length > 0);
	assert.ok(
		r.cells.every(
			([cx, cy]) => Math.abs(cx - 400) <= 4 && Math.abs(cy - 400) <= 4,
		),
	);
	assert.equal(r.kpis.find((k) => k.key === "distance")?.value, 0); // time KPIs untouched (2 m ≈ 0.0 km)

	// an id from the adapter wins over guessing
	assert.equal(
		h.mapSeen(at(12), { known: 10, resolution: 0.05 }, "map-42"),
		"map-42",
	);
	assert.equal(
		h.mapSeen(at(12, 1), { known: 1, resolution: 0.05 }, "map-42"),
		"map-42",
	);
});

test("a restart continues the session, and old databases gain the column", () => {
	const file = join(mkdtempSync(join(tmpdir(), "hist-")), "h.db");
	// a database from before sessions existed
	const old = new DatabaseSync(file);
	old.exec(
		"CREATE TABLE track (robot TEXT, t INTEGER, d REAL, cx INTEGER, cy INTEGER)",
	);
	old.exec("INSERT INTO track VALUES ('robot-a', 1, 0, 0, 0)");
	old.close();

	const a = openHistory(file, at(9));
	const id = a.mapSeen(at(9), { known: 100, resolution: 0.05 });
	const b = openHistory(file, at(10)); // gateway restarted
	assert.equal(b.mapSeen(at(10), { known: 120, resolution: 0.05 }), id);
	assert.equal(b.query("robot-a", 1, at(12)).session?.id, id);
});

test("coverage sweeps the robot's width along its path, counting passes", () => {
	const cell = 0.1;
	const r = 0.35;
	// one point: a disk of about π r² / cell² cells
	const dot = sweptCells([{ x: 0.05, y: 0.05, joined: false }], cell, r);
	assert.ok(Math.abs(dot.length - (Math.PI * r * r) / (cell * cell)) < 8);

	// there and back along x: the middle of the band is passed twice
	const path = [
		{ x: 0, y: 0, joined: false },
		{ x: 2, y: 0, joined: true },
		{ x: 0, y: 0, joined: true },
	];
	const cells = new Map(
		sweptCells(path, cell, r).map(([x, y, n]) => [`${x},${y}`, n]),
	);
	assert.equal(cells.get("10,0"), 2); // x = 1.05: covered between samples, twice
	assert.equal(cells.get("10,4"), undefined); // y = 0.45: outside the width

	// an unjoined sample (after a gap or a jump) doesn't bridge to the last one
	const gap = sweptCells(
		[
			{ x: 0, y: 0, joined: false },
			{ x: 2, y: 0, joined: false },
		],
		cell,
		r,
	);
	assert.ok(!gap.some(([x, y]) => x === 10 && y === 0));
});
