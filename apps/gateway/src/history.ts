// Records what adapters report into SQLite and answers /history queries.
// Raw-ish rows are kept (state changes, wait changes, moving pose samples,
// tasks, events) and every KPI is computed at query time, so KPI definitions
// can change later without losing what was already recorded.
import { DatabaseSync } from "node:sqlite";
import type { AdapterEventKind, Alarm, Mode } from "@aibot/fleet-adapter";

/** Coverage grid cell, meters. Cells are world-aligned: floor(x / CELL). */
export const CELL = 0.5;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// ponytail: tuning knobs for pose sampling — raise MIN_STEP if a parked
// robot's pose jitter shows up as distance.
const SAMPLE_MS = 1000; // at most one track row per robot per second
const MIN_STEP = 0.05; // m; smaller moves are jitter, not travel
const MAX_GAP = 5000; // ms; a longer silence starts a new segment (d = 0)
const MAX_STEP = 5; // m per sample; more is a relocalization jump, not travel

export type Days = 1 | 7 | 30;

interface State {
	online: boolean;
	mode: Mode;
	/** the robot stack's own name for the state, shown in events */
	label: string;
}
interface Change<T> {
	t: number;
	v: T;
}

// ---------- pure aggregation (unit-tested) ----------

/** Uniform buckets ending at the current hour (1 day) or local day (7/30). */
export function bucketsFor(days: Days, now: number) {
	const size = days === 1 ? HOUR : DAY;
	const end = new Date(now);
	if (days === 1) end.setMinutes(0, 0, 0);
	else end.setHours(0, 0, 0, 0);
	const n = days === 1 ? 24 : days;
	// ponytail: uniform DAY buckets drift an hour across DST changes; Korea has none
	const from = end.getTime() - (n - 1) * size;
	return { from, size, n };
}

/** [start, end) intervals of a value that changes at `rows`, clipped to [from, to). */
export function intervals<T>(
	initial: T | undefined,
	rows: Change<T>[],
	from: number,
	to: number,
): { start: number; end: number; v: T }[] {
	const out: { start: number; end: number; v: T }[] = [];
	let cur = initial;
	let at = from;
	for (const r of rows) {
		if (r.t >= to) break;
		if (r.t > at && cur !== undefined)
			out.push({ start: at, end: r.t, v: cur });
		if (r.t > at) at = r.t;
		cur = r.v;
	}
	if (cur !== undefined && to > at) out.push({ start: at, end: to, v: cur });
	return out;
}

/** Milliseconds within [a, b) where `pred` holds. */
export function msWhere<T>(
	ivs: { start: number; end: number; v: T }[],
	pred: (v: T) => boolean,
	a: number,
	b: number,
): number {
	let ms = 0;
	for (const iv of ivs)
		if (pred(iv.v))
			ms += Math.max(0, Math.min(iv.end, b) - Math.max(iv.start, a));
	return ms;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);
const delta = (cur: number, prev: number) =>
	prev > 0 ? round1(((cur - prev) / prev) * 100) : 0;

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
	| AdapterEventKind;

export interface HistoryEvent {
	t: number;
	kind: EventKind;
	detail: string;
}

/** One event per state change; the first row is compared with `initial`. */
export function stateEvents(
	initial: State | undefined,
	rows: Change<State>[],
): HistoryEvent[] {
	const out: HistoryEvent[] = [];
	let prev = initial;
	for (const { t, v } of rows) {
		if (!prev || prev.online !== v.online) {
			out.push({ t, kind: v.online ? "online" : "offline", detail: v.label });
		} else if (v.online && (prev.mode !== v.mode || prev.label !== v.label)) {
			const kind: EventKind =
				v.mode === "run"
					? "run_start"
					: v.mode === "error"
						? "error"
						: v.mode === "pause"
							? "pause"
							: prev.mode === "run"
								? "run_end"
								: "state";
			out.push({ t, kind, detail: `${prev.label} → ${v.label}` });
		}
		prev = v;
	}
	return out;
}

// ---------- recorder + query ----------

// biome-ignore lint/suspicious/noExplicitAny: SQLite rows, typed at each use
type Row = any;

