import { Canvas } from "@react-three/fiber";
import {
	Bot,
	Crosshair,
	Eye,
	EyeOff,
	Maximize,
	Minus,
	Plus,
	RotateCcw,
	TriangleAlert,
} from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import type { FleetLive } from "#/features/live/use-fleet-live";
import { m } from "#/paraglide/messages.js";
import { type MapRobot, MapScene, type ViewApi } from "./MapScene";
import {
	DEFAULT_LAYERS,
	type HeatGrid,
	type LayerKey,
	type LayerVisibility,
} from "./overlays/overlay-data";
import { type RobotChoice, RobotsPanel } from "./RobotsPanel";
import { useTheme } from "./theme";
import type { MapState } from "./use-ros-map";

const iconBtn = "btn btn-square btn-sm shadow-sm";

/** Nothing recorded (yet): an empty heatmap. */
const NO_HEAT: HeatGrid = { cols: 1, rows: 1, data: new Float32Array(1) };

function fmt(n: number) {
	return n.toFixed(2);
}
function deg(rad: number) {
	return Math.round(((rad * 180) / Math.PI + 360) % 360);
}

interface Props {
	/** loaded by the dashboard, which also needs the map (coverage) */
	state: MapState;
	onRetry: () => void;
	/** selected robot */
	robotId: string;
	/** robots to pick from (those with a pose) */
	choices: { id: string; name: string }[];
	onSelect: (id: string) => void;
	live: FleetLive;
	/** recorded coverage of the selected robot */
	heat?: HeatGrid;
}

export function MapPanel({
	state,
	onRetry,
	robotId,
	choices,
	onSelect,
	live,
	heat,
}: Props) {
	const theme = useTheme();
	const apiRef = useRef<ViewApi | null>(null);
	const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
	const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
	const toggle = (k: LayerKey) => setLayers((l) => ({ ...l, [k]: !l[k] }));

	const ready = state.status === "ready" ? state.map : null;

	// Selected robot sorted last so it draws on top of the others.
	const robots = useMemo<MapRobot[]>(
		() =>
			live.robots
				.flatMap((r) =>
					r.pose
						? [
								{
									id: r.name,
									pose: r.pose,
									selected: r.name === robotId,
									stale: r.stale,
									plan: r.plan,
									place: r.place,
								},
							]
						: [],
				)
				.sort((a, b) => Number(a.selected) - Number(b.selected)),
		[live, robotId],
	);
	const selected = robots.find((r) => r.selected) ?? null;
	const panelRobots = useMemo<RobotChoice[]>(() => {
		const byName = new Map(live.robots.map((r) => [r.name, r]));
		return choices.map(({ id, name }) => {
			const r = byName.get(id);
			if (!r) return { id, name };
			const tone = r.stale
				? "stale"
				: r.mode === "error"
					? "error"
					: r.mode === "run"
						? "run"
						: "idle";
			return {
				id,
				name,
				tone,
				status: r.stale ? m.readout_stale() : r.label || r.mode,
			};
		});
	}, [choices, live]);

	return (
		<div className="relative h-full w-full overflow-hidden rounded-xl border border-border bg-canvas text-ink">
			{ready && (
				<Canvas
					flat
					frameloop="demand"
					dpr={[1, 2]}
					gl={{ antialias: true, alpha: true }}
					style={{ position: "absolute", inset: 0 }}
				>
					<MapScene
						map={ready}
						robots={robots}
						onSelect={onSelect}
						theme={theme}
						heat={heat ?? NO_HEAT}
						layers={layers}
						apiRef={apiRef}
						onCursor={setCursor}
					/>
				</Canvas>
			)}

			{ready && (
				<>
					<RobotsPanel
						robots={panelRobots}
						selected={robotId}
						onSelect={onSelect}
					/>
					<LayersPanel layers={layers} onToggle={toggle} />
					<Readout
						cursor={cursor}
						robot={selected}
						resolution={ready.meta.resolution}
					/>
					<div className="absolute right-4 bottom-4 z-10 flex flex-col gap-1.5">
						<button
							type="button"
							className={iconBtn}
							aria-label={m.action_zoom_in()}
							onClick={() => apiRef.current?.zoomBy(1.3)}
						>
							<Plus className="size-4" />
						</button>
						<button
							type="button"
							className={iconBtn}
							aria-label={m.action_zoom_out()}
							onClick={() => apiRef.current?.zoomBy(1 / 1.3)}
						>
							<Minus className="size-4" />
						</button>
						<button
							type="button"
							className={iconBtn}
							aria-label={m.action_reset_view()}
							onClick={() => apiRef.current?.reset()}
						>
							<Maximize className="size-4" />
						</button>
					</div>
				</>
			)}

			{state.status === "loading" && <LoadingOverlay />}
			{state.status === "error" && (
				<ErrorOverlay message={state.message} onRetry={onRetry} />
			)}
		</div>
	);
}

