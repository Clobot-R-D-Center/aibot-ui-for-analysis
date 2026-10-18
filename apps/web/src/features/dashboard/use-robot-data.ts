import { useEffect, useRef, useState } from "react";
import { rangeOf, type Window } from "#/features/timeline/time-view";
import { type AsyncState, fetchRobotData, type RobotData } from "./robot-data";

/** History keeps growing, so it's re-read in the background. */
const REFRESH_MS = 60_000;
/**
 * A wheel or drag on the timeline changes the window many times a second;
 * ask once it settles. The gateway computes each answer to the end even when
 * the browser has given up on it, and meanwhile it relays nothing live.
 */
const DEBOUNCE_MS = 250;

/**
 * Loads robot data behind the async boundary. Mirrors useRosMap. A live
 * window is re-read with the time of each refresh. A change of `key` (e.g. a
 * new mapping session) reloads right away instead of waiting for the next
 * background refresh. Another window keeps showing the current data until
 * its own arrives; only another robot starts from loading.
 */
export function useRobotData(
	robotId: string,
	win: Window,
	{
		refreshMs = REFRESH_MS,
		key = "",
	}: { refreshMs?: number; key?: string } = {},
) {
	const [nonce, setNonce] = useState(0);
	const [state, setState] = useState<AsyncState<RobotData>>({
		status: "loading",
	});

	const { span, end } = win;
	const shown = useRef(""); // the robot whose data the state holds
	// biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` and `key` are reload triggers
	useEffect(() => {
		if (robotId !== shown.current) {
			shown.current = robotId;
			setState({ status: "loading" });
		}
		if (!robotId) return; // no robot yet (none live or recorded)
		const ctrl = new AbortController();
		// A background refresh never flips to loading/error: the panels keep
		// what they show, and a later refresh (or retry) can still succeed.
		const load = (background: boolean) =>
			fetchRobotData(robotId, rangeOf({ span, end }, Date.now()), ctrl.signal)
				.then((data) => {
					if (!ctrl.signal.aborted) setState({ status: "ready", data });
				})
				.catch((err: Error) => {
					if (err.name !== "AbortError" && !background)
						setState({ status: "error", message: err.message });
				});
		const first = setTimeout(() => load(false), DEBOUNCE_MS);
		const id = refreshMs ? setInterval(() => load(true), refreshMs) : 0;
		return () => {
			ctrl.abort();
			clearTimeout(first);
			clearInterval(id);
		};
	}, [robotId, span, end, nonce, refreshMs, key]);

	return {
		state,
		// A retry is asked for: show that it is under way.
		retry: () => {
			setState({ status: "loading" });
			setNonce((n) => n + 1);
		},
	};
}
