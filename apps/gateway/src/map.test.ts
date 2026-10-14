import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readMap, readSite } from "./map.ts";

test("serves a map folder as is, with its image renamed", () => {
	const dir = mkdtempSync(join(tmpdir(), "map-"));
	const png = Buffer.from("not really a png");
	writeFileSync(join(dir, "office.png"), png);
	writeFileSync(
		join(dir, "map.yaml"),
		"image: office.png\nresolution: 0.05\norigin: [-8.4, -7.5, 0]\nname: office\n",
	);
	const f = readMap(dir);
	assert.match(f.yaml, /^image: map\.png$/m);
	assert.equal(f.yaml.match(/image:/g)?.length, 1);
	assert.match(f.yaml, /^origin: \[-8\.4, -7\.5, 0\]$/m); // the rest untouched
	assert.deepEqual(f.png, png);
	assert.equal(readMap(dir).version, f.version);

	assert.equal(readSite(dir), null); // no meta: fine
	writeFileSync(join(dir, "site.json"), '{"nodes":[],"links":[],"zones":[]}');
	assert.deepEqual(readSite(dir), { nodes: [], links: [], zones: [] });

	// an absolute image path, as map_server allows
	writeFileSync(
		join(dir, "map.yaml"),
		`image: ${join(dir, "office.png")}\nresolution: 0.05\n`,
	);
	assert.deepEqual(readMap(dir).png, png);

	writeFileSync(join(dir, "map.yaml"), "image: map.pgm\nresolution: 0.05\n");
	assert.throws(() => readMap(dir), /must be a PNG/);
});

test("a map.yaml without 'image' uses the folder's map.png", () => {
	// e.g. an engine that rewrites the yaml with only the keys it knows
	const dir = mkdtempSync(join(tmpdir(), "map-"));
	writeFileSync(join(dir, "map.png"), "png");
	writeFileSync(join(dir, "map.yaml"), "origin: [0, 0, 0]\nresolution: 0.05\n");
	const f = readMap(dir);
	assert.match(f.yaml, /^image: map\.png$/m);
	assert.equal(f.png.toString(), "png");
});
