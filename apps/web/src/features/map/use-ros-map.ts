import { useEffect, useState } from "react";
import { parseMapYaml, type RosMapMeta } from "./ros-map";
import { NO_SITE, parseSite, type Site } from "./site";

export interface LoadedMap {
	meta: RosMapMeta;
	image: HTMLImageElement;
	widthPx: number;
	heightPx: number;
	/** graph and zones; empty when the map has none */
	site: Site;
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
		// The map may come from the gateway's origin; without CORS the canvas we
		// draw it on is tainted and getImageData (recolor, coverage) throws.
		img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Could not load image: ${url}`));
		signal.addEventListener("abort", () =>
			reject(new DOMException("aborted", "AbortError")),
		);
		img.src = url;
	});
}

/**
 * Loads a ROS map from a directory holding `map.yaml` + its image, and its
 * meta from `site.json` there (optional: missing or broken = none).
 * `nonce` forces a reload (retry, or a new map version). `baseUrl` null = no
 * map yet (stays loading). A reload keeps showing the current map until the
 * new one is in — and keeps it if the reload fails — so a replaced map
 * updates in place instead of blinking.
 */
export function useRosMap(
	baseUrl: string | null,
	nonce: number | string = 0,
): MapState {
	const [state, setState] = useState<MapState>({ status: "loading" });

	// biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the retry trigger
	useEffect(() => {
		if (!baseUrl) {
			setState({ status: "loading" });
			return;
		}
		const ctrl = new AbortController();
		setState((s) => (s.status === "ready" ? s : { status: "loading" }));

		(async () => {
			try {
				const base = baseUrl.replace(/\/$/, "");
				const res = await fetch(`${base}/map.yaml`, { signal: ctrl.signal });
				if (!res.ok) throw new Error(`map.yaml: HTTP ${res.status}`);
				const meta = parseMapYaml(await res.text());
				const [image, site] = await Promise.all([
					loadImage(`${base}/${meta.image}`, ctrl.signal),
					fetch(`${base}/site.json`, { signal: ctrl.signal })
						.then((r) => (r.ok ? r.json() : null))
						.then(parseSite, () => NO_SITE),
				]);
				if (ctrl.signal.aborted) return;
				setState({
					status: "ready",
					map: {
						meta,
						image,
						widthPx: image.naturalWidth,
						heightPx: image.naturalHeight,
						site,
					},
				});
			} catch (err) {
				if ((err as Error).name === "AbortError") return;
				const message = (err as Error).message;
				setState((s) =>
					s.status === "ready" ? s : { status: "error", message },
				);
			}
		})();

		return () => ctrl.abort();
	}, [baseUrl, nonce]);

	return state;
}
