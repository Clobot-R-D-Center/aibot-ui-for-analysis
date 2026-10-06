// Fleet gateway core. Loads one adapter package (@aibot/adapter-<FLEET_ADAPTER>) that
// speaks a robot stack, records what it reports for GET /history, and relays
// it live to browsers over a WebSocket on the same port, in one neutral
// protocol (see LiveMessage) — so the UI never knows which robots it shows.
import http from "node:http";
import type { FleetSink, MapGrid, StartAdapter } from "@aibot/fleet-adapter";
import { WebSocketServer } from "ws";
import { type Days, openHistory } from "./history.ts";
import { mapPng, mapVersion, mapYaml, validGrid } from "./map.ts";

const PORT = Number(process.env.WS_PORT ?? 8787);
const HISTORY_DB = process.env.HISTORY_DB ?? "history.db";
// 30-day view + the previous 30 days its deltas compare against.
const HISTORY_DAYS = Number(process.env.HISTORY_DAYS ?? 62);
const ADAPTER = process.env.FLEET_ADAPTER ?? "sim";
// ponytail: SLAM may republish the map every second; re-encoding the PNG and
// making every browser reload it at that rate is waste. Raise for big maps.
const MAP_MIN_MS = 2000;

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
	| {
			type: "battery";
			robot: string;
			charge: number;
			charging: boolean;
			eStop: boolean;
	  }
	| {
			type: "alarms";
			robot: string;
			alarms: { code: string; level: string; text: string }[];
	  }
	| { type: "link"; robot: string; up: boolean }
	| { type: "map"; version: string };

const history = openHistory(HISTORY_DB);
history.prune(HISTORY_DAYS, Date.now());
setInterval(() => history.prune(HISTORY_DAYS, Date.now()), 3_600_000);

const server = http.createServer((req, res) => {
	// The dashboard is served from another origin on the LAN.
	res.setHeader("Access-Control-Allow-Origin", "*");
	const url = new URL(req.url ?? "/", "http://gateway");
	if (url.pathname === "/map/map.yaml" || url.pathname === "/map/map.png") {
		if (!mapFiles) {
			res.writeHead(404).end("no map yet");
			return;
		}
		const png = url.pathname.endsWith(".png");
		res
			.writeHead(200, {
				"Content-Type": png ? "image/png" : "text/yaml",
				// The map changes under SLAM; the WS "map" message says when.
				"Cache-Control": "no-store",
			})
			.end(png ? mapFiles.png : mapFiles.yaml);
		return;
	}
	if (url.pathname !== "/history") {
		res.writeHead(404).end();
		return;
	}
	const robot = url.searchParams.get("robot");
	const days = Number(url.searchParams.get("days"));
	if (!robot || (days !== 1 && days !== 7 && days !== 30)) {
		res.writeHead(400).end("robot and days=1|7|30 are required");
		return;
	}
	try {
		const body = JSON.stringify(history.query(robot, days as Days, Date.now()));
		res.writeHead(200, { "Content-Type": "application/json" }).end(body);
	} catch (e) {
		console.warn(`[gateway] history: ${(e as Error).message}`);
		res.writeHead(500).end();
	}
});

const wss = new WebSocketServer({ server });
// ws throws an unhandled 'error' (killing the process) on a bad client frame;
// the socket closes itself afterwards, so logging is all that's needed.
wss.on("connection", (ws) => {
	ws.on("error", (e) => console.warn(`[gateway] ws client: ${e.message}`));
	// Some messages are only sent on change (link, alarms, a cleared plan), so
	// a browser joining later starts from the latest of each.
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
		// ones (alarms, link, a cleared plan), so drop it instead: the browser
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

/** The latest map as served files; null until an adapter reports one. */
let mapFiles: { yaml: string; png: Buffer; version: string } | null = null;
let pendingMap: MapGrid | null = null;
let mapTimer: ReturnType<typeof setTimeout> | null = null;
let lastMapAt = 0;

/** Encodes at most every MAP_MIN_MS, always ending on the latest grid. */
function queueMap(grid: MapGrid) {
	pendingMap = grid;
	if (mapTimer) return;
	mapTimer = setTimeout(
		() => {
			mapTimer = null;
			const g = pendingMap;
			pendingMap = null;
			if (!g) return;
			safely("map", () => {
				const version = mapVersion(g);
				if (mapFiles?.version === version) return;
				mapFiles = { yaml: mapYaml(g), png: mapPng(g), version };
				lastMapAt = Date.now();
				send({ type: "map", version });
			});
		},
		Math.max(0, lastMapAt + MAP_MIN_MS - Date.now()),
	);
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
				history.pose(robot, t, pose.x, pose.y);
		});
		send({
			type: "poses",
			poses: poses.map(({ robot, pose }) => ({ robot, ...pose })),
		});
	},
	plan(robot, points) {
		send({ type: "plan", robot, points });
	},
	wait(robot, at) {
		safely("wait", () => history.wait(robot, Date.now(), at));
	},
	task(robot, ok, detail) {
		safely("task", () => history.task(robot, Date.now(), ok, detail));
	},
	event(robot, kind, detail) {
		safely("event", () => history.event(robot, Date.now(), kind, detail));
	},
	alarms(robot, active) {
		safely("alarms", () => history.alarms(robot, Date.now(), active));
		send({
			type: "alarms",
			robot,
			alarms: active.map((a) => ({ ...a, code: String(a.code) })),
		});
	},
	battery(robot, b) {
		send({ type: "battery", robot, ...b });
	},
	link(robot, up) {
		console.log(`[gateway] ${robot} detail link ${up ? "up" : "down"}`);
		send({ type: "link", robot, up });
	},
	map(grid) {
		if (validGrid(grid)) queueMap(grid);
		else console.warn("[gateway] map: grid size doesn't match its data");
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

if (!/^[a-z0-9-]+$/.test(ADAPTER))
	throw new Error(`bad FLEET_ADAPTER: ${ADAPTER}`);
// An adapter is a workspace package this app depends on (see package.json).
const pkg = `@aibot/adapter-${ADAPTER}`;
const { default: start } = (await import(pkg).catch((e) => {
	throw new Error(
		`${pkg} isn't available — add it to apps/gateway/package.json ("${pkg}": "workspace:*") and run pnpm install (${e.message})`,
	);
})) as { default: StartAdapter };
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
