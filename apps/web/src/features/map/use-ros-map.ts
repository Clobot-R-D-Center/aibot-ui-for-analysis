import { useEffect, useState } from "react";
import { parseMapYaml, type RosMapMeta } from "./ros-map";

export interface LoadedMap {
	meta: RosMapMeta;
	image: HTMLImageElement;
	widthPx: number;
	heightPx: number;
}

export type MapState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; map: LoadedMap };

function loadImage(
	url: string,
	signal: AbortSignal,
): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.decoding = "async";
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Could not load image: ${url}`));
		signal.addEventListener("abort", () =>
			reject(new DOMException("aborted", "AbortError")),
		);
		img.src = url;
	});
}

/**
 * Loads a ROS map from a directory holding `map.yaml` + its image.
 * `nonce` forces a reload (retry). Mirrors dropping in real map_server output.
 */
export function useRosMap(baseUrl: string, nonce = 0): MapState {
	const [state, setState] = useState<MapState>({ status: "loading" });

	// biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the retry trigger
	useEffect(() => {
		const ctrl = new AbortController();
		setState({ status: "loading" });

		(async () => {
			try {
				const base = baseUrl.replace(/\/$/, "");
				const res = await fetch(`${base}/map.yaml`, { signal: ctrl.signal });
				if (!res.ok) throw new Error(`map.yaml: HTTP ${res.status}`);
				const meta = parseMapYaml(await res.text());
				const image = await loadImage(`${base}/${meta.image}`, ctrl.signal);
				if (ctrl.signal.aborted) return;
				setState({
					status: "ready",
					map: {
						meta,
						image,
						widthPx: image.naturalWidth,
						heightPx: image.naturalHeight,
					},
				});
			} catch (err) {
				if ((err as Error).name === "AbortError") return;
				setState({ status: "error", message: (err as Error).message });
			}
		})();

		return () => ctrl.abort();
	}, [baseUrl, nonce]);

	return state;
}
