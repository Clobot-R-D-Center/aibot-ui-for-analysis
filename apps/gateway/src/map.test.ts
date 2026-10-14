import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readMapFile, readSiteFile } from "./map.ts";

test("serves a site map file as is, with its image renamed", () => {
	const dir = mkdtempSync(join(tmpdir(), "map-"));
	const png = Buffer.from("not really a png");
	writeFileSync(join(dir, "office.png"), png);
	writeFileSync(
		join(dir, "map.yaml"),
		"image: office.png\nresolution: 0.05\norigin: [-8.4, -7.5, 0]\nname: office\n",
	);
	const f = readMapFile(join(dir, "map.yaml"));
	assert.match(f.yaml, /^image: map\.png$/m);
	assert.match(f.yaml, /^origin: \[-8\.4, -7\.5, 0\]$/m); // the rest untouched
	assert.deepEqual(f.png, png);
	assert.equal(readMapFile(join(dir, "map.yaml")).version, f.version);

	assert.equal(readSiteFile(join(dir, "map.yaml")), null); // no meta: fine
	writeFileSync(join(dir, "site.json"), '{"nodes":[],"links":[],"zones":[]}');
	assert.deepEqual(readSiteFile(join(dir, "map.yaml")), {
		nodes: [],
		links: [],
		zones: [],
	});

	writeFileSync(join(dir, "pgm.yaml"), "image: map.pgm\nresolution: 0.05\n");
	assert.throws(() => readMapFile(join(dir, "pgm.yaml")), /must be a PNG/);
});