const TOGGLES: Array<{
	key: LayerKey;
	label: () => string;
	swatch: ReactNode;
}> = [
	{
		key: "robot",
		label: () => m.legend_robot(),
		swatch: (
			<span
				className="size-3 rounded-full"
				style={{ background: "var(--robot)" }}
				aria-hidden
			/>
		),
	},
	{
		key: "path",
		label: () => m.legend_path(),
		swatch: (
			<span
				className="h-0.5 w-3.5 rounded-full"
				style={{ background: "var(--data-2)" }}
				aria-hidden
			/>
		),
	},
	{
		key: "graph",
		label: () => m.legend_graph(),
		swatch: (
			<span
				className="size-2 rounded-full"
				style={{ background: "var(--muted)" }}
				aria-hidden
			/>
		),
	},
	{
		key: "zones",
		label: () => m.legend_zones(),
		swatch: (
			<span
				className="size-3 rounded-sm border"
				style={{
					borderColor: "var(--data-5)",
					background: "color-mix(in oklch, var(--data-5) 20%, transparent)",
				}}
				aria-hidden
			/>
		),
	},
	{
		key: "heatmap",
		label: () => m.legend_heatmap(),
		swatch: (
			<span
				className="h-3 w-3.5 rounded-sm"
				style={{
					background:
						"linear-gradient(90deg, #440154, #21918c, #5ec962, #fde725)",
				}}
				aria-hidden
			/>
		),
	},
];

/** Matches zoneColor in overlays/SiteLayers.tsx. */
const ZONE_KINDS: Array<[string, () => string]> = [
	["var(--data-6)", () => m.legend_zone_blocked()],
	["var(--data-4)", () => m.legend_zone_slow()],
	["var(--data-5)", () => m.legend_zone_other()],
];

function LayersPanel({
	layers,
	onToggle,
}: {
	layers: LayerVisibility;
	onToggle: (k: LayerKey) => void;
}) {
	return (
		<div className="absolute top-4 right-4 z-10 w-44 rounded-lg border border-border bg-surface p-2.5 shadow-sm">
			<h2 className="mb-1.5 px-1.5 font-medium text-faint text-xs uppercase tracking-wide">
				{m.legend_title()}
			</h2>
			<ul className="flex flex-col gap-0.5">
				{TOGGLES.map((t) => {
					const on = layers[t.key];
					return (
						<li key={t.key}>
							<button
								type="button"
								onClick={() => onToggle(t.key)}
								aria-pressed={on}
								className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-surface-raised"
							>
								<span className="grid w-3.5 place-items-center">
									{t.swatch}
								</span>
								<span className={on ? "text-ink" : "text-faint"}>
									{t.label()}
								</span>
								{on ? (
									<Eye className="ml-auto size-3.5 text-muted" aria-hidden />
								) : (
									<EyeOff className="ml-auto size-3.5 text-faint" aria-hidden />
								)}
							</button>
						</li>
					);
				})}
			</ul>
			{layers.zones && (
				<ul className="mt-2 flex flex-col gap-1 border-border/70 border-t px-1.5 pt-2 text-muted text-xs">
					{ZONE_KINDS.map(([color, label]) => (
						<li key={color} className="flex items-center gap-2">
							<span
								className="size-2.5 rounded-sm border"
								style={{
									borderColor: color,
									background: `color-mix(in oklch, ${color} 20%, transparent)`,
								}}
								aria-hidden
							/>
							{label()}
						</li>
					))}
				</ul>
			)}
			{layers.heatmap && (
				<div className="mt-2 border-border/70 border-t px-1.5 pt-2">
					<div className="mb-1 text-[10px] text-faint uppercase tracking-wide">
						{m.legend_heat_scale()}
					</div>
					<div
						className="h-2 rounded-sm"
						style={{
							background:
								"linear-gradient(90deg, #440154, #3b528b, #21918c, #5ec962, #fde725)",
						}}
						aria-hidden
					/>
					<div className="mt-0.5 flex justify-between text-[10px] text-muted">
						<span>{m.legend_heat_less()}</span>
						<span>{m.legend_heat_more()}</span>
					</div>
				</div>
			)}
			<div className="mt-2 border-border/70 border-t pt-2">
				<div className="mb-1 px-1.5 text-[10px] text-faint uppercase tracking-wide">
					{m.legend_basemap()}
				</div>
				<ul className="flex flex-col gap-1 px-1.5">
					<li className="flex items-center gap-2.5 text-muted text-xs">
						<Swatch varName="--map-free" /> {m.legend_free()}
					</li>
					<li className="flex items-center gap-2.5 text-muted text-xs">
						<Swatch varName="--map-wall" /> {m.legend_wall()}
					</li>
					<li className="flex items-center gap-2.5 text-muted text-xs">
						<Swatch varName="--map-unknown" hatched /> {m.legend_unknown()}
					</li>
				</ul>
			</div>
		</div>
	);
}

