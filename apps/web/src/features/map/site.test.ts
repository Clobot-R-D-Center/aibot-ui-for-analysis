import { describe, expect, it } from "vitest";
import { NO_SITE, parseSite } from "./site";

describe("parseSite", () => {
	it("keeps good entries and drops malformed ones", () => {
		const site = parseSite({
			nodes: [
				{ id: "N1", name: "dock", kind: "charge", x: 1, y: 2 },
				{ id: "N2", x: "1", y: 2 }, // string coordinate: dropped
			],
			links: [
				{
					id: "L1",
					oneWay: true,
					points: [
						[0, 0],
						[1, 1],
					],
				},
				{ id: "L2", points: [[0, 0]] }, // one point: dropped
			],
			zones: [
				{
					id: "Z1",
					kind: "blocked",
					points: [
						[0, 0],
						[1, 0],
						[1, 1],
					],
				},
				{
					id: "Z2",
					closed: false,
					points: [
						[0, 0],
						[1, 0],
					],
				},
				{
					id: "Z3",
					points: [
						[0, 0],
						[1, 0],
					],
				}, // a polygon needs 3
			],
		});
		expect(site.nodes).toEqual([
			{ id: "N1", name: "dock", kind: "charge", x: 1, y: 2 },
		]);
		expect(site.links).toEqual([
			{
				id: "L1",
				oneWay: true,
				points: [
					[0, 0],
					[1, 1],
				],
			},
		]);
		expect(site.zones.map((z) => [z.id, z.closed])).toEqual([
			["Z1", true],
			["Z2", false],
		]);
	});

	it("never throws on junk", () => {
		for (const j of [null, 42, "x", { nodes: "x", links: [null], zones: [7] }])
			expect(parseSite(j)).toEqual(NO_SITE);
	});
});
