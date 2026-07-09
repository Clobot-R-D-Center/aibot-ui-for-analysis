// Generates a synthetic ROS occupancy map (public/demo-map/map.{png,yaml}).
// Dependency-free 8-bit grayscale PNG encoder (Node zlib). Run: node scripts/gen-demo-map.mjs
// The output mimics a real map_server export so dropping in a real map.png/map.yaml "just works".
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "public", "demo-map");

// ROS occupancy pixel conventions (negate=0): 254=free, 0=occupied, 205=unknown.
const FREE = 254;
const OCC = 0;
const UNKNOWN = 205;

const W = 400;
const H = 320;
const RESOLUTION = 0.05; // m/px
const ORIGIN = [-10.0, -8.0, 0.0]; // world pose of lower-left pixel [x, y, yaw]

const px = new Uint8Array(W * H).fill(UNKNOWN);
const set = (x, y, v) => {
	if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = v;
};
const fillRect = (x0, y0, x1, y1, v) => {
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, v);
};
// Wall = filled border rectangle of given thickness.
const wallRect = (x0, y0, x1, y1, t, v = OCC) => {
	fillRect(x0, y0, x1, y0 + t - 1, v); // top
	fillRect(x0, y1 - t + 1, x1, y1, v); // bottom
	fillRect(x0, y0, x0 + t - 1, y1, v); // left
	fillRect(x1 - t + 1, y0, x1, y1, v); // right
};

// Building: free interior inside outer walls, sitting in unknown space.
fillRect(24, 24, 375, 295, FREE);
wallRect(20, 20, 379, 299, 4);

// Vertical partition with a doorway (rooms left / right).
fillRect(178, 24, 181, 200, OCC);
fillRect(178, 100, 181, 130, FREE); // doorway

// Horizontal partition in the right half with a doorway (corridor / room).
fillRect(184, 178, 375, 181, OCC);
fillRect(280, 178, 310, 181, FREE); // doorway

// A couple of obstacles (furniture / pillars).
fillRect(60, 220, 110, 258, OCC);
fillRect(300, 60, 338, 92, OCC);

// ---- PNG encode (8-bit grayscale) ----
const CRC = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
const crc32 = (buf) => {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 0; // color type: grayscale
// scanlines, each prefixed with filter byte 0
const raw = Buffer.alloc((W + 1) * H);
for (let y = 0; y < H; y++) {
	raw[y * (W + 1)] = 0;
	Buffer.from(px.subarray(y * W, y * W + W)).copy(raw, y * (W + 1) + 1);
}
const png = Buffer.concat([
	Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
	chunk("IHDR", ihdr),
	chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
	chunk("IEND", Buffer.alloc(0)),
]);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "map.png"), png);
fs.writeFileSync(
	path.join(OUT, "map.yaml"),
	`image: map.png
resolution: ${RESOLUTION}
origin: [${ORIGIN[0]}, ${ORIGIN[1]}, ${ORIGIN[2]}]
negate: 0
occupied_thresh: 0.65
free_thresh: 0.196
`,
);
console.log(`wrote ${OUT}/map.png (${W}x${H}) and map.yaml`);
