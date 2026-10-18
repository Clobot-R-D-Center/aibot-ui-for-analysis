import { useEffect, useState } from "react";
import { GATEWAY_HTTP } from "#/features/live/use-fleet-live";
import { rangeOf, type Window } from "./time-view";

/** A robot's state over the window: [start, end, "off" | mode] (ms). */
export type Band = [number, number, string];

/** What the gateway's GET /timeline returns (apps/gateway/src/history.ts). */
export interface TimelineData {
	from: number;
	to: number;
	robots: { robot: string; bands: Band[] }[];
	/** fleet km per equal bucket of [from, to) */
	distance: number[];
}

// ponytail: tuning knobs — a live window slides at this pace, and a burst of
// wheel/drag changes is fetched once it pauses for DEBOUNCE_MS.
const LIVE_REFRESH_MS = 10_000;
const DEBOUNCE_MS = 150;

/**
 * The fleet timeline for a window, in `n` distance buckets. Keeps showing the
 * last answer while a new window loads or a refresh fails, so a pan or zoom
 * never blanks it.
 */
export function useTimeline(win: Window, n: number): TimelineData | null {
	const [data, setData] = useState<TimelineData | null>(null);
	const { span, end } = win;

	useEffect(() => {
		if (n < 1) return;
		const ctrl = new AbortController();
		const load = () => {
			const { from, to } = rangeOf({ span, end }, Date.now());
			const q = new URLSearchParams({
				from: String(Math.round(from)),
				to: String(Math.round(to)),
				n: String(n),
			});
			fetch(`${GATEWAY_HTTP}/timeline?${q}`, { signal: ctrl.signal })
				.then((r) => (r.ok ? r.json() : null))
				.then((d: TimelineData | null) => {
					if (d && !ctrl.signal.aborted) setData(d);
				})
				.catch(() => {}); // keep what is shown; the next load may work
		};
		const first = setTimeout(load, DEBOUNCE_MS);
		const live = end === null ? setInterval(load, LIVE_REFRESH_MS) : 0;
		return () => {
			ctrl.abort();
			clearTimeout(first);
			clearInterval(live);
		};
	}, [span, end, n]);

	return data;
}
