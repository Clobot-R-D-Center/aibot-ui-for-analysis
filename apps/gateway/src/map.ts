// The site map: a folder holding a map_server map (map.yaml + its PNG), served
// as is, and its meta (graph, zones).
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { Site } from "@aibot/fleet-adapter";

/**
 * Reads the folder's map.yaml and its image. The served yaml always names
 * map.png; browsers can't draw PGM, so PNG only.
 */
export function readMap(dir: string) {
	const yamlPath = join(dir, "map.yaml");
	const yamlText = readFileSync(yamlPath, "utf8");
	// Some engines rewrite map.yaml without 'image'; the folder's map.png it is.
	const image =
		yamlText.match(/^\s*image\s*:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? "map.png";
	if (extname(image).toLowerCase() !== ".png")
		throw new Error(`${yamlPath}: image ${image} must be a PNG`);
	const resolution = Number(
		yamlText.match(/^\s*resolution\s*:\s*([\d.]+)/m)?.[1],
	);
	if (!(resolution > 0)) throw new Error(`${yamlPath}: bad 'resolution'`);
	const png = readFileSync(resolve(dir, image)); // map_server allows an absolute path
	const yaml = `image: map.png\n${yamlText.replace(/^\s*image\s*:.*\n?/m, "")}`;
	const version = `file-${createHash("sha1").update(yaml).update(png).digest("hex").slice(0, 12)}`;
	return { yaml, png, version };
}

/**
 * The neutral map meta: the folder's site.json (null if there's none).
 * Served as is; the dashboard checks every field.
 */
export function readSite(dir: string): Site | null {
	const file = join(dir, "site.json");
	return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}
