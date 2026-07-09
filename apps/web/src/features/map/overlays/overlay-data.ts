import type { RobotPose } from "../ros-map";

// Representative overlay data, generated RELATIVE TO THE LOADED MAP's world
// bounds so it sits sensibly on whatever map is loaded. Still demo data — real
// path/heatmap/zones/pose replace getOverlays()/getDemoPose() later.

export type XY = [number, number];

export interface Bounds {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

export interface HeatGrid {
	cols: number;
	rows: number;
	/** intensity 0..1, row 0 = bottom (min y), matches DataTexture order */
	data: Float32Array;
}

export interface Zone {
	id: string;
	nameKey: "zone_lobby" | "zone_corridor" | "zone_charging";
	x: number;
	y: number;
	w: number;
	h: number;
	color: string;
}

export interface Overlays {
	path: XY[];
	heat: HeatGrid;
	zones: Zone[];
}

export type LayerKey = "robot" | "path" | "heatmap" | "zones";
export type LayerVisibility = Record<LayerKey, boolean>;

export const DEFAULT_LAYERS: LayerVisibility = {
	robot: true,
	path: true,
	heatmap: false,
	zones: false,
};

const seedOf = (id: string) =>
	id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
const noise = (a: number, b: number) => {
	const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
	return s - Math.floor(s);
};

// Lawnmower coverage path over the left ~45% of the map interior.
function makePath(seed: number, b: Bounds): XY[] {
	const W = b.maxX - b.minX;
	const H = b.maxY - b.minY;
	const x0 = b.minX + 0.1 * W;
	const x1 = b.minX + 0.52 * W;
	const y0 = b.minY + 0.12 * H + (seed % 3) * 0.02 * H;
	const y1 = b.maxY - 0.12 * H;
	const step = H * 0.09;
	const pts: XY[] = [];
	let dir = 1;
	for (let y = y0; y <= y1; y += step) {
		const xa = dir > 0 ? x0 : x1;
		const xb = dir > 0 ? x1 : x0;
		for (let k = 0; k <= 6; k++) {
			const t = k / 6;
			pts.push([
				xa + (xb - xa) * t,
				y + Math.sin((k + seed) * 1.3) * 0.015 * H,
			]);
		}
		dir *= -1;
	}
	return pts;
}

function makeHeat(path: XY[], b: Bounds): HeatGrid {
	const cols = 48;
	const rows = 38;
	const data = new Float32Array(cols * rows);
	const reach = ((b.maxX - b.minX) * 0.045) ** 2 * 2;
	for (let r = 0; r < rows; r++) {
		const wy = b.minY + ((r + 0.5) / rows) * (b.maxY - b.minY);
		for (let c = 0; c < cols; c++) {
			const wx = b.minX + ((c + 0.5) / cols) * (b.maxX - b.minX);
			let best = Infinity;
			for (const [px, py] of path) {
				const d = (px - wx) ** 2 + (py - wy) ** 2;
				if (d < best) best = d;
			}
			data[r * cols + c] = Math.exp(-best / reach);
		}
	}
	return { cols, rows, data };
}

function makeZones(b: Bounds): Zone[] {
	const W = b.maxX - b.minX;
	const H = b.maxY - b.minY;
	return [
		{
			id: "lobby",
			nameKey: "zone_lobby",
			x: b.minX + 0.06 * W,
			y: b.minY + 0.08 * H,
			w: 0.38 * W,
			h: 0.4 * H,
			color: "var(--data-3)",
		},
		{
			id: "corridor",
			nameKey: "zone_corridor",
			x: b.minX + 0.46 * W,
			y: b.minY + 0.43 * H,
			w: 0.48 * W,
			h: 0.14 * H,
			color: "var(--data-4)",
		},
		{
			id: "charging",
			nameKey: "zone_charging",
			x: b.minX + 0.64 * W,
			y: b.minY + 0.08 * H,
			w: 0.28 * W,
			h: 0.24 * H,
			color: "var(--data-1)",
		},
	];
}

export function getOverlays(robotId: string, b: Bounds): Overlays {
	const path = makePath(seedOf(robotId), b);
	return { path, heat: makeHeat(path, b), zones: makeZones(b) };
}

/** A plausible robot pose within the covered (left) region of the loaded map. */
export function getDemoPose(robotId: string, b: Bounds): RobotPose {
	const seed = seedOf(robotId);
	const W = b.maxX - b.minX;
	const H = b.maxY - b.minY;
	return {
		x: b.minX + (0.18 + 0.18 * noise(seed, 2)) * W,
		y: b.minY + (0.3 + 0.4 * noise(seed, 3)) * H,
		theta: noise(seed, 4) * Math.PI * 2,
	};
}
