import * as THREE from "three";
import { resolveColor } from "./theme";

/** Resolve a CSS color/token to a THREE.Color in sRGB (for scene materials). */
export function threeColor(cssVar: string): THREE.Color {
	const { rgb } = resolveColor(cssVar);
	return new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}
