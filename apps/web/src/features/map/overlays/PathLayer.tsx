import { Line } from "@react-three/drei";
import { useMemo } from "react";
import type { Theme } from "../theme";
import { threeColor } from "../three-color";
import type { XY } from "./overlay-data";

/** Robot trajectory as a thick line, just above the map plane; `muted` = other robots. */
export function PathLayer({
	path,
	theme,
	muted = false,
}: {
	path: XY[];
	theme: Theme;
	muted?: boolean;
}) {
	const points = useMemo(
		() => path.map(([x, y]) => [x, y, 0.03] as [number, number, number]),
		[path],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: theme drives the recolor
	const color = useMemo(() => threeColor("var(--data-2)"), [theme]);

	return (
		<Line
			points={points}
			color={color}
			lineWidth={muted ? 1.5 : 2.5}
			transparent
			opacity={muted ? 0.45 : 1}
			depthTest={false}
			depthWrite={false}
			renderOrder={4}
		/>
	);
}
