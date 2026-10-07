import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { mapPng, mapVersion, mapYaml, readMapFile, validGrid } from "./map.ts";

// 3×2 grid, row 0 = bottom: [free, occupied, unknown] / [50 %, 10 %, 100 %]
const grid = {
	resolution: 0.05,
	origin: { x: -1.5, y: 2, yaw: 0 },
	width: 3,
	height: 2,
	data: [0, 100, -1, 50, 10, 100],
};

/** Minimal reader for our own PNGs (one IDAT, filter 0). */
function readPng(png: Buffer) {
	assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
	const w = png.readUInt32BE(16);
	const h = png.readUInt32BE(20);
	const idatLen = png.readUInt32BE(33);
	assert.equal(png.toString("ascii", 37, 41), "IDAT");
	const raw = inflateSync(png.subarray(41, 41 + idatLen));
	const rows = [];
	for (let r = 0; r < h; r++)
		rows.push([...raw.subarray(r * (w + 1) + 1, (r + 1) * (w + 1))]);
	return { w, h, rows };
}

test("encodes the grid as a map_server image, top row first", () => {
	const { w, h, rows } = readPng(mapPng(grid));
	assert.equal(w, 3);
	assert.equal(h, 2);
	// image top = grid row 1: 50 % → unknown, 10 % → free, 100 % → occupied
	assert.deepEqual(rows[0], [205, 254, 0]);
	assert.deepEqual(rows[1], [254, 0, 205]);
});

test("writes the yaml the dashboard parses", () => {
	assert.equal(
		mapYaml(grid),
		"image: map.png\nresolution: 0.05\norigin: [-1.5, 2, 0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n",
	);
});

test("version changes with content, not with the array type", () => {
	assert.equal(
		mapVersion(grid),
		mapVersion({ ...grid, data: Int8Array.from(grid.data) }),
	);
	assert.notEqual(
		mapVersion(grid),
		mapVersion({ ...grid, data: [0, 100, -1, 50, 10, 0] }),
	);
});

test("rejects grids that don't match their size", () => {
	assert.ok(validGrid(grid));
	assert.ok(!validGrid({ ...grid, width: 4 }));
	assert.ok(!validGrid({ ...grid, resolution: 0 }));
});

test("serves a site map file as is, with its image renamed", () => {
	const dir = mkdtempSync(join(tmpdir(), "map-"));
	writeFileSync(join(dir, "office.png"), mapPng(grid));
	writeFileSync(
		join(dir, "map.yaml"),
		"image: office.png\nresolution: 0.05\norigin: [-8.4, -7.5, 0]\nname: office\n",
	);
	const f = readMapFile(join(dir, "map.yaml"));
	assert.match(f.yaml, /^image: map\.png$/m);
	assert.match(f.yaml, /^origin: \[-8\.4, -7\.5, 0\]$/m); // the rest untouched
	assert.equal(f.resolution, 0.05);
	assert.deepEqual(f.png, mapPng(grid));
	assert.equal(readMapFile(join(dir, "map.yaml")).version, f.version);

	writeFileSync(join(dir, "pgm.yaml"), "image: map.pgm\nresolution: 0.05\n");
	assert.throws(() => readMapFile(join(dir, "pgm.yaml")), /must be a PNG/);
});
