import { describe, expect, it } from "vitest";
import { coveragePct, freeGrid, heatFrom } from "./coverage";
import type { RosMapMeta } from "./ros-map";

// 4×2 px map at 0.5 m/px, origin (-1, 0): world x ∈ [-1, 1), y ∈ [0, 1).
// Top row (y ∈ [0.5, 1)): free free wall wall; bottom row: all free.
const meta: RosMapMeta = {
	image: "map.png",
	resolution: 0.5,
	origin: [-1, 0, 0],
	negate: 0,
	occupiedThresh: 0.65,
	freeThresh: 0.196,
};
const px = (gray: number) => [gray, gray, gray, 255];
const rgba = new Uint8ClampedArray([
	...px(254),
	...px(254),
	...px(0),
	...px(0),
	...px(254),
	...px(254),
	...px(254),
	...px(254),
]);

describe("coverage", () => {
	// 1 m cells: cx ∈ {-1, 0}, cy ∈ {0} → each cell holds 2×2 px.
	const g = freeGrid(rgba, 4, 2, meta, 1);

	it("grids the map into world-aligned cells, free when mostly free", () => {
		expect(g).toMatchObject({ cx0: -1, cy0: 0, cols: 3, rows: 2 });
		// cell (-1,0): 4 free px → free. cell (0,0): 2 free + 2 wall → free (≥ half).
		expect(g.freeCount).toBe(2);
	});

	it("counts visited free cells only", () => {
		expect(coveragePct(g, [[-1, 0, 5]])).toBe(50);
		expect(
			coveragePct(g, [
				[-1, 0],
				[0, 0],
				[7, 7], // off the map
			]),
		).toBe(100);
		expect(coveragePct(g, [])).toBe(0);
	});

	it("builds a heatmap normalized to the busiest cell", () => {
		const heat = heatFrom(g, [
			[-1, 0, 4],
			[0, 0, 1],
		]);
		expect(heat.cols).toBe(3);
		expect(heat.data[0]).toBe(1);
		expect(heat.data[1]).toBeCloseTo(0.5);
	});

	it("handles the same grid at a finer cell size", () => {
		const fine = freeGrid(rgba, 4, 2, meta, 0.5);
		expect(fine.freeCount).toBe(6); // 8 px, 2 walls
	});
});
