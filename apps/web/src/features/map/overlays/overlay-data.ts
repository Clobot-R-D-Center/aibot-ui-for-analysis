// Map overlay types: what the gateway's data turns into on the map.

export type XY = [number, number];

export interface HeatGrid {
	cols: number;
	rows: number;
	/** intensity 0..1, row 0 = bottom (min y), matches DataTexture order */
	data: Float32Array;
}

export type LayerKey = "robot" | "path" | "graph" | "zones" | "heatmap";
export type LayerVisibility = Record<LayerKey, boolean>;

export const DEFAULT_LAYERS: LayerVisibility = {
	robot: true,
	path: true,
	graph: true,
	zones: true,
	heatmap: false,
};
