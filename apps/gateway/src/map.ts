// The site map: a map_server map on disk (map.yaml + its PNG), served as is,
// and its meta (graph, zones).
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import type { Site } from "@aibot/fleet-adapter";

/**
 * Reads a map_server map. The yaml's image is renamed to the served map.png;
 * browsers can't draw PGM, so PNG only.
 */
export function readMapFile(yamlPath: string) {
	const yamlText = readFileSync(yamlPath, "utf8");
	const image = yamlText.match(/^\s*image\s*:\s*["']?(.+?)["']?\s*$/m)?.[1];
	if (!image) throw new Error(`${yamlPath}: no 'image'`);
	if (extname(image).toLowerCase() !== ".png")
		throw new Error(`${yamlPath}: image ${image} must be a PNG`);
	const resolution = Number(
		yamlText.match(/^\s*resolution\s*:\s*([\d.]+)/m)?.[1],
	);
	if (!(resolution > 0)) throw new Error(`${yamlPath}: bad 'resolution'`);
	const png = readFileSync(resolve(dirname(yamlPath), image));
	const yaml = yamlText.replace(/^\s*image\s*:.*$/m, "image: map.png");
	const version = `file-${createHash("sha1").update(yaml).update(png).digest("hex").slice(0, 12)}`;
	return { yaml, png, version };
}

/**
 * The neutral map meta: site.json next to the map.yaml (null if there's none).
 * Served as is; the dashboard checks every field.
 */
export function readSiteFile(yamlPath: string): Site | null {
	const file = resolve(dirname(yamlPath), "site.json");
	return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}
