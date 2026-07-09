// ROS occupancy-map domain: parse map.yaml, map ROS frame <-> render frame.
// Pure (no THREE, no DOM) so it unit-tests in node. See ros-map.test.ts.

export interface RosMapMeta {
	/** filename of the occupancy image, relative to the yaml */
	image: string;
	/** meters per pixel */
	resolution: number;
	/** world pose of the lower-left pixel: [x, y, yaw] in meters/radians */
	origin: [number, number, number];
	/** 0: white=free, 1: white=occupied */
	negate: 0 | 1;
	occupiedThresh: number;
	freeThresh: number;
}

export interface RobotPose {
	/** meters, ROS map frame */
	x: number;
	y: number;
	/** radians, CCW from +x */
	theta: number;
}

/** Minimal parser for the flat key/value shape map_server emits. Throws on invalid input. */
export function parseMapYaml(text: string): RosMapMeta {
	const scalar = (key: string): string | undefined => {
		const m = text.match(
			new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*(?:#.*)?$`, "m"),
		);
		return m?.[1].trim().replace(/^["']|["']$/g, "");
	};

	const image = scalar("image");
	if (!image) throw new Error("map.yaml: missing 'image'");

	const resolution = Number(scalar("resolution"));
	if (!Number.isFinite(resolution) || resolution <= 0)
		throw new Error("map.yaml: 'resolution' must be a positive number");

	const originRaw = scalar("origin");
	const origin = originRaw
		? originRaw
				.replace(/[[\]]/g, "")
				.split(",")
				.map((s) => Number(s.trim()))
		: [0, 0, 0];
	if (origin.length < 2 || origin.some((n) => !Number.isFinite(n)))
		throw new Error("map.yaml: 'origin' must be [x, y, yaw]");

	return {
		image,
		resolution,
		origin: [origin[0], origin[1], origin[2] ?? 0],
		negate: scalar("negate") === "1" ? 1 : 0,
		occupiedThresh: Number(scalar("occupied_thresh") ?? 0.65),
		freeThresh: Number(scalar("free_thresh") ?? 0.196),
	};
}

export type Occupancy = "free" | "occupied" | "unknown";

/** map_server occupancy rule for a grayscale pixel value (0-255). */
export function classifyPixel(gray: number, meta: RosMapMeta): Occupancy {
	const shade = meta.negate ? gray : 255 - gray;
	const p = shade / 255;
	if (p > meta.occupiedThresh) return "occupied";
	if (p < meta.freeThresh) return "free";
	return "unknown";
}

/** World-frame extent and center of the map plane, given the image pixel size. */
export function mapWorldRect(
	meta: RosMapMeta,
	widthPx: number,
	heightPx: number,
) {
	const width = widthPx * meta.resolution;
	const height = heightPx * meta.resolution;
	return {
		width,
		height,
		centerX: meta.origin[0] + width / 2,
		centerY: meta.origin[1] + height / 2,
	};
}
