import { describe, expect, it } from "vitest";
import { applyMessage, isStale, STALE_MS } from "./fleet";

const poses = {
	type: "poses",
	poses: [
		{ robot: "robot-a", x: 1.5, y: -2.25, theta: Math.PI / 2 },
		{ robot: "robot-b", x: 4, y: 0.5, theta: 0 },
	],
};

describe("applyMessage", () => {
	it("merges every message type per robot", () => {
		let f = applyMessage({}, poses, 1);
		f = applyMessage(f, {
			type: "state",
			robot: "robot-a",
			online: true,
			mode: "run",
			label: "RUN",
		});
		f = applyMessage(f, {
			type: "plan",
			robot: "robot-a",
			points: [
				[1, -1],
				[2.5, 0],
			],
		});
		f = applyMessage(f, {
			type: "battery",
			robot: "robot-a",
			charge: 87.5,
			charging: true,
			eStop: false,
		});
		f = applyMessage(f, {
			type: "alarms",
			robot: "robot-a",
			alarms: [{ code: "7", level: "WARN", text: "hot" }],
		});
		f = applyMessage(f, { type: "link", robot: "robot-a", up: true });

		expect(f["robot-a"]).toMatchObject({
			pose: { x: 1.5, y: -2.25 },
			seenAt: 1,
			online: true,
			mode: "run",
			label: "RUN",
			plan: [
				[1, -1],
				[2.5, 0],
			],
			battery: { charge: 87.5, charging: true, eStop: false },
			alarms: [{ code: "7", level: "WARN", text: "hot" }],
			link: true,
		});
		// a fresh robot has no detail data yet
		expect(f["robot-b"]).toMatchObject({
			battery: null,
			alarms: [],
			link: null,
		});
	});

	it("never throws on malformed messages, keeping good entries", () => {
		const junk = [
			null,
			42,
			{ type: "nope" },
			{ type: "poses", poses: "x" },
			{ type: "poses", poses: [{ robot: "r", x: 1 }] },
			{ type: "state", robot: "r" },
			{ type: "plan", robot: "r", points: [[1, "x"]] },
			{ type: "battery", robot: "r", charge: "full" },
			{ type: "alarms", robot: 3, alarms: [] },
			{ type: "link", robot: "r" },
		];
		for (const m of junk) expect(applyMessage({}, m)).toEqual({});

		const mixed = applyMessage(
			{},
			{ type: "poses", poses: [{ robot: "bad" }, poses.poses[1]] },
		);
		expect(Object.keys(mixed)).toEqual(["robot-b"]);
	});
});

describe("isStale", () => {
	it("goes stale when offline or when poses stop arriving", () => {
		const t0 = 1_000_000;
		const f = applyMessage({}, poses, t0);
		expect(isStale(f["robot-a"], t0 + STALE_MS)).toBe(false);
		expect(isStale(f["robot-a"], t0 + STALE_MS + 1)).toBe(true);
		const off = applyMessage(f, {
			type: "state",
			robot: "robot-a",
			online: false,
			mode: "other",
			label: "",
		});
		expect(isStale(off["robot-a"], t0)).toBe(true);
	});
});
