import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { RobotPose } from "./ros-map";
import { resolveColor, type Theme } from "./theme";

const Z = 0.02; // sits just above the map plane (z=0)

function srgb(cssVar: string) {
	const { rgb } = resolveColor(cssVar);
	return new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

/**
 * Robot pose glyph: soft halo + disc + heading chevron, roughly to scale (~0.6 m).
 * `muted` (other robots in the fleet) drops the halo and fades the body, so the
 * selected robot stands out by shape as well as color. `stale` (offline, last
 * known pose) fades the whole glyph further; the readout spells it out in text.
 */
export function RobotMarker({
	pose,
	theme,
	muted = false,
	stale = false,
	onClick,
}: {
	pose: RobotPose;
	theme: Theme;
	muted?: boolean;
	stale?: boolean;
	onClick?: () => void;
}) {
	const fade = stale ? 0.3 : 1;
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
		// biome-ignore lint/a11y/noStaticElementInteractions: a three.js object, not DOM; the robots panel offers the same choice as buttons
		<group
			position={[pose.x, pose.y, Z]}
			rotation={[0, 0, pose.theta]}
			onClick={
				onClick &&
				((e) => {
					e.stopPropagation();
					onClick();
				})
			}
			onPointerOver={() => {
				if (onClick) document.body.style.cursor = "pointer";
			}}
			onPointerOut={() => {
				document.body.style.cursor = "";
			}}
		>
			{/* soft halo ring — draws attention without motion */}
			<mesh renderOrder={10} visible={!muted && !stale}>
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
					opacity={(muted ? 0.55 : 1) * fade}
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
					opacity={fade}
					depthTest={false}
					depthWrite={false}
					toneMapped={false}
				/>
			</mesh>
		</group>
	);
}
