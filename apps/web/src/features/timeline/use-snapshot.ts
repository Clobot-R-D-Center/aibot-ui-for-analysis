import { useEffect, useState } from "react";
import type { LiveRobot } from "#/features/live/fleet";
import { GATEWAY_HTTP } from "#/features/live/use-fleet-live";

// The fleet as it was at a past moment (GET /snapshot?t, see
// apps/gateway/src/history.ts), in the live feed's shape so the map draws it
// the same way.

export type PastRobot = LiveRobot & { stale: boolean };

// biome-ignore lint/suspicious/noExplicitAny: untrusted JSON, narrowed field by field below
type Wire = any;
const isNum = (v: unknown): v is number =>
	typeof v === "number" && Number.isFinite(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** /snapshot's robots → the live shape; malformed entries are dropped. */
export function snapshotRobots(json: unknown, t: number): PastRobot[] {
	if (!Array.isArray(json)) return [];
	return json.flatMap((r: Wire) => {
		if (typeof r?.robot !== "string" || typeof r.online !== "boolean")
			return [];
		const p = r.pose;
		const pose =
			p && isNum(p.x) && isNum(p.y)
				? // ponytail: samples from before headings were recorded have none; 0 then
					{ x: p.x, y: p.y, theta: isNum(p.theta) ? p.theta : 0 }
				: null;
		let place: LiveRobot["place"] = null;
		if (str(r.node)) place = { node: str(r.node) };
		else if (str(r.link)) place = { link: str(r.link) };
		return [
			{
				name: r.robot,
				pose,
				seenAt: t,
				plan: [], // plans aren't recorded
				online: r.online,
				mode: str(r.mode),
				label: str(r.label),
				place,
				// an offline robot is drawn faded where it was last seen
				stale: !r.online,
			},
		];
	});
}

const DEBOUNCE_MS = 120; // arrow keys and drags pick many moments in a row

export interface Snapshot {
	/** the moment `robots` show: may lag the asked one while it loads */
	at: number | null;
	/** the map session in force at `at` (null = none recorded) */
	session: string | null;
	robots: PastRobot[];
	/** the last request failed: `robots` are not the asked moment's */
	error: boolean;
	retry: () => void;
}

/** The fleet at `t` (null = live: nothing asked). */
export function useSnapshot(t: number | null): Snapshot {
	const [got, setGot] = useState<{
		at: number | null;
		session: string | null;
		robots: PastRobot[];
		error: boolean;
	}>({ at: null, session: null, robots: [], error: false });
	const [nonce, setNonce] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the retry trigger
	useEffect(() => {
		if (t === null) {
			setGot({ at: null, session: null, robots: [], error: false });
			return;
		}
		setGot((g) => ({ ...g, error: false }));
		const ctrl = new AbortController();
		const id = setTimeout(() => {
			fetch(`${GATEWAY_HTTP}/snapshot?t=${Math.round(t)}`, {
				signal: ctrl.signal,
			})
				.then((r) => {
					if (!r.ok) throw new Error(`snapshot: HTTP ${r.status}`);
					return r.json();
				})
				.then((j: Wire) => {
					if (ctrl.signal.aborted) return;
					setGot({
						at: t,
						session: typeof j?.session === "string" ? j.session : null,
						robots: snapshotRobots(j?.robots, t),
						error: false,
					});
				})
				.catch((e: Error) => {
					if (e.name !== "AbortError") setGot((g) => ({ ...g, error: true }));
				});
		}, DEBOUNCE_MS);
		return () => {
			ctrl.abort();
			clearTimeout(id);
		};
	}, [t, nonce]);

	return { ...got, retry: () => setNonce((n) => n + 1) };
}
