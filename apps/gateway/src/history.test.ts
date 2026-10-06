import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Mode } from "@aibot/fleet-adapter";
import { bucketsFor, intervals, msWhere, openHistory } from "./history.ts";

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

	assert.equal(r.cells.length, 602); // 601 samples + the post-gap one, all distinct
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
