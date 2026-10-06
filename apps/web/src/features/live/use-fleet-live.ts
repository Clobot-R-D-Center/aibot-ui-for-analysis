import { useEffect, useState } from "react";
import { applyMessage, type Fleet, isStale, type LiveRobot } from "./fleet";

/** Gateway WebSocket (apps/gateway). Unset → the dashboard stays on demo data. */
export const GATEWAY_URL: string | undefined = import.meta.env.VITE_GATEWAY_URL;
/** The gateway serves history over HTTP on the same host:port (ws→http, wss→https). */
const GATEWAY_HTTP = GATEWAY_URL?.replace(/^ws/, "http").replace(/\/$/, "");
export const HISTORY_URL = GATEWAY_HTTP && `${GATEWAY_HTTP}/history`;
/** The fleet map as map.yaml + map.png (it changes under SLAM; see mapVersion). */
export const MAP_URL = GATEWAY_HTTP && `${GATEWAY_HTTP}/map`;

export interface FleetLive {
	/** `stale`: offline, no recent pose, or the gateway link is down */
	robots: (LiveRobot & { stale: boolean })[];
	connected: boolean;
	/** content version of the gateway's map; changes as SLAM grows it; null = none yet */
	mapVersion: string | null;
}

/**
 * Live fleet from the gateway, reconnecting every 2 s while it's down. Keeps the
 * last snapshot across drops (a stream, not a fetch — so not AsyncState).
 * Returns null when no gateway is configured.
 */
export function useFleetLive(url = GATEWAY_URL): FleetLive | null {
	const [fleet, setFleet] = useState<Fleet>({});
	const [connected, setConnected] = useState(false);
	const [mapVersion, setMapVersion] = useState<string | null>(null);
	// Staleness is time-based, so re-evaluate even when no messages arrive.
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!url) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [url]);

	useEffect(() => {
		if (!url) return;
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
						return setMapVersion(msg.version);
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

	if (!url) return null;
	return {
		robots: Object.values(fleet)
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((r) => ({ ...r, stale: !connected || isStale(r, now) })),
		connected,
		mapVersion,
	};
}
