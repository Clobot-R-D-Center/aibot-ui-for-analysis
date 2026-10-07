// The fleet map as map_server files (map.yaml + map.png), the format the
// dashboard already loads. PNG is hand-rolled on node:zlib: grayscale, one
// IDAT, no filtering — a few lines instead of a dependency.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import type { MapGrid } from "@aibot/fleet-adapter";

// map_server's trinary image and the thresholds that read it back.
const FREE = 254;
const OCCUPIED = 0;
const UNKNOWN = 205;
const FREE_THRESH = 0.196;
const OCCUPIED_THRESH = 0.65;

/** Rejects grids that don't describe themselves (wrong length, bad numbers). */
export function validGrid(g: MapGrid): boolean {
	return (
		Number.isInteger(g.width) &&
		Number.isInteger(g.height) &&
		g.width > 0 &&
		g.height > 0 &&
		g.data.length === g.width * g.height &&
		g.resolution > 0 &&
		[g.origin.x, g.origin.y, g.origin.yaw].every(Number.isFinite)
	);
}

/** Grayscale pixels, image row 0 = top (the grid's row 0 is the bottom). */
export function mapPixels(g: MapGrid): Uint8Array {
	const px = new Uint8Array(g.width * g.height);
	for (let row = 0; row < g.height; row++) {
		const src = (g.height - 1 - row) * g.width;
		for (let col = 0; col < g.width; col++) {
			const v = g.data[src + col];
			px[row * g.width + col] =
				v < 0
					? UNKNOWN
					: v / 100 >= OCCUPIED_THRESH
						? OCCUPIED
						: v / 100 <= FREE_THRESH
							? FREE
							: UNKNOWN;
		}
	}
	return px;
}

function chunk(type: string, data: Buffer): Buffer {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(data.length, 0);
	head.write(type, 4, "ascii");
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
	return Buffer.concat([head, data, crc]);
}

export function mapPng(g: MapGrid): Buffer {
	const px = mapPixels(g);
	const raw = Buffer.alloc((g.width + 1) * g.height); // each row: filter byte 0 + pixels
	for (let row = 0; row < g.height; row++)
		raw.set(
			px.subarray(row * g.width, (row + 1) * g.width),
			row * (g.width + 1) + 1,
		);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(g.width, 0);
	ihdr.writeUInt32BE(g.height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 0; // grayscale
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

export function mapYaml(g: MapGrid): string {
	const { x, y, yaw } = g.origin;
	return [
		"image: map.png",
		`resolution: ${g.resolution}`,
		`origin: [${x}, ${y}, ${yaw}]`,
		"negate: 0",
		`occupied_thresh: ${OCCUPIED_THRESH}`,
		`free_thresh: ${FREE_THRESH}`,
		"",
	].join("\n");
}

/** Size facts the gateway uses to tell a growing map from a restarted one. */
export function mapStats(g: MapGrid): { known: number; resolution: number } {
	let known = 0;
	for (let i = 0; i < g.data.length; i++) if (g.data[i] >= 0) known++;
	return { known, resolution: g.resolution };
}

/** Content hash: an unchanged map (repeated by SLAM or several robots) isn't re-sent. */
export function mapVersion(g: MapGrid): string {
	const h = createHash("sha1");
	h.update(
		`${g.width}x${g.height}@${g.resolution}:${g.origin.x},${g.origin.y},${g.origin.yaw};`,
	);
	h.update(Int8Array.from(g.data));
	return h.digest("hex").slice(0, 12);
}

/**
 * A map_server map on disk (map.yaml + its PNG), served as is: a site map to
 * show until — or instead of — a map the adapter reports. The yaml's image is
 * renamed to the served map.png; browsers can't draw PGM, so PNG only.
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
	return { yaml, png, version, resolution };
}
