import { useEffect, useRef, useState } from "react";
import type { Point } from "./demo-data";

interface Props {
	points: Point[];
	/** css color for the single series (from the validated --data-* ramp) */
	color: string;
	unit: string;
	height?: number;
}

const PAD = { t: 12, r: 12, b: 20, l: 34 };

/** Single-series area+line. Recessive grid, 2px non-scaling stroke, hover crosshair. */
export function TrendChart({ points, color, unit, height = 168 }: Props) {
	const ref = useRef<HTMLDivElement>(null);
	const [w, setW] = useState(0);
	const [hover, setHover] = useState<number | null>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const values = points.map((p) => p.value);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min || 1;
	const innerW = Math.max(0, w - PAD.l - PAD.r);
	const innerH = height - PAD.t - PAD.b;

	const x = (i: number) =>
		PAD.l + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW);
	const y = (v: number) => PAD.t + (1 - (v - min) / span) * innerH;

	const line = points
		.map(
			(p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`,
		)
		.join(" ");
	const area = w
		? `${line} L${x(points.length - 1).toFixed(1)},${(PAD.t + innerH).toFixed(1)} L${PAD.l},${(PAD.t + innerH).toFixed(1)} Z`
		: "";

	const gridVals = [max, min + span / 2, min];
	const hp = hover != null ? points[hover] : null;

	const onMove = (e: React.PointerEvent) => {
		if (!w) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const rel = e.clientX - rect.left - PAD.l;
		const i = Math.round((rel / innerW) * (points.length - 1));
		setHover(Math.min(points.length - 1, Math.max(0, i)));
	};

	return (
		<div ref={ref} className="relative w-full" style={{ height }}>
			{w > 0 && (
				<svg
					width={w}
					height={height}
					role="img"
					aria-label={`trend, ${unit}`}
					className="block"
				>
					<title>{`trend (${unit})`}</title>
					{/* recessive gridlines + y labels */}
					{gridVals.map((gv) => (
						<g key={gv}>
							<line
								x1={PAD.l}
								x2={w - PAD.r}
								y1={y(gv)}
								y2={y(gv)}
								stroke="var(--border)"
								strokeWidth={1}
							/>
							<text
								x={PAD.l - 6}
								y={y(gv) + 3}
								textAnchor="end"
								className="tnum"
								fontSize={10}
								fill="var(--faint)"
							>
								{Math.round(gv)}
							</text>
						</g>
					))}
					{/* x labels: first + last */}
					{[0, points.length - 1].map((i) => (
						<text
							key={i}
							x={x(i)}
							y={height - 6}
							textAnchor={i === 0 ? "start" : "end"}
							fontSize={10}
							fill="var(--faint)"
						>
							{points[i]?.label}
						</text>
					))}
					<path d={area} fill={color} fillOpacity={0.14} />
					<path
						d={line}
						fill="none"
						stroke={color}
						strokeWidth={2}
						strokeLinejoin="round"
						strokeLinecap="round"
						vectorEffect="non-scaling-stroke"
					/>
					{hp && (
						<>
							<line
								x1={x(hover ?? 0)}
								x2={x(hover ?? 0)}
								y1={PAD.t}
								y2={PAD.t + innerH}
								stroke="var(--border-strong)"
								strokeWidth={1}
							/>
							<circle
								cx={x(hover ?? 0)}
								cy={y(hp.value)}
								r={4}
								fill={color}
								stroke="var(--surface)"
								strokeWidth={2}
							/>
						</>
					)}
					{/* hit layer */}
					<rect
						x={PAD.l}
						y={0}
						width={Math.max(0, innerW)}
						height={height}
						fill="transparent"
						onPointerMove={onMove}
						onPointerLeave={() => setHover(null)}
					/>
				</svg>
			)}
			{hp && (
				<div
					className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface-raised px-2 py-1 text-xs shadow-sm"
					style={{ left: x(hover ?? 0), top: y(hp.value) - 8 }}
				>
					<span className="text-muted">{hp.label} · </span>
					<span className="tnum font-medium text-ink tabular-nums">
						{hp.value} {unit}
					</span>
				</div>
			)}
		</div>
	);
}
