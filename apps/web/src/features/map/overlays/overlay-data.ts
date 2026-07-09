// Representative overlay data in the ROS/world frame (meters), keyed to the
// bundled demo map (origin [-10,-8], 20×16 m). Real overlays replace this later.

export type XY = [number, number];

export interface HeatGrid {
	cols: number;
	rows: number;
	/** intensity 0..1, row 0 = bottom (min y), matches DataTexture order */
	data: Float32Array;
}

export interface Zone {
	id: string;
	nameKey: "zone_lobby" | "zone_corridor" | "zone_charging";
	/** min corner + size, meters */
	x: number;
	y: number;
	w: number;
	h: number;
	color: string; // css var
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

const BOUNDS = { minX: -10, maxX: 10, minY: -8, maxY: 8 };
const seedOf = (id: string) =>
	id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);

// Lawnmower coverage path in the left room (clearly free space), varied per robot.
function makePath(seed: number): XY[] {
	const x0 = -8;
	const x1 = -1.9;
	const y0 = -6 + (seed % 3) * 0.4;
	const y1 = 6;
	const step = 1.2;
	const pts: XY[] = [];
	let dir = 1;
	for (let y = y0; y <= y1; y += step) {
		const xa = dir > 0 ? x0 : x1;
		const xb = dir > 0 ? x1 : x0;
		const n = 6;
		for (let k = 0; k <= n; k++) {
			const t = k / n;
			const x = xa + (xb - xa) * t;
			pts.push([x, y + Math.sin((x + seed) * 1.3) * 0.12]);
		}
		dir *= -1;
	}
	return pts;
}

// Coverage heatmap: intensity decays with distance from the path.
function makeHeat(path: XY[]): HeatGrid {
	const cols = 48;
	const rows = 38;
	const data = new Float32Array(cols * rows);
	const sigma2 = 2 * 0.85 * 0.85;
	for (let r = 0; r < rows; r++) {
		const wy = BOUNDS.minY + ((r + 0.5) / rows) * (BOUNDS.maxY - BOUNDS.minY);
		for (let c = 0; c < cols; c++) {
			const wx = BOUNDS.minX + ((c + 0.5) / cols) * (BOUNDS.maxX - BOUNDS.minX);
			let best = Infinity;
			for (const [px, py] of path) {
				const d = (px - wx) ** 2 + (py - wy) ** 2;
				if (d < best) best = d;
			}
			data[r * cols + c] = Math.exp(-best / sigma2);
		}
	}
	return { cols, rows, data };
}

const ZONES: Zone[] = [
	{
		id: "lobby",
		nameKey: "zone_lobby",
		x: -8.2,
		y: -6.6,
		w: 6.6,
		h: 5.2,
		color: "var(--data-3)",
	},
	{
		id: "corridor",
		nameKey: "zone_corridor",
		x: -0.9,
		y: -1.3,
		w: 9.4,
		h: 2.2,
		color: "var(--data-4)",
	},
	{
		id: "charging",
		nameKey: "zone_charging",
		x: 4.6,
		y: -6.6,
		w: 3.8,
		h: 3.2,
		color: "var(--data-1)",
	},
];

export function getOverlays(robotId: string): Overlays {
	const seed = seedOf(robotId);
	const path = makePath(seed);
	return { path, heat: makeHeat(path), zones: ZONES };
}
