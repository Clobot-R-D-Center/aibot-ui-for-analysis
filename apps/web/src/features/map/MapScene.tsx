import { MapControls, OrthographicCamera } from "@react-three/drei";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { OccupancyLayer } from "./OccupancyLayer";
import { HeatmapLayer } from "./overlays/HeatmapLayer";
import type { LayerVisibility, Overlays } from "./overlays/overlay-data";
import { PathLayer } from "./overlays/PathLayer";
import { ZonesLayer } from "./overlays/ZonesLayer";
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

	// Auto-fit exactly once per map, after controls exist and layout settles.
	// The reset button re-fits on demand; nothing else re-frames the view.
	const fitted = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset the guard when the map changes
	useEffect(() => {
		fitted.current = false;
	}, [rect]);
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

interface Props {
	map: LoadedMap;
	pose: RobotPose;
	theme: Theme;
	overlays: Overlays;
	layers: LayerVisibility;
	apiRef: RefObject<ViewApi | null>;
	onCursor: (world: { x: number; y: number } | null) => void;
}

export function MapScene({
	map,
	pose,
	theme,
	overlays,
	layers,
	apiRef,
	onCursor,
}: Props) {
	// Stable across re-renders (e.g. cursor moves) so the view doesn't re-fit
	// and snap back while the user is panning; only changes on map/size change.
	const rect = useMemo(
		() => mapWorldRect(map.meta, map.widthPx, map.heightPx),
		[map.meta, map.widthPx, map.heightPx],
	);
	const invalidate = useThree((s) => s.invalidate);

	// Re-render on any visual change (demand frameloop): theme, pose, layers.
	// biome-ignore lint/correctness/useExhaustiveDependencies: these are the change triggers
	useEffect(() => invalidate(), [invalidate, theme, pose, layers, overlays]);

	// Stable array refs so r3f/drei apply them once, never re-applying (and
	// snapping the camera back) on later re-renders.
	const initialPos = useMemo<[number, number, number]>(
		() => [rect.centerX, rect.centerY, 10],
		[rect],
	);
	const initialTarget = useMemo<[number, number, number]>(
		() => [rect.centerX, rect.centerY, 0],
		[rect],
	);

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
					heat={overlays.heat}
					meta={map.meta}
					widthPx={map.widthPx}
					heightPx={map.heightPx}
					theme={theme}
				/>
			)}
			{layers.zones && <ZonesLayer zones={overlays.zones} theme={theme} />}
			{layers.path && <PathLayer path={overlays.path} theme={theme} />}
			{layers.robot && <RobotMarker pose={pose} theme={theme} />}
		</>
	);
}
