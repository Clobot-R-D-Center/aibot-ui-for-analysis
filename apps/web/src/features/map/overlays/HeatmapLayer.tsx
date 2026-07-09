import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mapWorldRect, type RosMapMeta } from "../ros-map";
import type { HeatGrid } from "./overlay-data";

// Viridis control points (sRGB) — perceptually-uniform, colorblind-safe.
const VIRIDIS: Array<[number, number, number]> = [
	[68, 1, 84],
	[59, 82, 139],
	[33, 145, 140],
	[94, 201, 98],
	[253, 231, 37],
];

function viridis(t: number): [number, number, number] {
	const c = Math.min(1, Math.max(0, t)) * (VIRIDIS.length - 1);
	const i = Math.min(VIRIDIS.length - 2, Math.floor(c));
	const f = c - i;
	const a = VIRIDIS[i];
	const b = VIRIDIS[i + 1];
	return [
		a[0] + (b[0] - a[0]) * f,
		a[1] + (b[1] - a[1]) * f,
		a[2] + (b[2] - a[2]) * f,
	];
}

interface Props {
	heat: HeatGrid;
	meta: RosMapMeta;
	widthPx: number;
	heightPx: number;
}

/** Coverage heatmap: intensity encoded as a viridis ramp; alpha fades out where uncovered. */
export function HeatmapLayer({ heat, meta, widthPx, heightPx }: Props) {
	const rect = useMemo(
		() => mapWorldRect(meta, widthPx, heightPx),
		[meta, widthPx, heightPx],
	);

	const texture = useMemo(() => {
		const { cols, rows, data } = heat;
		const rgba = new Uint8Array(cols * rows * 4);
		for (let i = 0; i < cols * rows; i++) {
			const t = data[i];
			const [r, g, b] = viridis(t);
			rgba[i * 4] = r;
			rgba[i * 4 + 1] = g;
			rgba[i * 4 + 2] = b;
			// fade out low-coverage so the map shows through
			rgba[i * 4 + 3] = Math.round(Math.min(1, t * 1.25) ** 0.85 * 216);
		}
		const tex = new THREE.DataTexture(rgba, cols, rows, THREE.RGBAFormat);
		tex.magFilter = THREE.LinearFilter;
		tex.minFilter = THREE.LinearFilter;
		tex.colorSpace = THREE.SRGBColorSpace;
		tex.needsUpdate = true;
		return tex;
	}, [heat]);

	useEffect(() => () => texture.dispose(), [texture]);

	return (
		<mesh position={[rect.centerX, rect.centerY, 0.01]} renderOrder={1}>
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
