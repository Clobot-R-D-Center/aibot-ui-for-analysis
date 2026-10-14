import assert from "node:assert/strict";
import { test } from "node:test";
import { circle, loop, nextNode, placeOf } from "./index.ts";

test("a robot is at a node near it, else on the link between", () => {
	// a 6 × 1 loop, N1 at (0, 0): stops at s = 0, 6, 7, 13 (length 14)
	const r = loop(
		[
			[0, 0],
			[6, 0],
			[6, 1],
			[0, 1],
		],
		[1, 2, 3, 4],
	);
	assert.deepEqual(placeOf(r, 0.1), { node: "N1" });
	assert.deepEqual(placeOf(r, 3), { link: "L1-2" });
	assert.deepEqual(placeOf(r, 6.5), { link: "L2-3" });
	assert.deepEqual(placeOf(r, 10), { link: "L3-4" });
	assert.deepEqual(placeOf(r, 13.5), { link: "L4-1" }); // wraps to the start
	assert.deepEqual(placeOf(r, 13.9), { node: "N1" }); // just before s = 0
	assert.deepEqual(placeOf(r, 14 + 3), { link: "L1-2" }); // next lap
	assert.equal(nextNode(r, 3), "N2");
	assert.equal(nextNode(r, 13.5), "N1");

	const c = circle(0, 0, 2, [9, 10, 11, 12]);
	assert.deepEqual(placeOf(c, Math.PI), { node: "N10" }); // 90°
	assert.deepEqual(placeOf(c, Math.PI / 2), { link: "L9-10" });
});
