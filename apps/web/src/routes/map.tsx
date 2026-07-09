import { createFileRoute } from "@tanstack/react-router";
import { MapViewport } from "#/features/map/MapViewport";
import type { RobotPose } from "#/features/map/ros-map";

// Demo pose in the left room of the bundled map (ROS map frame: meters, radians).
const DEMO_POSE: RobotPose = { x: -5, y: 2, theta: 0.6 };

export const Route = createFileRoute("/map")({ component: MapPage });

function MapPage() {
	// `?src=<dir>` overrides the map directory (defaults to the bundled demo).
	const src =
		new URLSearchParams(window.location.search).get("src") ?? "/demo-map";
	return <MapViewport src={src} pose={DEMO_POSE} />;
}
