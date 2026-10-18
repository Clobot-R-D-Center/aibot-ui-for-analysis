// Records what adapters report into SQLite and answers /history, /timeline
// and /snapshot queries. Raw-ish rows are kept (state, wait and graph place
// changes, moving pose samples) and every KPI is computed at query time, so KPI definitions
// can change later without losing what was already recorded.
import { DatabaseSync } from "node:sqlite";
import type { Mode } from "@aibot/fleet-adapter";

/** Coverage grid cell, meters. Cells are world-aligned: floor(x / CELL). */
export const CELL = 0.1;
/** Default robot radius for coverage: what the body sweeps, not just its center. */
export const COVER_RADIUS = 0.35;
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
	| "wait";

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

/**
 * Cells a robot of `radius` swept along consecutive samples: each segment
 * between joined samples is a capsule (all cells whose center is within
 * `radius` of it), an unjoined sample a disk. n counts passes — segments —
 * over a cell, not samples.
 */
export function sweptCells(
	samples: { x: number; y: number; joined: boolean }[],
	cell: number,
	radius: number,
): [number, number, number][] {
	const passes = new Map<string, [number, number, number]>();
	const r2 = radius * radius;
	let prev: { x: number; y: number } | null = null;
	for (const s of samples) {
		const a = s.joined && prev ? prev : s;
		const [dx, dy] = [s.x - a.x, s.y - a.y];
		const len2 = dx * dx + dy * dy;
		const c0 = Math.floor((Math.min(a.x, s.x) - radius) / cell);
		const c1 = Math.floor((Math.max(a.x, s.x) + radius) / cell);
		const r0 = Math.floor((Math.min(a.y, s.y) - radius) / cell);
		const r1 = Math.floor((Math.max(a.y, s.y) + radius) / cell);
		for (let cy = r0; cy <= r1; cy++)
			for (let cx = c0; cx <= c1; cx++) {
				const px = (cx + 0.5) * cell;
				const py = (cy + 0.5) * cell;
				// distance² from the cell center to the segment a→s
				const k = len2
					? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2))
					: 0;
				const ex = px - (a.x + k * dx);
				const ey = py - (a.y + k * dy);
				if (ex * ex + ey * ey > r2) continue;
				const key = `${cx},${cy}`;
				const hit = passes.get(key);
				if (hit) hit[2]++;
				else passes.set(key, [cx, cy, 1]);
			}
		prev = s;
	}
	return [...passes.values()];
}

/** The change-only key of a graph place: "n:<node>", "l:<link>" or "" (unknown). */
function placeKey(node: string | null, link: string | null) {
	if (node) return `n:${node}`;
	if (link) return `l:${link}`;
	return "";
}

/** Angle from a to b along the shorter way round, at fraction f. */
function lerpAngle(a: number, b: number, f: number) {
	const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
	return a + d * f;
}

