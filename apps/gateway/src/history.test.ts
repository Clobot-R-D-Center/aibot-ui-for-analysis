import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { Mode } from "@aibot/fleet-adapter";
import {
	CELL,
	COVER_RADIUS,
	intervals,
	msWhere,
	openHistory,
	sweptCells,
} from "./history.ts";

const at = (h: number, m = 0, s = 0) => new Date(2026, 9, 6, h, m, s).getTime();

/** The window the dashboard used to call "today": from 23 h before this hour. */
const lastDay = (
	h: ReturnType<typeof openHistory>,
	robot: string,
	now: number,
) => {
	const hour = new Date(now);
	hour.setMinutes(0, 0, 0);
	return h.query(robot, hour.getTime() - 23 * 3_600_000, now);
};

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
	st(at(11), "error", "ERROR");
	h.wait(robot, at(11), "N1");
	st(at(11, 10), "idle", "IDLE");
	h.wait(robot, at(11, 20), null);
	h.markAllOffline(at(12)); // source lost
	h.pose(robot, at(12, 10), 0, 0); // not online any more

	const r = lastDay(h, robot, at(12, 30));
	const kpi = Object.fromEntries(r.kpis.map((k) => [k.key, k.value]));
	assert.equal(kpi.distance, 2.4);
	assert.equal(kpi.uptime, 8.5); // 2 h of 23.5 h elapsed
	assert.equal(kpi.run, 25); // 30 min run / 120 min online
	assert.equal(kpi.errors, 1);
	assert.equal(kpi.wait, 20);
	assert.ok(r.kpis.every((k) => k.delta === 0)); // empty previous period

	// swept band along y = 0: a cell between two samples is covered, one beyond
	// the 0.35 m radius isn't (0.1 m cells)
	const has = (cx: number, cy: number) =>
		r.cells.some(([x, y]) => x === cx && y === cy);
	assert.ok(has(20, 0)); // x = 2.05 m, between the samples at 0 and 4 m
	assert.ok(has(20, -3)); // y = -0.25 m: inside the band
	assert.ok(!has(20, 4)); // y = 0.45 m: outside
	assert.deepEqual(
		r.events.map((e) => [e.t, e.kind, e.detail]),
		[
			[at(12), "offline", "unknown"],
			[at(11, 10), "state", "ERROR → IDLE"],
			[at(11), "error", "RUN → ERROR"],
			[at(11), "wait", "N1"],
			[at(10, 30), "run_start", "IDLE → RUN"],
			[at(10), "online", "IDLE"],
		],
	);
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
	const r = lastDay(after, robot, at(12));
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
	const uptime = lastDay(h, robot, now).kpis.find(
		(k) => k.key === "uptime",
	)?.value;
	assert.equal(uptime, 100); // online, unchanged, for the whole day
});