function Swatch({ varName, hatched }: { varName: string; hatched?: boolean }) {
	return (
		<span
			className="size-3.5 rounded-sm border border-border-strong"
			style={
				hatched
					? {
							backgroundImage:
								"repeating-linear-gradient(45deg, var(--faint) 0 2px, transparent 2px 4px)",
						}
					: { background: `var(${varName})` }
			}
			aria-hidden
		/>
	);
}

function Readout({
	cursor,
	robot,
	resolution,
}: {
	cursor: { x: number; y: number } | null;
	robot: MapRobot | null;
	resolution: number;
}) {
	return (
		<dl className="absolute bottom-4 left-4 z-10 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-border bg-surface p-3 text-sm shadow-sm">
			<Row icon={<Crosshair className="size-3.5" />} label={m.readout_cursor()}>
				{cursor ? (
					<span className="tnum text-ink">
						{fmt(cursor.x)}, {fmt(cursor.y)} m
					</span>
				) : (
					<span className="text-faint">{m.readout_offmap()}</span>
				)}
			</Row>
			<Row
				icon={<Bot className="size-3.5 text-robot" />}
				label={m.readout_robot()}
			>
				{robot ? (
					<span className={`tnum ${robot.stale ? "text-faint" : "text-ink"}`}>
						{robot.stale && <>{m.readout_stale()} · </>}
						{fmt(robot.pose.x)}, {fmt(robot.pose.y)} m · {deg(robot.pose.theta)}
						°
					</span>
				) : (
					<span className="text-faint">—</span>
				)}
			</Row>
			<Row
				icon={<span className="inline-block size-3.5" />}
				label={m.readout_resolution()}
			>
				<span className="tnum text-muted">
					{resolution} {m.unit_mpp()}
				</span>
			</Row>
		</dl>
	);
}

function Row({
	icon,
	label,
	children,
}: {
	icon: ReactNode;
	label: string;
	children: ReactNode;
}) {
	return (
		<>
			<dt className="flex items-center gap-2 text-muted">
				<span className="text-faint">{icon}</span>
				{label}
			</dt>
			<dd className="text-right">{children}</dd>
		</>
	);
}

function LoadingOverlay() {
	return (
		<div className="absolute inset-0 z-20 grid place-items-center bg-canvas">
			<div className="flex flex-col items-center gap-4">
				<div className="size-40 animate-pulse rounded-xl border border-border bg-surface" />
				<p className="text-muted text-sm">
					{m.map_loading()}
					<span className="animate-pulse">…</span>
				</p>
			</div>
		</div>
	);
}

function ErrorOverlay({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<div className="absolute inset-0 z-20 grid place-items-center bg-canvas p-6">
			<div className="flex max-w-sm flex-col items-center gap-4 rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
				<span className="grid size-11 place-items-center rounded-full bg-accent-quiet text-accent">
					<TriangleAlert className="size-5" />
				</span>
				<div className="space-y-1.5">
					<h2 className="font-medium text-ink">{m.map_error_title()}</h2>
					<p className="text-muted text-sm">{m.map_error_hint()}</p>
					<p className="tnum break-all text-faint text-xs">{message}</p>
				</div>
				<button
					type="button"
					onClick={onRetry}
					className="btn btn-primary btn-sm gap-2"
				>
					<RotateCcw className="size-4" />
					{m.action_retry()}
				</button>
			</div>
		</div>
	);
}