const hm = (d: Date) =>
	`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

// ---------- recorder + query ----------

// biome-ignore lint/suspicious/noExplicitAny: SQLite rows, typed at each use
type Row = any;

/** `now` is when the gateway (re)started: intervals left open are closed then. */
export function openHistory(
	file: string,
	now = Date.now(),
	coverRadius = COVER_RADIUS,
) {
	const db = new DatabaseSync(file);
	db.exec(`
		PRAGMA journal_mode = WAL;
		CREATE TABLE IF NOT EXISTS track (robot TEXT, t INTEGER, d REAL, cx INTEGER, cy INTEGER);
		CREATE INDEX IF NOT EXISTS track_rt ON track (robot, t);
		CREATE INDEX IF NOT EXISTS track_t ON track (t); -- fleet-wide ranges (/timeline)
		CREATE TABLE IF NOT EXISTS state (robot TEXT, t INTEGER, online INTEGER, mode TEXT, label TEXT);
		CREATE INDEX IF NOT EXISTS state_rt ON state (robot, t);
		CREATE TABLE IF NOT EXISTS wait (robot TEXT, t INTEGER, at TEXT);
		CREATE INDEX IF NOT EXISTS wait_rt ON wait (robot, t);
		CREATE TABLE IF NOT EXISTS place (robot TEXT, t INTEGER, node TEXT, link TEXT);
		CREATE INDEX IF NOT EXISTS place_rt ON place (robot, t);
		CREATE TABLE IF NOT EXISTS map_session (id TEXT, t INTEGER, known INTEGER, resolution REAL);
	`);
	// Databases from before mapping sessions: their travel has no session.
	if (
		!(db.prepare("PRAGMA table_info(track)").all() as Row[]).some(
			(c) => c.name === "session",
		)
	)
		db.exec("ALTER TABLE track ADD COLUMN session TEXT");
	// Coverage sweeps the path between samples, so it needs the exact point.
	if (
		!(db.prepare("PRAGMA table_info(track)").all() as Row[]).some(
			(c) => c.name === "x",
		)
	)
		db.exec(
			"ALTER TABLE track ADD COLUMN x REAL; ALTER TABLE track ADD COLUMN y REAL",
		);
	// The heading, for showing a robot at a past moment; older rows have none.
	if (
		!(db.prepare("PRAGMA table_info(track)").all() as Row[]).some(
			(c) => c.name === "theta",
		)
	)
		db.exec("ALTER TABLE track ADD COLUMN theta REAL");
	const ins = {
		track: db.prepare(
			"INSERT INTO track (robot, t, d, cx, cy, session, x, y, theta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		),
		session: db.prepare("INSERT INTO map_session VALUES (?, ?, ?, ?)"),
		state: db.prepare("INSERT INTO state VALUES (?, ?, ?, ?, ?)"),
		wait: db.prepare("INSERT INTO wait VALUES (?, ?, ?)"),
		place: db.prepare("INSERT INTO place VALUES (?, ?, ?, ?)"),
	};

	// Current per-robot view, so only changes are written.
	const cur = new Map<
		string,
		State & {
			at: string | null;
			/** "n:<node>", "l:<link>" or "" (unknown), to write changes only */
			place: string;
			last?: { t: number; x: number; y: number };
		}
	>();
	const get = (robot: string) => {
		let r = cur.get(robot);
		if (!r) {
			r = { online: false, mode: "other", label: "", at: null, place: "" };
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
			place(robot, t, null);
		}
	}
	function wait(robot: string, t: number, at: string | null) {
		const r = get(robot);
		// Only an online robot waits; a stale "waiting" from a dead one isn't wait time.
		if (r.at === at || (at !== null && !r.online)) return;
		r.at = at;
		ins.wait.run(robot, t, at);
	}

	/** Where on the graph an online robot is; changes only. */
	function place(
		robot: string,
		t: number,
		at: { node: string } | { link: string } | null,
	) {
		const r = get(robot);
		const key = placeKey(
			at && "node" in at ? at.node : null,
			at && "link" in at ? at.link : null,
		);
		if (r.place === key || (key && !r.online)) return;
		r.place = key;
		ins.place.run(
			robot,
			t,
			at && "node" in at ? at.node : null,
			at && "link" in at ? at.link : null,
		);
	}

	/**
	 * Pose samples become travel: ≤1 Hz, jitter and jumps dropped, online robots only.
	 * ponytail: a robot turning in place writes no row, so a past heading can lag
	 * until it moves; sample on a heading change too if that matters.
	 */
	function pose(robot: string, t: number, x: number, y: number, theta: number) {
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
		ins.track.run(
			robot,
			t,
			d,
			Math.floor(x / CELL),
			Math.floor(y / CELL),
			session?.id ?? null,
			x,
			y,
			Number.isFinite(theta) ? theta : null,
		);
	}

	/**
	 * Mapping session: coverage cells are only comparable within one map frame,
	 * so travel is tagged with the session (the map file's version) and cells
	 * are read for the current one only. Restored from the last row, so a
	 * gateway restart continues it.
	 */
	let session = (db
		.prepare("SELECT * FROM map_session ORDER BY rowid DESC LIMIT 1")
		.get() ?? null) as { id: string; t: number } | null;

	/** A map was loaded: continue the current session or start a new one. */
	function mapSeen(t: number, id: string): string {
		if (id !== session?.id) {
			session = { id, t };
			ins.session.run(id, t, null, null);
		}
		return id;
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
	for (const row of lastRows("place"))
		get(row.robot).place = placeKey(row.node, row.link);
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
		samples: db.prepare(
			"SELECT x, y, d FROM track WHERE robot = ? AND t >= ? AND t < ? AND session IS ? AND x IS NOT NULL ORDER BY t",
		),
		robots: db.prepare("SELECT DISTINCT robot FROM state ORDER BY robot"),
		fleetDistance: db.prepare(
			"SELECT CAST((t - ?) / ? AS INTEGER) AS b, SUM(d) AS d FROM track WHERE t >= ? AND t < ? GROUP BY b",
		),
		stateAt: db.prepare(
			"SELECT online, mode, label FROM state WHERE robot = ? AND t <= ? ORDER BY t DESC LIMIT 1",
		),
		waitAt: db.prepare(
			"SELECT at FROM wait WHERE robot = ? AND t <= ? ORDER BY t DESC LIMIT 1",
		),
		placeAt: db.prepare(
			"SELECT node, link FROM place WHERE robot = ? AND t <= ? ORDER BY t DESC LIMIT 1",
		),
		poseBefore: db.prepare(
			"SELECT t, x, y, theta, session FROM track WHERE robot = ? AND t <= ? AND x IS NOT NULL ORDER BY t DESC LIMIT 1",
		),
		poseAfter: db.prepare(
			"SELECT t, x, y, theta, d, session FROM track WHERE robot = ? AND t > ? AND x IS NOT NULL ORDER BY t LIMIT 1",
		),
		sessionAt: db.prepare(
			"SELECT id FROM map_session WHERE t <= ? ORDER BY t DESC LIMIT 1",
		),
	};

	/** KPIs, trends, events and coverage of the last 1/7/30 days. */
	function query(robot: string, days: Days, now: number) {
		const { from, size, n } = bucketsFor(days, now);
		// deltas against the same stretch one whole period earlier
		return queryRange(robot, from, now, size, n * size);
	}

	/**
	 * The same for any [from, to), in buckets of `size` ms; deltas compare with
	 * [from − shift, to − shift) (by default the stretch just before).
	 */
	function queryRange(
		robot: string,
		from: number,
		now: number,
		size: number,
		shift = now - from,
	) {
		const n = Math.ceil((now - from) / size);
		const pFrom = from - shift;
		const pTo = now - shift;

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
			return {
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
			return size < DAY ? hm(d) : `${d.getMonth() + 1}/${d.getDate()}`;
		};
		const buckets = Array.from({ length: n }, (_, i) => {
			const a = from + i * size;
			return { a, b: Math.min(a + size, now), label: label(a) };
		});

		// ponytail: sweeps every sample of the range per request (fine for days of
		// one robot); cache per day if 30-day queries of busy robots get slow.
		const swept = (a: number, b: number) =>
			sweptCells(
				(q.samples.all(robot, a, b, session?.id ?? null) as Row[]).map((r) => ({
					x: r.x,
					y: r.y,
					// d > 0: continues the previous sample (no gap, no jump)
					joined: r.d > 0,
				})),
				CELL,
				coverRadius,
			);
		const time = (t: number) => {
			const d = new Date(t);
			return now - from <= DAY
				? hm(d)
				: `${d.getMonth() + 1}/${d.getDate()} ${hm(d)}`;
		};
		const events = [
			...stateEvents(
				stateBefore(from),
				sRows.filter((r) => r.t >= from),
			),
			...wRows
				.filter((r) => r.t >= from && r.v !== null)
				.map((r) => ({ t: r.t, kind: "wait" as const, detail: r.v as string })),
		]
			.sort((a, b) => b.t - a.t)
			.slice(0, 50)
			.map((e) => ({
				t: e.t,
				time: time(e.t),
				kind: e.kind,
				detail: e.detail,
			}));

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
			/** the mapping session cells (and so coverage) are read for */
			session: session ? { id: session.id, since: session.t } : null,
			cell: CELL,
			cells: swept(from, now),
			prevCells: swept(pFrom, pTo).map(([cx, cy]) => [cx, cy]),
		};
	}

	/**
	 * The fleet over [from, to): each robot's state as merged bands
	 * [start, end, "off" | mode] (none where nothing was recorded yet), and
	 * the fleet's distance in `n` equal buckets (km).
	 */
	function timeline(from: number, to: number, n: number) {
		const size = (to - from) / n;
		const robots = (q.robots.all() as Row[]).map((r) => {
			const robot = r.robot as string;
			const s0 = q.stateBefore.get(robot, from) as Row;
			const rows = (q.states.all(robot, from, to) as Row[]).map((r) => ({
				t: r.t as number,
				v: r.online ? (r.mode as string) : "off",
			}));
			const bands: [number, number, string][] = [];
			for (const iv of intervals(
				s0 ? (s0.online ? s0.mode : "off") : undefined,
				rows,
				from,
				to,
			)) {
				const last = bands.at(-1);
				if (last && last[2] === iv.v && last[1] === iv.start) last[1] = iv.end;
				else bands.push([iv.start, iv.end, iv.v]);
			}
			return { robot, bands };
		});
		const sums = new Map(
			(q.fleetDistance.all(from, size, from, to) as Row[]).map((r) => [
				r.b as number,
				r.d as number,
			]),
		);
		return {
			from,
			to,
			robots: robots.filter((r) => r.bands.length > 0),
			distance: Array.from(
				{ length: n },
				(_, i) => Math.round(((sums.get(i) ?? 0) / 1000) * 1000) / 1000,
			),
		};
	}

	/**
	 * Every robot as it was at `t`: state, wait, graph place and pose, and the
	 * mapping session (map frame) in force then. The pose is interpolated
	 * between the samples around `t` when they are one continuous stretch of
	 * travel in that session; otherwise it is the last sample (a parked robot
	 * writes none). null pose = no sample before `t` in that session.
	 */
	function snapshot(t: number) {
		const session = ((q.sessionAt.get(t) as Row)?.id ?? null) as string | null;
		const robots = (q.robots.all() as Row[]).flatMap((r) => {
			const robot = r.robot as string;
			const st = q.stateAt.get(robot, t) as Row;
			if (!st) return []; // not known yet at t
			const w = q.waitAt.get(robot, t) as Row;
			const pl = q.placeAt.get(robot, t) as Row;
			// A sample from another session is in another frame: no pose at all
			// beats one drawn in the wrong place.
			const a = q.poseBefore.get(robot, t) as Row;
			const before = a && a.session === session ? a : null;
			const b = q.poseAfter.get(robot, t) as Row;
			let pose: { x: number; y: number; theta: number | null } | null = before
				? { x: a.x, y: a.y, theta: a.theta }
				: null;
			if (
				before &&
				b &&
				b.session === session &&
				st.online &&
				b.d > 0 &&
				b.t - a.t <= MAX_GAP
			) {
				const f = (t - a.t) / (b.t - a.t);
				pose = {
					x: a.x + (b.x - a.x) * f,
					y: a.y + (b.y - a.y) * f,
					theta:
						a.theta === null || b.theta === null
							? a.theta
							: lerpAngle(a.theta, b.theta, f),
				};
			}
			return [
				{
					robot,
					online: !!st.online,
					mode: st.mode as string,
					label: (st.label ?? "") as string,
					wait: (w?.at ?? null) as string | null,
					node: (pl?.node ?? null) as string | null,
					link: (pl?.link ?? null) as string | null,
					pose,
				},
			];
		});
		return { session, robots };
	}

	function prune(keepDays: number, now: number) {
		const cut = now - keepDays * DAY;
		db.prepare("DELETE FROM track WHERE t < ?").run(cut);
		// state/wait/place rows are transitions: the last one before the cutoff still
		// says what held from the cutoff on, so it stays.
		for (const table of ["state", "wait", "place"])
			db.prepare(
				`DELETE FROM ${table} WHERE t < ? AND rowid NOT IN (SELECT max(rowid) FROM ${table} WHERE t < ? GROUP BY robot)`,
			).run(cut, cut);
	}

	return {
		state,
		wait,
		place,
		pose,
		mapSeen,
		markAllOffline,
		query,
		queryRange,
		timeline,
		snapshot,
		prune,
	};
}
