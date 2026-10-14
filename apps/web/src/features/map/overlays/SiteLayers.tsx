import { Line } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { MapRobot } from "../MapScene";
import type { Site, SiteZone } from "../site";
import type { Theme } from "../theme";
import { threeColor } from "../three-color";

// The site's map meta drawn on the map: zones under the graph, both under paths.
// Every material is `transparent`: the occupancy map is, so three.js draws it
// after all opaque objects, and it would cover them.

const ZONE_Z = 0.015;
const GRAPH_Z = 0.02;
/** node dot radius, meters */
const NODE_R = 0.12;

/** Blocked and slow zones stand apart; any other kind shares one color. */
function zoneColor(kind: string) {
	if (kind === "blocked") return "var(--data-6)";
	if (kind === "slow") return "var(--data-4)";
	return "var(--data-5)";
}

function Zone({ zone, theme }: { zone: SiteZone; theme: Theme }) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: theme drives the recolor
	const color = useMemo(() => threeColor(zoneColor(zone.kind)), [zone, theme]);
	const outline = useMemo(() => {
		const pts = zone.points.map(
			([x, y]) => [x, y, ZONE_Z] as [number, number, number],
		);
		return zone.closed ? [...pts, pts[0]] : pts;
	}, [zone]);
	const fill = useMemo(
		() =>
			zone.closed
				? new THREE.ShapeGeometry(
						new THREE.Shape(
							zone.points.map(([x, y]) => new THREE.Vector2(x, y)),
						),
					)
				: null,
		[zone],
	);
	// R3F only disposes what it creates, not a geometry handed in as a prop.
	useEffect(() => () => fill?.dispose(), [fill]);
	return (
		<>
			{fill && (
				<mesh geometry={fill} position={[0, 0, ZONE_Z]} renderOrder={2}>
					<meshBasicMaterial
						color={color}
						transparent
						opacity={0.14}
						depthTest={false}
						depthWrite={false}
					/>
				</mesh>
			)}
			<Line
				points={outline}
				color={color}
				lineWidth={1.5}
				transparent
				dashed={!zone.closed}
				dashSize={0.3}
				gapSize={0.2}
				depthTest={false}
				depthWrite={false}
				renderOrder={2}
			/>
		</>
	);
}

export function ZonesLayer({ site, theme }: { site: Site; theme: Theme }) {
	return site.zones.map((z) => <Zone key={z.id} zone={z} theme={theme} />);
}

/**
 * Links as thin quiet lines, nodes as dots: the reference the robots move on.
 * The node or link a (current) robot is on is drawn in the robot color, and
 * after the rest: coincident links (A→B and B→A) must not cover it.
 */
export function GraphLayer({
	site,
	theme,
	robots,
}: {
	site: Site;
	theme: Theme;
	robots: MapRobot[];
}) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: theme drives the recolor
	const color = useMemo(() => threeColor("var(--muted)"), [theme]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: theme drives the recolor
	const robotColor = useMemo(() => threeColor("var(--robot)"), [theme]);
	const on = new Set(
		robots.flatMap((r) =>
			r.place && !r.stale
				? ["node" in r.place ? r.place.node : r.place.link]
				: [],
		),
	);
	const dot = useMemo(() => new THREE.CircleGeometry(NODE_R, 16), []);
	useEffect(() => () => dot.dispose(), [dot]);
	// ponytail: one Line and one mesh per item; merge into one geometry each if
	// sites with thousands of links/nodes get slow.
	return (
		<>
			{site.links.map((l) => (
				<Line
					key={l.id}
					points={l.points.map(
						([x, y]) => [x, y, GRAPH_Z] as [number, number, number],
					)}
					color={on.has(l.id) ? robotColor : color}
					lineWidth={on.has(l.id) ? 3 : 1}
					transparent
					opacity={on.has(l.id) ? 0.9 : 0.7}
					depthTest={false}
					depthWrite={false}
					renderOrder={on.has(l.id) ? 3.5 : 3}
				/>
			))}
			{site.nodes.map((n) => (
				<mesh
					key={n.id}
					geometry={dot}
					position={[n.x, n.y, GRAPH_Z]}
					scale={on.has(n.id) ? 1.8 : 1}
					renderOrder={on.has(n.id) ? 3.5 : 3}
				>
					<meshBasicMaterial
						color={on.has(n.id) ? robotColor : color}
						transparent
						depthTest={false}
						depthWrite={false}
					/>
				</mesh>
			))}
		</>
	);
}
