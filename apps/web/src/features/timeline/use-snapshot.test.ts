// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { snapshotRobots } from "./use-snapshot";

describe("snapshotRobots", () => {
	it("reads a past fleet in the live shape, dropping bad entries", () => {
		const robots = snapshotRobots(
			[
				{
					robot: "a",
					online: true,
					mode: "run",
					label: "RUN",
					node: null,
					link: "L1-2",
					pose: { x: 1, y: 2, theta: 0.5 },
				},
				{
					robot: "b",
					online: false,
					mode: "other",
					label: "",
					pose: { x: 3, y: 4, theta: null },
				},
				{ robot: "c", online: true, pose: null }, // never moved yet
				{ robot: 7, online: true }, // bad name
				null,
			],
			1000,
		);
		expect(robots.map((r) => r.name)).toEqual(["a", "b", "c"]);
		expect(robots[0]).toMatchObject({
			pose: { x: 1, y: 2, theta: 0.5 },
			place: { link: "L1-2" },
			plan: [],
			stale: false,
		});
		expect(robots[1]).toMatchObject({
			pose: { theta: 0 },
			place: null,
			stale: true,
		});
		expect(robots[2].pose).toBeNull();
		expect(snapshotRobots({ not: "a list" }, 0)).toEqual([]);
	});
});
