import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mapWorldRect, type RosMapMeta } from "../ros-map";
import { resolveColor, type Theme } from "../theme";
import type { HeatGrid } from "./overlay-data";

interface Props {
	heat: HeatGrid;
	meta: RosMapMeta;
	widthPx: number;
	heightPx: number;
	theme: Theme;
}

/** Coverage heatmap: single-hue sequential ramp encoded as alpha over the map. */
export function HeatmapLayer({ heat, meta, widthPx, heightPx, theme }: Props) {
	const rect = useMemo(
		() => mapWorldRect(meta, widthPx, heightPx),
		[meta, widthPx, heightPx],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: theme drives the recolor
	const texture = useMemo(() => {
		const { cols, rows, data } = heat;
		const base = resolveColor("var(--data-5)");
		const [r, g, b] = base.rgb.map((v) => Math.round(v * 255));
		const rgba = new Uint8Array(cols * rows * 4);
		for (let i = 0; i < cols * rows; i++) {
			rgba[i * 4] = r;
			rgba[i * 4 + 1] = g;
			rgba[i * 4 + 2] = b;
			rgba[i * 4 + 3] = Math.round(Math.min(1, data[i] * 1.15) * 185);
		}
		const tex = new THREE.DataTexture(rgba, cols, rows, THREE.RGBAFormat);
		tex.magFilter = THREE.LinearFilter;
		tex.minFilter = THREE.LinearFilter;
		tex.colorSpace = THREE.SRGBColorSpace;
		tex.needsUpdate = true;
		return tex;
	}, [heat, theme]);

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