test("coverage cells are kept per mapping session", () => {
	const h = openHistory(":memory:", at(9));
	const robot = "robot-a";
	h.state(robot, at(9), { online: true, mode: "run", label: "RUN" });
	const first = h.mapSeen(at(9), "file-a");
	assert.equal(h.mapSeen(at(9, 30), "file-a"), first); // same file
	for (let i = 0; i < 3; i++) h.pose(robot, at(10) + i * 1000, i, 0); // first session: 3 cells, 1 m apart
	const second = h.mapSeen(at(11), "file-b"); // another map file
	assert.notEqual(second, first);
	h.pose(robot, at(11, 30), 40, 40);

	const r = lastDay(h, robot, at(12));
	assert.equal(r.session?.id, second);
	// only the new session's travel: a disk around (40, 40), none near the origin
	assert.ok(r.cells.length > 0);
	assert.ok(
		r.cells.every(
			([cx, cy]) => Math.abs(cx - 400) <= 4 && Math.abs(cy - 400) <= 4,
		),
	);
	assert.equal(r.kpis.find((k) => k.key === "distance")?.value, 0); // time KPIs untouched (2 m ≈ 0.0 km)
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
	const id = a.mapSeen(at(9), "file-a");
	const b = openHistory(file, at(10)); // gateway restarted
	assert.equal(b.mapSeen(at(10), "file-a"), id);
	assert.equal(lastDay(b, "robot-a", at(12)).session?.id, id);
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

test("coverage over whole days, kept per day, matches one sweep and follows new rows", () => {
	const file = join(mkdtempSync(join(tmpdir(), "hist-")), "h.db");
	const h = openHistory(file, at(9));
	const robot = "robot-a";
	const day = (d: number, hour: number, min = 0) =>
		Date.UTC(2026, 9, d, hour, min);
	h.state(robot, day(5, 0), { online: true, mode: "run", label: "RUN" });
	h.mapSeen(day(5, 0), "file-a");
	// laps of a 3 m circle every 5 s (joined), across UTC midnights
	const drive = (from: number, to: number) => {
		for (let t = from; t < to; t += 5000) {
			const a = t / 20_000;
			h.pose(robot, t, 3 * Math.cos(a), 3 * Math.sin(a), a);
		}
	};
	drive(day(6, 23, 50), day(7, 0, 10));
	drive(day(7, 12), day(7, 12, 10)); // after a gap: starts unjoined
	drive(day(7, 23, 55), day(8, 0, 10));

	// what one sweep over the window's rows gives, the first continuing the
	// row before the window
	const db = new DatabaseSync(file, { readOnly: true });
	const rows = (where: string, ...p: number[]) =>
		db.prepare(`SELECT x, y, d FROM track WHERE ${where}`).all(...p) as {
			x: number;
			y: number;
			d: number;
		}[];
	const same = (a: number, b: number) =>
		assert.deepEqual(
			h.query(robot, a, b).cells,
			sweptCells(
				rows("t >= ? AND t < ? ORDER BY t", a, b).map((r) => ({
					x: r.x,
					y: r.y,
					joined: r.d > 0,
				})),
				CELL,
				COVER_RADIUS,
				rows("t < ? ORDER BY t DESC LIMIT 1", a)[0] ?? null,
			),
		);

	same(day(6, 23), day(8, 0, 5)); // part of day 6, whole day 7, minutes of day 8
	// whole days 7 and 8: day 8 kept while it can still get rows (a window
	// reaching past now)
	same(day(6, 23), day(9, 1));
	same(day(6, 23), day(9, 1)); // kept
	same(day(7, 0, 5), day(9, 1)); // starting mid-drive
	same(day(8, 0), day(9, 1)); // from midnight: day 8 continues day 7
	same(day(8, 0), day(8, 0, 5));
	assert.ok(
		h.query(robot, day(6, 23), day(9, 1)).cells.some(([, , n]) => n > 1),
	);

	drive(day(8, 9), day(8, 9, 5)); // into the day just kept
	same(day(6, 23), day(9, 1));

	h.prune(62, day(8, 0) + 62 * 86_400_000); // up to midnight: day 8 continues nothing
	same(day(8, 0), day(9, 1));
});

test("a snapshot shows each robot as it was at that moment", () => {
	const h = openHistory(":memory:", at(9));
	const r = "robot-a";
	h.state(r, at(10), { online: true, mode: "run", label: "RUN" });
	h.place(r, at(10), { node: "N1" });
	h.pose(r, at(10), 0, 0, 0);
	h.pose(r, at(10, 0, 2), 2, 0, Math.PI / 2); // 1 m/s, turning
	h.place(r, at(10, 0, 1), { link: "L1-2" });
	h.place(r, at(10, 0, 1), { link: "L1-2" }); // a repeat: no row
	h.wait(r, at(10, 5), "N2");
	h.state(r, at(10, 10), { online: false, mode: "other", label: "lost" });

	const [mid] = h.snapshot(at(10, 0, 1)).robots;
	assert.equal(mid.mode, "run");
	assert.deepEqual([mid.node, mid.link], [null, "L1-2"]);
	assert.equal(mid.pose?.x, 1); // halfway between the samples
	assert.ok(Math.abs((mid.pose?.theta ?? 0) - Math.PI / 4) < 1e-9);

	const [waiting] = h.snapshot(at(10, 6)).robots;
	assert.equal(waiting.wait, "N2");
	assert.equal(waiting.pose?.x, 2); // parked since: the last sample

	const [off] = h.snapshot(at(10, 20)).robots;
	assert.equal(off.online, false);
	assert.deepEqual([off.wait, off.node, off.link], [null, null, null]); // cleared
	assert.equal(off.pose?.x, 2); // last known, for a faded marker

	assert.deepEqual(h.snapshot(at(9, 30)).robots, []); // not known yet
});

test("a snapshot keeps to the map session in force then", () => {
	const h = openHistory(":memory:", at(9));
	const r = "robot-a";
	h.mapSeen(at(9), "map-a");
	h.state(r, at(10), { online: true, mode: "run", label: "RUN" });
	h.pose(r, at(10, 59, 58), 0, 0, 0);
	h.pose(r, at(10, 59, 59), 1, 0, 0);
	h.mapSeen(at(11), "map-b"); // the map (and its frame) changed
	h.pose(r, at(11, 0, 1), 2, 0, 0);

	const old = h.snapshot(at(10, 30));
	assert.equal(old.session, "map-a");
	const now = h.snapshot(at(11, 0, 0));
	assert.equal(now.session, "map-b");
	// the last sample is map-a's: not drawn on map-b, nor blended with map-b's
	assert.equal(now.robots[0].pose, null);
	assert.equal(h.snapshot(at(11, 0, 2)).robots[0].pose?.x, 2);
});

test("the timeline gives merged state bands and fleet distance", () => {
	const h = openHistory(":memory:", at(9));
	h.state("a", at(10), { online: true, mode: "run", label: "RUN" });
	for (let i = 0; i <= 250; i++) h.pose("a", at(10) + i * 1000, i * 4, 0, 0); // 1 km
	h.state("a", at(10, 30), { online: true, mode: "run", label: "MOVING" }); // same band
	h.state("a", at(11), { online: false, mode: "other", label: "lost" });
	h.state("b", at(10, 30), { online: true, mode: "idle", label: "IDLE" });

	const tl = h.timeline(at(10), at(12), 2);
	const a = tl.robots.find((r) => r.robot === "a");
	assert.deepEqual(a?.bands, [
		[at(10), at(11), "run"],
		[at(11), at(12), "off"],
	]);
	assert.deepEqual(tl.robots.find((r) => r.robot === "b")?.bands, [
		[at(10, 30), at(12), "idle"],
	]);
	assert.deepEqual(tl.distance, [1, 0]); // km per hour bucket
});

test("any range gives KPIs, with deltas against the stretch before", () => {
	const h = openHistory(":memory:", at(8));
	h.state("a", at(8), { online: true, mode: "idle", label: "IDLE" });
	h.state("a", at(10), { online: true, mode: "run", label: "RUN" });
	const r = h.query("a", at(10), at(11));
	const kpi = Object.fromEntries(r.kpis.map((k) => [k.key, k]));
	assert.equal(kpi.run.value, 100);
	assert.equal(kpi.run.delta, 0); // the hour before was all idle: no base
});
