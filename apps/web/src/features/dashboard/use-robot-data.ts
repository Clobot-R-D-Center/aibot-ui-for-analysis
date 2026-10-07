import { useEffect, useState } from "react";
import {
	type AsyncState,
	fetchRobotData,
	type RangeDays,
	type RobotData,
} from "./robot-data";

/** History keeps growing, so it's re-read in the background. */
const REFRESH_MS = 60_000;

/**
 * Loads robot data behind the async boundary. Mirrors useRosMap. A change of
 * `key` (e.g. a new mapping session) reloads right away instead of waiting
 * for the next background refresh.
 */
export function useRobotData(
	robotId: string,
	days: RangeDays,
	{
		refreshMs = REFRESH_MS,
		key = "",
	}: { refreshMs?: number; key?: string } = {},
) {
	const [nonce, setNonce] = useState(0);
	const [state, setState] = useState<AsyncState<RobotData>>({
		status: "loading",
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` and `key` are reload triggers
	useEffect(() => {
		setState({ status: "loading" });
		if (!robotId) return; // no robot yet (the fleet hasn't reported a pose)
		const ctrl = new AbortController();
		// A background refresh never flips to loading/error: the panels keep
		// what they show, and a later refresh (or retry) can still succeed.
		const load = (background: boolean) =>
			fetchRobotData(robotId, days, ctrl.signal)
				.then((data) => {
					if (!ctrl.signal.aborted) setState({ status: "ready", data });
				})
				.catch((err: Error) => {
					if (err.name !== "AbortError" && !background)
						setState({ status: "error", message: err.message });
				});
		load(false);
		const id = refreshMs ? setInterval(() => load(true), refreshMs) : 0;
		return () => {
			ctrl.abort();
			clearInterval(id);
		};
	}, [robotId, days, nonce, refreshMs, key]);

	return { state, retry: () => setNonce((n) => n + 1) };
}