/** `now` is when the gateway (re)started: intervals left open are closed then. */
export function openHistory(file: string, now = Date.now()) {
	const db = new DatabaseSync(file);
	db.exec(`
		PRAGMA journal_mode = WAL;
		CREATE TABLE IF NOT EXISTS track (robot TEXT, t INTEGER, d REAL, cx INTEGER, cy INTEGER);
		CREATE INDEX IF NOT EXISTS track_rt ON track (robot, t);
		CREATE TABLE IF NOT EXISTS state (robot TEXT, t INTEGER, online INTEGER, mode TEXT, label TEXT);
		CREATE INDEX IF NOT EXISTS state_rt ON state (robot, t);
		CREATE TABLE IF NOT EXISTS wait (robot TEXT, t INTEGER, at TEXT);
		CREATE INDEX IF NOT EXISTS wait_rt ON wait (robot, t);
		CREATE TABLE IF NOT EXISTS task (robot TEXT, t INTEGER, ok INTEGER, detail TEXT);
		CREATE INDEX IF NOT EXISTS task_rt ON task (robot, t);
		CREATE TABLE IF NOT EXISTS event (robot TEXT, t INTEGER, kind TEXT, detail TEXT);
		CREATE INDEX IF NOT EXISTS event_rt ON event (robot, t);
	`);
	const ins = {
		track: db.prepare("INSERT INTO track VALUES (?, ?, ?, ?, ?)"),
		state: db.prepare("INSERT INTO state VALUES (?, ?, ?, ?, ?)"),
		wait: db.prepare("INSERT INTO wait VALUES (?, ?, ?)"),
		task: db.prepare("INSERT INTO task VALUES (?, ?, ?, ?)"),
		event: db.prepare("INSERT INTO event VALUES (?, ?, ?, ?)"),
	};

	// Current per-robot view, so only changes are written.
	const cur = new Map<
		string,
		State & {
			at: string | null;
			alarms: Set<string>;
			last?: { t: number; x: number; y: number };
		}
	>();
	const get = (robot: string) => {
		let r = cur.get(robot);
		if (!r) {
			r = {
				online: false,
				mode: "other",
				label: "",
				at: null,
				alarms: new Set(),
			};
			cur.set(robot, r);
		}
		return r;
	};

	function state(robot: string, t: number, s: State) {
		const r = get(robot);
		if (r.online === s.online && r.mode === s.mode && r.label === s.label)
			return;
		Object.assign(r, s);
		ins.state.run(robot, t, s.online ? 1 : 0, s.mode, s.label);
		if (!s.online) {
			wait(robot, t, null);
			r.alarms.clear();
		}
	}
	function wait(robot: string, t: number, at: string | null) {
		const r = get(robot);
		// Only an online robot waits; a stale "waiting" from a dead one isn't wait time.
		if (r.at === at || (at !== null && !r.online)) return;
		r.at = at;
		ins.wait.run(robot, t, at);
	}

	/** Pose samples become travel: ≤1 Hz, jitter and jumps dropped, online robots only. */
	function pose(robot: string, t: number, x: number, y: number) {
		if (!Number.isFinite(x) || !Number.isFinite(y)) return;
		const r = cur.get(robot);
		if (!r?.online) return; // a stale last pose from an offline robot isn't travel
		const last = r.last;
		if (last && t - last.t < SAMPLE_MS) return;
		let d = 0;
		if (last && t - last.t <= MAX_GAP) {
			d = Math.hypot(x - last.x, y - last.y);
			if (d < MIN_STEP) return; // parked: no row, keep the anchor
			if (d > MAX_STEP) d = 0;
		}
		r.last = { t, x, y };
		ins.track.run(robot, t, d, Math.floor(x / CELL), Math.floor(y / CELL));
	}

	function task(robot: string, t: number, ok: boolean, detail: string) {
		ins.task.run(robot, t, ok ? 1 : 0, detail);
	}
	function event(robot: string, t: number, kind: EventKind, detail: string) {
		ins.event.run(robot, t, kind, detail);
	}
	/** Records only newly raised alarms (the adapter reports the whole active list). */
	function alarms(robot: string, t: number, active: Alarm[]) {
		const r = get(robot);
		const now = new Set(active.map((a) => String(a.code)));
		for (const a of active)
			if (!r.alarms.has(String(a.code)))
				event(
					robot,
					t,
					"alarm",
					`[${a.level || "?"}] ${a.code}${a.text ? ` ${a.text}` : ""}`,
				);
		r.alarms = now;
	}

	/**
	 * Everything is unknown while the gateway is down or its source is gone;
	 * close every open interval so that gap isn't counted as uptime.
	 */
	function markAllOffline(t: number) {
		for (const robot of cur.keys())
			state(robot, t, { online: false, mode: "other", label: "unknown" });
	}

	// Resume from the last recorded state and wait (rows are appended in time
	// order, so the highest rowid is the latest), then close both: the gateway
	// was down. Without the wait, a crash mid-wait would leave it open forever.
	const lastRows = (table: string) =>
		db
			.prepare(
				`SELECT * FROM ${table} WHERE rowid IN (SELECT max(rowid) FROM ${table} GROUP BY robot)`,
			)
			.all() as Row[];
	for (const row of lastRows("state"))
		Object.assign(get(row.robot), {
			online: !!row.online,
			mode: row.mode,
			label: row.label,
		});
	for (const row of lastRows("wait")) get(row.robot).at = row.at;
	markAllOffline(now);

	const q = {
		stateBefore: db.prepare(
			"SELECT online, mode, label FROM state WHERE robot = ? AND t < ? ORDER BY t DESC LIMIT 1",
		),
		states: db.prepare(
			"SELECT t, online, mode, label FROM state WHERE robot = ? AND t >= ? AND t < ? ORDER BY t",
		),
		waitBefore: db.prepare(
			"SELECT at FROM wait WHERE robot = ? AND t < ? ORDER BY t DESC LIMIT 1",
		),
		waits: db.prepare(
			"SELECT t, at FROM wait WHERE robot = ? AND t >= ? AND t < ? ORDER BY t",
		),
		distance: db.prepare(
			"SELECT CAST((t - ?) / ? AS INTEGER) AS b, SUM(d) AS d FROM track WHERE robot = ? AND t >= ? AND t < ? GROUP BY b",
		),
		tasks: db.prepare(
			"SELECT COUNT(*) AS n, SUM(ok) AS ok FROM task WHERE robot = ? AND t >= ? AND t < ?",
		),
		taskRows: db.prepare(
			"SELECT t, ok, detail FROM task WHERE robot = ? AND t >= ? AND t < ?",
		),
		eventRows: db.prepare(
			"SELECT t, kind, detail FROM event WHERE robot = ? AND t >= ? AND t < ?",
		),
		cells: db.prepare(
			"SELECT cx, cy, COUNT(*) AS n FROM track WHERE robot = ? AND t >= ? AND t < ? GROUP BY cx, cy",
		),
	};

	function query(robot: string, days: Days, now: number) {
		const { from, size, n } = bucketsFor(days, now);
		const span = n * size;
		const pFrom = from - span;
		const pTo = now - span; // same elapsed length as the current period

		const toState = (r: Row): State => ({
			online: !!r.online,
			mode: r.mode,
			label: r.label ?? "",
		});
		const s0 = q.stateBefore.get(robot, pFrom) as Row;
		const sRows = (q.states.all(robot, pFrom, now) as Row[]).map((r) => ({
			t: r.t as number,
			v: toState(r),
		}));
		const sIv = intervals(s0 && toState(s0), sRows, pFrom, now);
		const w0 = q.waitBefore.get(robot, pFrom) as Row;
		const wRows = (q.waits.all(robot, pFrom, now) as Row[]).map((r) => ({
			t: r.t as number,
			v: r.at as string | null,
		}));
		const wIv = intervals(
			w0 ? (w0.at as string | null) : undefined,
			wRows,
			pFrom,
			now,
		);

		// State in force just before `a` (rows at exactly `a` are "in" the period).
		const stateBefore = (a: number) =>
			a <= pFrom
				? s0 && toState(s0)
				: sIv.find((iv) => iv.start < a && iv.end >= a)?.v;

		const online = (s: State) => s.online;
		const running = (s: State) => s.online && s.mode === "run";
		const waiting = (node: string | null) => node !== null;

		const dist = (a: number, b: number) =>
			(
				q.distance.all(a, size, robot, a, b) as { b: number; d: number }[]
			).reduce((s, r) => s + r.d, 0);

		const period = (a: number, b: number) => {
			const on = msWhere(sIv, online, a, b);
			const errors = stateEvents(
				stateBefore(a),
				sRows.filter((r) => r.t >= a && r.t < b),
			).filter((e) => e.kind === "error").length;
			const tasks = q.tasks.get(robot, a, b) as {
				n: number;
				ok: number | null;
			};
			return {
				// null = no tasks recorded (the adapter may not report any), not 0 %
				success: tasks.n > 0 ? pct(tasks.ok ?? 0, tasks.n) : null,
				distance: dist(a, b) / 1000,
				uptime: pct(on, b - a),
				run: pct(msWhere(sIv, running, a, b), on),
				errors,
				wait: msWhere(wIv, waiting, a, b) / 60_000,
			};
		};
		const c = period(from, now);
		const p = period(pFrom, pTo);

		const perBucket = q.distance.all(from, size, robot, from, now) as {
			b: number;
			d: number;
		}[];
		const label = (t: number) => {
			const d = new Date(t);
			return days === 1
				? `${String(d.getHours()).padStart(2, "0")}:00`
				: `${d.getMonth() + 1}/${d.getDate()}`;
		};
		const buckets = Array.from({ length: n }, (_, i) => {
			const a = from + i * size;
			return { a, b: Math.min(a + size, now), label: label(a) };
		});

		const time = (t: number) => {
			const d = new Date(t);
			const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
			return days === 1 ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
		};
		const events = [
			...stateEvents(
				stateBefore(from),
				sRows.filter((r) => r.t >= from),
			),
			...wRows
				.filter((r) => r.t >= from && r.v !== null)
				.map((r) => ({ t: r.t, kind: "wait" as const, detail: r.v as string })),
			...(q.taskRows.all(robot, from, now) as Row[]).map((r) => ({
				t: r.t as number,
				kind: (r.ok ? "task_ok" : "task_fail") as EventKind,
				detail: r.detail as string,
			})),
			...(q.eventRows.all(robot, from, now) as Row[]).map((r) => ({
				t: r.t as number,
				kind: r.kind as EventKind,
				detail: r.detail as string,
			})),
		]
			.sort((a, b) => b.t - a.t)
			.slice(0, 50)
			.map((e) => ({ time: time(e.t), kind: e.kind, detail: e.detail }));

		return {
			kpis: [
				{
					key: "distance",
					value: round1(c.distance),
					unit: "km",
					delta: delta(c.distance, p.distance),
				},
				{
					key: "uptime",
					value: round1(c.uptime),
					unit: "%",
					delta: delta(c.uptime, p.uptime),
				},
				{
					key: "run",
					value: round1(c.run),
					unit: "%",
					delta: delta(c.run, p.run),
				},
				{
					key: "success",
					value: c.success === null ? null : round1(c.success),
					unit: "%",
					delta:
						c.success === null || p.success === null
							? 0
							: delta(c.success, p.success),
				},
				{
					key: "errors",
					value: c.errors,
					unit: "",
					delta: delta(c.errors, p.errors),
				},
				{
					key: "wait",
					value: round1(c.wait),
					unit: "min",
					delta: delta(c.wait, p.wait),
				},
			],
			distance: buckets.map((bk, i) => ({
				label: bk.label,
				value:
					Math.round(
						((perBucket.find((r) => r.b === i)?.d ?? 0) / 1000) * 100,
					) / 100,
			})),
			run: buckets.map((bk) => ({
				label: bk.label,
				value: round1(
					pct(
						msWhere(sIv, running, bk.a, bk.b),
						msWhere(sIv, online, bk.a, bk.b),
					),
				),
			})),
			events,
			cell: CELL,
			cells: (
				q.cells.all(robot, from, now) as { cx: number; cy: number; n: number }[]
			).map((r) => [r.cx, r.cy, r.n]),
			prevCells: (
				q.cells.all(robot, pFrom, pTo) as { cx: number; cy: number }[]
			).map((r) => [r.cx, r.cy]),
		};
	}

	function prune(keepDays: number, now: number) {
		const cut = now - keepDays * DAY;
		for (const table of ["track", "task", "event"])
			db.prepare(`DELETE FROM ${table} WHERE t < ?`).run(cut);
		// state/wait rows are transitions: the last one before the cutoff still
		// says what held from the cutoff on, so it stays.
		for (const table of ["state", "wait"])
			db.prepare(
				`DELETE FROM ${table} WHERE t < ? AND rowid NOT IN (SELECT max(rowid) FROM ${table} WHERE t < ? GROUP BY robot)`,
			).run(cut, cut);
	}

	return {
		state,
		wait,
		pose,
		task,
		event,
		alarms,
		markAllOffline,
		query,
		prune,
	};
}
