// The site map: a map_server map on disk (map.yaml + its PNG), served as is.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

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
