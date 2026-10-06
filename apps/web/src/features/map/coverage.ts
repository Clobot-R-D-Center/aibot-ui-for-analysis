import type { HeatGrid } from "./overlays/overlay-data";
import { classifyPixel, type RosMapMeta } from "./ros-map";
import type { LoadedMap } from "./use-ros-map";

// Coverage needs the map's free space as the denominator, which only the UI
// has, so the gateway sends visited world-aligned cells (floor(x / cell)) and
// this file grids the loaded map the same way.

export interface CellGrid {
	cell: number;
	/** world cell index of column 0 / row 0 (row 0 = min y, like HeatGrid) */
	cx0: number;
	cy0: number;
	cols: number;
	rows: number;
	/** 1 where the cell is mostly free space */
	free: Uint8Array;
	freeCount: number;
}

/** Grid the occupancy image (RGBA, row 0 = top) into world-aligned cells. */
export function freeGrid(
	rgba: Uint8ClampedArray,
	w: number,
	h: number,
	meta: RosMapMeta,
	cell: number,
): CellGrid {
	const [ox, oy] = meta.origin;
	const res = meta.resolution;
	const cx0 = Math.floor(ox / cell);
	const cy0 = Math.floor(oy / cell);
	const cols = Math.floor((ox + w * res) / cell) - cx0 + 1;
	const rows = Math.floor((oy + h * res) / cell) - cy0 + 1;
	const total = new Uint32Array(cols * rows);
	const freePx = new Uint32Array(cols * rows);
	for (let py = 0; py < h; py++) {
		const r = Math.floor((oy + (h - py - 0.5) * res) / cell) - cy0;
		for (let px = 0; px < w; px++) {
			const i = r * cols + Math.floor((ox + (px + 0.5) * res) / cell) - cx0;
			total[i]++;
			const p = (py * w + px) * 4;
			// transparent = unknown, as in OccupancyLayer
			if (rgba[p + 3] >= 128 && classifyPixel(rgba[p], meta) === "free")
				freePx[i]++;
		}
	}
	const free = new Uint8Array(cols * rows);
	let freeCount = 0;
	for (let i = 0; i < free.length; i++)
		if (total[i] > 0 && freePx[i] * 2 >= total[i]) {
			free[i] = 1;
			freeCount++;
		}
	return { cell, cx0, cy0, cols, rows, free, freeCount };
}

const indexOf = (g: CellGrid, cx: number, cy: number) => {
	const c = cx - g.cx0;
	const r = cy - g.cy0;
	return c >= 0 && c < g.cols && r >= 0 && r < g.rows ? r * g.cols + c : -1;
};

/** % of the map's free cells visited (cells off the map or in walls don't count). */
export function coveragePct(g: CellGrid, cells: number[][]): number {
	if (g.freeCount === 0) return 0;
	let hit = 0;
	for (const [cx, cy] of cells) {
		const i = indexOf(g, cx, cy);
		if (i >= 0 && g.free[i]) hit++;
	}
	return (hit / g.freeCount) * 100;
}

/**
 * Visit counts as a heatmap over the grid. sqrt keeps rarely visited cells
 * visible next to a dock the robot sits on all day.
 */
// ponytail: the grid overhangs the map rect by < 1 cell, so the heatmap
// stretches by up to `cell` m; crop to the rect if that ever shows.
export function heatFrom(g: CellGrid, cells: number[][]): HeatGrid {
	const data = new Float32Array(g.cols * g.rows);
	let max = 0;
	for (const [cx, cy, n = 1] of cells) {
		const i = indexOf(g, cx, cy);
		if (i < 0) continue;
		data[i] = n;
		if (n > max) max = n;
	}
	if (max > 0)
		for (let i = 0; i < data.length; i++) data[i] = Math.sqrt(data[i] / max);
	return { cols: g.cols, rows: g.rows, data };
}

/** Read the loaded map's pixels (DOM) and grid them. */
export function mapFreeGrid(map: LoadedMap, cell: number): CellGrid {
	const cv = document.createElement("canvas");
	cv.width = map.widthPx;
	cv.height = map.heightPx;
	const ctx = cv.getContext("2d");
	if (!ctx) throw new Error("2d context unavailable");
	ctx.drawImage(map.image, 0, 0);
	const { data } = ctx.getImageData(0, 0, map.widthPx, map.heightPx);
	return freeGrid(data, map.widthPx, map.heightPx, map.meta, cell);
}
