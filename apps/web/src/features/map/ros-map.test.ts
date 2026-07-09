import { describe, expect, it } from "vitest";
import { classifyPixel, mapWorldRect, parseMapYaml } from "./ros-map";

const SAMPLE = `image: map.png
resolution: 0.05
origin: [-10.0, -8.0, 0.0]
negate: 0
occupied_thresh: 0.65
free_thresh: 0.196
`;

describe("parseMapYaml", () => {
	it("parses the standard map_server shape", () => {
		const m = parseMapYaml(SAMPLE);
		expect(m.image).toBe("map.png");
		expect(m.resolution).toBe(0.05);
		expect(m.origin).toEqual([-10, -8, 0]);
		expect(m.negate).toBe(0);
		expect(m.occupiedThresh).toBe(0.65);
	});

	it("tolerates comments and quoted strings", () => {
		const m = parseMapYaml(
			`image: "map.png"  # the grid\nresolution: 0.1\norigin: [0, 0, 0]`,
		);
		expect(m.image).toBe("map.png");
		expect(m.resolution).toBe(0.1);
	});

	it("rejects missing image and bad resolution", () => {
		expect(() => parseMapYaml("resolution: 0.05")).toThrow(/image/);
		expect(() => parseMapYaml("image: m.png\nresolution: 0")).toThrow(
			/resolution/,
		);
	});
});

describe("classifyPixel (negate=0: white=free)", () => {
	const m = parseMapYaml(SAMPLE);
	it("classifies free / occupied / unknown", () => {
		expect(classifyPixel(254, m)).toBe("free");
		expect(classifyPixel(0, m)).toBe("occupied");
		expect(classifyPixel(205, m)).toBe("unknown");
	});
});

describe("mapWorldRect", () => {
	it("sizes and centers the plane in world meters", () => {
		const m = parseMapYaml(SAMPLE);
		const r = mapWorldRect(m, 400, 320);
		expect(r.width).toBeCloseTo(20);
		expect(r.height).toBeCloseTo(16);
		// origin is the lower-left pixel, so center = origin + half-extent
		expect(r.centerX).toBeCloseTo(0);
		expect(r.centerY).toBeCloseTo(0);
	});
});
