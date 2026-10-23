import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { webFile } from "./web.ts";

test("serves the build's files, the app shell for its routes, nothing outside", () => {
	const dir = mkdtempSync(join(tmpdir(), "web-"));
	mkdirSync(join(dir, "assets"));
	writeFileSync(join(dir, "index.html"), "<html>");
	writeFileSync(join(dir, "assets", "index-abc.js"), "");

	assert.equal(
		webFile(dir, "/assets/index-abc.js"),
		join(dir, "assets", "index-abc.js"),
	);
	assert.equal(webFile(dir, "/"), join(dir, "index.html"));
	assert.equal(webFile(dir, "/ko/"), join(dir, "index.html"));
	assert.equal(webFile(dir, "/assets"), join(dir, "index.html")); // a folder: a route
	assert.equal(webFile(dir, "/index.html/x"), join(dir, "index.html")); // ENOTDIR: no throw
	assert.equal(webFile(dir, `/${"a".repeat(256)}.js`), null); // ENAMETOOLONG: no throw
	assert.equal(webFile(dir, "/assets/index-old.js"), null); // gone after an upgrade
	assert.equal(webFile(dir, "/../outside.html"), null);
});
