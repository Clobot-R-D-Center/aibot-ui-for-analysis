import { useEffect, useState } from "react";
import { applyMessage, type Fleet, isStale, type LiveRobot } from "./fleet";

/**
 * Gateway WebSocket (apps/gateway). Defaults to port 8787 on the host the
 * dashboard is served from, so a gateway on the same machine needs no config.
 */
export const GATEWAY_URL: string =
	import.meta.env.VITE_GATEWAY_URL ?? `ws://${location.hostname}:8787`;
/** The gateway serves history over HTTP on the same host:port (ws→http, wss→https). */
const GATEWAY_HTTP = GATEWAY_URL.replace(/^ws/, "http").replace(/\/$/, "");
export const HISTORY_URL = `${GATEWAY_HTTP}/history`;
/** The fleet map as map.yaml + map.png (it changes under SLAM; see mapVersion). */
export const MAP_URL = `${GATEWAY_HTTP}/map`;

export interface FleetLive {
	/** `stale`: offline, no recent pose, or the gateway link is down */
	robots: (LiveRobot & { stale: boolean })[];
	connected: boolean;
	/** content version of the gateway's map; changes as SLAM grows it; null = none yet */
	mapVersion: string | null;
	/** mapping session of that map; changes when a new map (frame) starts */
	mapSession: string | null;
}

/**
 * Live fleet from the gateway, reconnecting every 2 s while it's down. Keeps the
 * last snapshot across drops (a stream, not a fetch — so not AsyncState).
 */
export function useFleetLive(url = GATEWAY_URL): FleetLive {
	const [fleet, setFleet] = useState<Fleet>({});
	const [connected, setConnected] = useState(false);
	const [map, setMap] = useState<{ version: string; session: string } | null>(
		null,
	);
	// Staleness is time-based, so re-evaluate even when no messages arrive.
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);

	useEffect(() => {
		let ws: WebSocket;
		let retry: ReturnType<typeof setTimeout>;
		let closed = false;

		const open = () => {
			ws = new WebSocket(url);
			ws.onopen = () => setConnected(true);
			ws.onmessage = (e) => {
				try {
					const msg = JSON.parse(e.data);
					if (msg?.type === "map" && typeof msg.version === "string")
						return setMap({
							version: msg.version,
							session: typeof msg.session === "string" ? msg.session : "",
						});
					const at = Date.now();
					setFleet((f) => applyMessage(f, msg, at));
				} catch {}
			};
			ws.onclose = () => {
				setConnected(false);
				if (!closed) retry = setTimeout(open, 2000);
			};
		};
		open();

		return () => {
			closed = true;
			clearTimeout(retry);
			ws.close();
		};
	}, [url]);

	return {
		robots: Object.values(fleet)
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((r) => ({ ...r, stale: !connected || isStale(r, now) })),
		connected,
		mapVersion: map?.version ?? null,
		mapSession: map?.session ?? null,
	};
}
