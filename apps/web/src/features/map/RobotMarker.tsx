import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { RobotPose } from "./ros-map";
import { resolveColor, type Theme } from "./theme";

const Z = 0.02; // sits just above the map plane (z=0)

function srgb(cssVar: string) {
	const { rgb } = resolveColor(cssVar);
	return new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

/** Robot pose glyph: soft halo + disc + heading chevron, roughly to scale (~0.6 m). */
export function RobotMarker({
	pose,
	theme,
}: {
	pose: RobotPose;
	theme: Theme;
}) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: theme drives the recolor
	const { body, ink, chevron } = useMemo(() => {
		const shape = new THREE.Shape();
		shape.moveTo(0.4, 0);
		shape.lineTo(-0.22, 0.24);
		shape.lineTo(-0.08, 0);
		shape.lineTo(-0.22, -0.24);
		shape.closePath();
		return {
			body: srgb("var(--robot)"),
			ink: srgb("var(--robot-ink)"),
			chevron: new THREE.ShapeGeometry(shape),
		};
	}, [theme]);

	useEffect(() => () => chevron.dispose(), [chevron]);

	return (
		<group position={[pose.x, pose.y, Z]} rotation={[0, 0, pose.theta]}>
			{/* soft halo ring — draws attention without motion */}
			<mesh renderOrder={10}>
				<ringGeometry args={[0.36, 0.5, 48]} />
				<meshBasicMaterial
					color={body}
					transparent
					opacity={0.28}
					depthTest={false}
					depthWrite={false}
					toneMapped={false}
				/>
			</mesh>
			{/* body disc */}
			<mesh renderOrder={11}>
				<circleGeometry args={[0.3, 48]} />
				<meshBasicMaterial
					color={body}
					transparent
					depthTest={false}
					depthWrite={false}
					toneMapped={false}
				/>
			</mesh>
			{/* heading chevron */}
			<mesh geometry={chevron} renderOrder={12} position={[0, 0, 0.001]}>
				<meshBasicMaterial
					color={ink}
					transparent
					depthTest={false}
					depthWrite={false}
					toneMapped={false}
				/>
			</mesh>
		</group>
	);
}
