// Fleet gateway core. Loads one adapter package (@aibot/adapter-<FLEET_ADAPTER>) that
// speaks a robot stack, records what it reports for GET /history, and relays
// it live to browsers over a WebSocket on the same port, in one neutral
// protocol (see LiveMessage) — so the UI never knows which robots it shows.
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import http from "node:http";
import { dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import type { FleetSink, LoadSite, StartAdapter } from "@aibot/fleet-adapter";
import { WebSocketServer } from "ws";
import { openHistory } from "./history.ts";
import { readMap, readSite } from "./map.ts";
import { MIME, webFile } from "./web.ts";

// Settings may also come from ./.env; the shell's own variables win. Read here,
// not via node --env-file, so a packaged binary (SEA, pkg) reads it too.
if (existsSync(".env")) process.loadEnvFile();

const PORT = Number(process.env.WS_PORT ?? 8787);
const HISTORY_DB = process.env.HISTORY_DB ?? "history.db";
// 30-day view + the previous 30 days its deltas compare against.
const HISTORY_DAYS = Number(process.env.HISTORY_DAYS ?? 62);
const ADAPTER = process.env.FLEET_ADAPTER ?? "sim";
// The site map: a folder with a map_server map.yaml + PNG and its meta. The
// simulator's world is such a folder of its own, so the sim runs with no settings.
// ponytail: a sim-only default in the core; goes once maps load per format
// An empty MAP_DIR is unset too (compose passes one when none is given).
const MAP_DIR =
	process.env.MAP_DIR ||
	(ADAPTER === "sim"
		? dirname(
				fileURLToPath(import.meta.resolve("@aibot/adapter-sim/map/map.yaml")),
			)
		: undefined);
// The built dashboard (apps/web/dist) to serve on this port too; the Docker image sets it.
const WEB_DIR = process.env.WEB_DIR;
if (process.env.MAP_FILE)
	console.warn(
		"[gateway] MAP_FILE is no longer read: set MAP_DIR to the folder holding map.yaml",
	);

/** What browsers receive (apps/web/src/features/live/fleet.ts reads it). */
export type LiveMessage =
	| {
			type: "state";
			robot: string;
			online: boolean;
			mode: string;
			label: string;
	  }
	| {
			type: "poses";
			poses: { robot: string; x: number; y: number; theta: number }[];
	  }
	| { type: "plan"; robot: string; points: [number, number][] }
	| { type: "place"; robot: string; node: string | null; link: string | null }
	| { type: "map"; version: string; session: string };

// Robot radius for coverage (m): the width of the band a robot sweeps.
const COVER_RADIUS = Number(process.env.COVER_RADIUS ?? 0.35);
const history = openHistory(HISTORY_DB, Date.now(), COVER_RADIUS);
history.prune(HISTORY_DAYS, Date.now());
setInterval(() => history.prune(HISTORY_DAYS, Date.now()), 3_600_000);

const server = http.createServer((req, res) => {
	// The dashboard is served from another origin on the LAN.
	res.setHeader("Access-Control-Allow-Origin", "*");
	// Not new URL(): a malformed request line ("GET http://[x") would throw and
	// kill the process.
	const url = URL.parse(req.url ?? "/", "http://gateway");
	if (!url) {
		res.writeHead(400).end("bad url");
		return;
	}
	if (url.pathname === "/map/site.json") {
		if (!site) {
			res.writeHead(404).end("no map meta");
			return;
		}
		res
			.writeHead(200, {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			})
			.end(site);
		return;
	}
	if (url.pathname === "/map/map.yaml" || url.pathname === "/map/map.png") {
		if (!mapFiles) {
			res.writeHead(404).end("no map (MAP_DIR)");
			return;
		}
		const png = url.pathname.endsWith(".png");
		res
			.writeHead(200, {
				"Content-Type": png ? "image/png" : "text/yaml",
				// A restart may load another file; the WS "map" message says when.
				"Cache-Control": "no-store",
			})
			.end(png ? mapFiles.png : mapFiles.yaml);
		return;
	}
	let answer: () => unknown;
	try {
		answer = route(url.pathname, url.searchParams);
	} catch (e) {
		const status = (e as HttpError).status ?? 400;
		// Not the API: with WEB_DIR, the dashboard itself.
		const file =
			status === 404 && WEB_DIR ? webFile(WEB_DIR, url.pathname) : null;
		if (file) {
			res.writeHead(200, {
				"Content-Type": MIME[extname(file)] ?? "application/octet-stream",
			});
			// Unhandled, a read error (the build replaced meanwhile) kills the process.
			createReadStream(file)
				.on("error", () => res.destroy())
				.pipe(res);
			return;
		}
		res.writeHead(status).end((e as Error).message);
		return;
	}
	try {
		const body = JSON.stringify(answer());
		res.writeHead(200, { "Content-Type": "application/json" }).end(body);
	} catch (e) {
		console.warn(`[gateway] ${url.pathname}: ${(e as Error).message}`);
		res.writeHead(500).end();
	}
});

type HttpError = Error & { status?: number };
const DAY = 86_400_000;

/** A time in ms from the query, or a 400. */
function msParam(p: URLSearchParams, name: string): number {
	const v = Number(p.get(name));
	if (!p.get(name) || !Number.isFinite(v))
		throw new Error(`${name} (ms) is required`);
	return v;
}

/**
 * [from, to) from the query, cut to what history keeps: nothing older exists,
 * so a window reaching further back (the dashboard allows 62 days) is
 * answered for the part there is.
 */
function rangeParams(p: URLSearchParams) {
	const from = Math.max(msParam(p, "from"), Date.now() - HISTORY_DAYS * DAY);
	const to = msParam(p, "to");
	if (!(from < to))
		throw new Error(`need from < to, within the last ${HISTORY_DAYS} days`);
	return { from, to };
}

/** Checks a request's parameters and returns what computes its answer. */
function route(path: string, p: URLSearchParams): () => unknown {
	if (path === "/history") {
		const robot = p.get("robot");
		if (!robot) throw new Error("robot is required");
		const { from, to } = rangeParams(p);
		return () => history.query(robot, from, to);
	}
	if (path === "/timeline") {
		const { from, to } = rangeParams(p);
		const n = Math.min(500, Math.max(1, Math.round(Number(p.get("n") ?? 96))));
		if (!Number.isFinite(n)) throw new Error("n must be a number");
		return () => history.timeline(from, to, n);
	}
	if (path === "/snapshot") {
		const t = msParam(p, "t");
		return () => history.snapshot(t);
	}
	throw Object.assign(new Error("not found"), { status: 404 });
}

const wss = new WebSocketServer({ server });
// ws throws an unhandled 'error' (killing the process) on a bad client frame;
// the socket closes itself afterwards, so logging is all that's needed.
wss.on("connection", (ws) => {
	ws.on("error", (e) => console.warn(`[gateway] ws client: ${e.message}`));
	// Some messages are only sent on change (the map, a cleared plan), so a
	// browser joining later starts from the latest of each.
	for (const data of latest.values()) ws.send(data);
});

/** Latest message per type (+ robot), replayed to new connections. */
const latest = new Map<string, string>();

function send(msg: LiveMessage) {
	const data = JSON.stringify(msg);
	latest.set("robot" in msg ? `${msg.type}:${msg.robot}` : msg.type, data);
	for (const ws of wss.clients) {
		if (ws.readyState !== ws.OPEN) continue;
		// Too far behind to catch up. Skipping messages would lose change-only
		// ones (the map, a cleared plan), so drop it instead: the browser
		// reconnects and gets the full replay of the latest of each.
		if (ws.bufferedAmount > 1 << 20) ws.terminate();
		else ws.send(data);
	}
}

/** A throwing recorder must never stop the live relay. */
function safely(what: string, f: () => void) {
	try {
		f();
	} catch (e) {
		console.warn(`[gateway] ${what}: ${(e as Error).message}`);
	}
}

if (!/^[a-z0-9-]+$/.test(ADAPTER))
	throw new Error(`bad FLEET_ADAPTER: ${ADAPTER}`);
// An adapter is a workspace package this app depends on (see package.json).
const pkg = `@aibot/adapter-${ADAPTER}`;
const { default: start, loadSite } = (await import(pkg).catch((e) => {
	throw new Error(
		`${pkg} isn't available — add it to apps/gateway/package.json ("${pkg}": "workspace:*") and run pnpm install (${e.message})`,
	);
})) as { default: StartAdapter; loadSite?: LoadSite };

/** The map as served; null without one. */
let mapFiles: { yaml: string; png: Buffer } | null = null;
/** Its meta (graph, zones) as neutral JSON; null without any. */
let site: string | null = null;
if (MAP_DIR) {
	const f = readMap(MAP_DIR);
	mapFiles = { yaml: f.yaml, png: f.png };
	// The meta only adds to the map: a broken one is logged, not fatal.
	try {
		const s = loadSite?.(MAP_DIR) ?? readSite(MAP_DIR);
		if (s) site = JSON.stringify(s);
	} catch (e) {
		console.warn(`[gateway] map meta: ${(e as Error).message}`);
	}
	// Coverage follows the map: another map file starts another session. The
	// meta can change without moving the frame, so it only changes the version.
	const session = history.mapSeen(Date.now(), f.version);
	const version = site
		? `${f.version}.${createHash("sha1").update(site).digest("hex").slice(0, 8)}`
		: f.version;
	send({ type: "map", version, session });
	console.log(`[gateway] map ${MAP_DIR}${site ? " + meta" : ""}`);
}

const sink: FleetSink = {
	state(robot, s) {
		safely("state", () => history.state(robot, Date.now(), s));
		send({ type: "state", robot, ...s });
	},
	poses(poses) {
		const t = Date.now();
		safely("poses", () => {
			for (const { robot, pose } of poses)
				history.pose(robot, t, pose.x, pose.y, pose.theta);
		});
		send({
			type: "poses",
			poses: poses.map(({ robot, pose }) => ({ robot, ...pose })),
		});
	},
	plan(robot, points) {
		send({ type: "plan", robot, points });
	},
	place(robot, at) {
		safely("place", () => history.place(robot, Date.now(), at));
		send({
			type: "place",
			robot,
			node: at && "node" in at ? at.node : null,
			link: at && "link" in at ? at.link : null,
		});
	},
	wait(robot, at) {
		safely("wait", () => history.wait(robot, Date.now(), at));
	},
	lost() {
		safely("lost", () => history.markAllOffline(Date.now()));
		// Browsers too, and the replay cache: no robot's state is current now.
		// Last poses stay, so late joiners see where each robot was (faded).
		for (const [key, data] of latest) {
			if (!key.startsWith("state:")) continue;
			const s = JSON.parse(data) as Extract<LiveMessage, { type: "state" }>;
			if (s.online)
				send({ ...s, online: false, mode: "other", label: "unknown" });
		}
	},
};

const adapter = await start(sink, process.env);
server.listen(PORT, () =>
	console.log(
		`[gateway] ws + http://0.0.0.0:${PORT} · adapter ${ADAPTER} · history ${HISTORY_DB}`,
	),
);

for (const sig of ["SIGINT", "SIGTERM"] as const)
	process.on(sig, () => {
		adapter.stop();
		history.markAllOffline(Date.now());
		process.exit(0);
	});
