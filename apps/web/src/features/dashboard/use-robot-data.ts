import { useEffect, useState } from "react";
import { HISTORY_URL } from "#/features/live/use-fleet-live";
import {
	type AsyncState,
	fetchRobotData,
	type RangeDays,
	type RobotData,
} from "./demo-data";

/** Live history keeps growing, so it's re-read in the background; demo data doesn't change. */
const REFRESH_MS = HISTORY_URL ? 60_000 : 0;

/** Loads robot data behind the async boundary. Mirrors useRosMap. */
export function useRobotData(
	robotId: string,
	days: RangeDays,
	refreshMs = REFRESH_MS,
) {
	const [nonce, setNonce] = useState(0);
	const [state, setState] = useState<AsyncState<RobotData>>({
		status: "loading",
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the retry trigger
	useEffect(() => {
		const ctrl = new AbortController();
		setState({ status: "loading" });
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
	}, [robotId, days, nonce, refreshMs]);

	return { state, retry: () => setNonce((n) => n + 1) };
}
