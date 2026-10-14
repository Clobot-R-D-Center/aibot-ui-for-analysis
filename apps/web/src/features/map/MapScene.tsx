import { MapControls, OrthographicCamera } from "@react-three/drei";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { OccupancyLayer } from "./OccupancyLayer";
import { HeatmapLayer } from "./overlays/HeatmapLayer";
import type { HeatGrid, LayerVisibility, XY } from "./overlays/overlay-data";
import { PathLayer } from "./overlays/PathLayer";
import { GraphLayer, ZonesLayer } from "./overlays/SiteLayers";
import { RobotMarker } from "./RobotMarker";
import { mapWorldRect, type RobotPose } from "./ros-map";
import type { Theme } from "./theme";
import type { LoadedMap } from "./use-ros-map";

export interface ViewApi {
	reset: () => void;
	zoomBy: (factor: number) => void;
}

type Rect = ReturnType<typeof mapWorldRect>;

/** Deterministic camera framing (no animation → the scene idles between interactions). */
function CameraRig({
	rect,
	apiRef,
}: {
	rect: Rect;
	apiRef: RefObject<ViewApi | null>;
}) {
	const camera = useThree((s) => s.camera);
	const gl = useThree((s) => s.gl);
	const controls = useThree((s) => s.controls) as {
		target: { set: (x: number, y: number, z: number) => void };
		update: () => void;
	} | null;
	const invalidate = useThree((s) => s.invalidate);

	// Note: deliberately NOT keyed on canvas `size`. Auto-fit runs once per map
	// (below); resizes and re-renders must never recenter a view the user panned.
	const fitView = useCallback(() => {
		const el = gl.domElement;
		const w = el.clientWidth || window.innerWidth;
		const h = el.clientHeight || window.innerHeight;
		camera.zoom = Math.min(w / rect.width, h / rect.height) * 0.95;
		camera.position.set(rect.centerX, rect.centerY, 10);
		camera.updateProjectionMatrix();
		if (controls) {
			controls.target.set(rect.centerX, rect.centerY, 0);
			controls.update();
		}
		invalidate();
	}, [gl, camera, controls, invalidate, rect]);

	// Auto-fit exactly once, after controls exist and layout settles. Not again
	// when the map is replaced: that would yank away a view the user panned.
	// The reset button re-fits on demand.
	const fitted = useRef(false);
	useEffect(() => {
		if (fitted.current || !controls) return;
		fitView();
		const id = requestAnimationFrame(() => {
			fitView();
			fitted.current = true;
		});
		return () => cancelAnimationFrame(id);
	}, [fitView, controls]);

	useEffect(() => {
		apiRef.current = {
			reset: fitView,
			zoomBy: (factor) => {
				camera.zoom = Math.min(400, Math.max(2, camera.zoom * factor));
				camera.updateProjectionMatrix();
				invalidate();
			},
		};
	}, [fitView, camera, invalidate, apiRef]);

	return null;
}

export interface MapRobot {
	id: string;
	pose: RobotPose;
	selected: boolean;
	/** last known pose, not current (see live/fleet.ts isStale) */
	stale: boolean;
	/** planned path; hidden while stale (an old plan would read as current) */
	plan: XY[];
}

interface Props {
	map: LoadedMap;
	robots: MapRobot[];
	theme: Theme;
	heat: HeatGrid;
	layers: LayerVisibility;
	apiRef: RefObject<ViewApi | null>;
	onCursor: (world: { x: number; y: number } | null) => void;
	/** clicking a robot marker selects it */
	onSelect?: (id: string) => void;
}

export function MapScene({
	map,
	robots,
	theme,
	heat,
	layers,
	apiRef,
	onCursor,
	onSelect,
}: Props) {
	// Stable across re-renders (e.g. cursor moves) so the view doesn't re-fit
	// and snap back while the user is panning; only changes on map/size change.
	const rect = useMemo(
		() => mapWorldRect(map.meta, map.widthPx, map.heightPx),
		[map.meta, map.widthPx, map.heightPx],
	);
	const invalidate = useThree((s) => s.invalidate);

	// Re-render on any visual change (demand frameloop): theme, poses, layers.
	// biome-ignore lint/correctness/useExhaustiveDependencies: these are the change triggers
	useEffect(() => invalidate(), [invalidate, theme, robots, layers, heat]);

	// Fixed at the first map, so r3f/drei apply them once and never snap the
	// camera back — not on re-renders, nor when a replaced map moves rect.
	const [initialPos] = useState<[number, number, number]>(() => [
		rect.centerX,
		rect.centerY,
		10,
	]);
	const [initialTarget] = useState<[number, number, number]>(() => [
		rect.centerX,
		rect.centerY,
		0,
	]);

	const handleMove = (e: ThreeEvent<PointerEvent>) => {
		e.stopPropagation();
		onCursor({ x: e.point.x, y: e.point.y }); // world frame === ROS map frame
	};

	return (
		<>
			<OrthographicCamera
				makeDefault
				position={initialPos}
				near={0.01}
				far={100}
			/>
			<MapControls
				makeDefault
				enableRotate={false}
				enableDamping={false}
				screenSpacePanning
				zoomToCursor
				target={initialTarget}
			/>
			<CameraRig rect={rect} apiRef={apiRef} />
			<OccupancyLayer
				image={map.image}
				meta={map.meta}
				theme={theme}
				onPointerMove={handleMove}
				onPointerOut={() => onCursor(null)}
			/>
			{layers.heatmap && (
				<HeatmapLayer
					heat={heat}
					meta={map.meta}
					widthPx={map.widthPx}
					heightPx={map.heightPx}
				/>
			)}
			{layers.zones && <ZonesLayer site={map.site} theme={theme} />}
			{layers.graph && <GraphLayer site={map.site} theme={theme} />}
			{layers.path &&
				robots.map(
					(r) =>
						!r.stale &&
						r.plan.length > 1 && (
							<PathLayer
								key={r.id}
								path={r.plan}
								theme={theme}
								muted={!r.selected}
							/>
						),
				)}
			{layers.robot &&
				robots.map((r) => (
					<RobotMarker
						key={r.id}
						onClick={onSelect && (() => onSelect(r.id))}
						pose={r.pose}
						theme={theme}
						muted={!r.selected}
						stale={r.stale}
					/>
				))}
		</>
	);
}
