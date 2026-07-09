import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { classifyPixel, mapWorldRect, type RosMapMeta } from "./ros-map";
import { resolveColor, type Theme } from "./theme";

function themedBytes(cssVar: string): [number, number, number, number] {
	const { rgb, alpha } = resolveColor(cssVar);
	return [
		Math.round(rgb[0] * 255),
		Math.round(rgb[1] * 255),
		Math.round(rgb[2] * 255),
		Math.round(alpha * 255),
	];
}

/** Recolor the grayscale occupancy grid into the current theme's map palette. */
function buildTexture(
	image: HTMLImageElement,
	meta: RosMapMeta,
): THREE.CanvasTexture {
	const w = image.naturalWidth;
	const h = image.naturalHeight;
	const cv = document.createElement("canvas");
	cv.width = w;
	cv.height = h;
	const ctx = cv.getContext("2d", { willReadFrequently: true });
	if (!ctx) throw new Error("2d context unavailable");
	ctx.drawImage(image, 0, 0);
	const data = ctx.getImageData(0, 0, w, h);
	const px = data.data;

	const free = themedBytes("var(--map-free)");
	const wall = themedBytes("var(--map-wall)");
	const unknown = themedBytes("var(--map-unknown)");

	for (let i = 0; i < px.length; i += 4) {
		// Transparent pixels are "unknown" (common in RGBA map exports); otherwise
		// classify by the grayscale value (r=g=b in a ROS map).
		const cls = px[i + 3] < 128 ? "unknown" : classifyPixel(px[i], meta);
		const c = cls === "free" ? free : cls === "occupied" ? wall : unknown;
		px[i] = c[0];
		px[i + 1] = c[1];
		px[i + 2] = c[2];
		px[i + 3] = c[3];
	}
	ctx.putImageData(data, 0, 0);

	const tex = new THREE.CanvasTexture(cv);
	tex.magFilter = THREE.NearestFilter; // crisp occupancy cells when zoomed in
	tex.minFilter = THREE.LinearMipmapLinearFilter; // smooth when zoomed out
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.needsUpdate = true;
	return tex;
}

interface Props {
	image: HTMLImageElement;
	meta: RosMapMeta;
	theme: Theme;
	onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
	onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
}

export function OccupancyLayer({
	image,
	meta,
	theme,
	onPointerMove,
	onPointerOut,
}: Props) {
	const rect = useMemo(
		() => mapWorldRect(meta, image.naturalWidth, image.naturalHeight),
		[meta, image],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: theme drives the recolor
	const texture = useMemo(
		() => buildTexture(image, meta),
		[image, meta, theme],
	);
	useEffect(() => () => texture.dispose(), [texture]);

	return (
		<mesh
			position={[rect.centerX, rect.centerY, 0]}
			name="occupancy"
			renderOrder={0}
			onPointerMove={onPointerMove}
			onPointerOut={onPointerOut}
		>
			<planeGeometry args={[rect.width, rect.height]} />
			<meshBasicMaterial
				map={texture}
				transparent
				depthTest={false}
				depthWrite={false}
				toneMapped={false}
			/>
		</mesh>
	);
}
