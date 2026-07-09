import { Html, Line } from "@react-three/drei";
import { useMemo } from "react";
import { m } from "#/paraglide/messages.js";
import type { Theme } from "../theme";
import { threeColor } from "../three-color";
import type { Zone } from "./overlay-data";

const zoneName = (k: Zone["nameKey"]) =>
	k === "zone_lobby"
		? m.zone_lobby()
		: k === "zone_corridor"
			? m.zone_corridor()
			: m.zone_charging();

/** Labeled analysis zones: translucent fill + border + a screen-space label. */
export function ZonesLayer({ zones, theme }: { zones: Zone[]; theme: Theme }) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: theme drives the recolor
	const colors = useMemo(
		() => zones.map((z) => threeColor(z.color)),
		[zones, theme],
	);

	return (
		<>
			{zones.map((z, i) => {
				const cx = z.x + z.w / 2;
				const cy = z.y + z.h / 2;
				const color = colors[i];
				const ring: [number, number, number][] = [
					[z.x, z.y, 0.016],
					[z.x + z.w, z.y, 0.016],
					[z.x + z.w, z.y + z.h, 0.016],
					[z.x, z.y + z.h, 0.016],
					[z.x, z.y, 0.016],
				];
				return (
					<group key={z.id}>
						<mesh position={[cx, cy, 0.015]} renderOrder={2}>
							<planeGeometry args={[z.w, z.h]} />
							<meshBasicMaterial
								color={color}
								transparent
								opacity={0.14}
								depthTest={false}
								depthWrite={false}
								toneMapped={false}
							/>
						</mesh>
						<Line
							points={ring}
							color={color}
							lineWidth={1.5}
							transparent
							depthTest={false}
							depthWrite={false}
							renderOrder={3}
						/>
						<Html
							position={[cx, cy, 0.02]}
							center
							zIndexRange={[5, 5]}
							pointerEvents="none"
						>
							<span className="whitespace-nowrap rounded-md border border-border bg-surface px-1.5 py-0.5 font-medium text-[10px] text-ink">
								{zoneName(z.nameKey)}
							</span>
						</Html>
					</group>
				);
			})}
		</>
	);
}
