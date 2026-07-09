import { useEffect, useState } from "react";
import {
	type AsyncState,
	fetchRobotData,
	type RangeDays,
	type RobotData,
} from "./demo-data";

/** Loads robot data behind the async boundary. Mirrors useRosMap. */
export function useRobotData(robotId: string, days: RangeDays) {
	const [nonce, setNonce] = useState(0);
	const [state, setState] = useState<AsyncState<RobotData>>({
		status: "loading",
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the retry trigger
	useEffect(() => {
		const ctrl = new AbortController();
		setState({ status: "loading" });
		fetchRobotData(robotId, days, ctrl.signal)
			.then((data) => {
				if (!ctrl.signal.aborted) setState({ status: "ready", data });
			})
			.catch((err: Error) => {
				if (err.name !== "AbortError")
					setState({ status: "error", message: err.message });
			});
		return () => ctrl.abort();
	}, [robotId, days, nonce]);

	return { state, retry: () => setNonce((n) => n + 1) };
}
