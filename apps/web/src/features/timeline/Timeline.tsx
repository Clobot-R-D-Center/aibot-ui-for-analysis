import { Radio, X } from "lucide-react";
import {
	type Dispatch,
	type SetStateAction,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { m } from "#/paraglide/messages.js";
import {
	DAY,
	HOUR,
	LIVE_DAY,
	pan,
	rangeOf,
	stamp,
	tickLabel,
	ticks,
	type Window,
	zoom,
} from "./time-view";
import type { TimelineData } from "./use-timeline";

// The sticky timeline: fleet distance and one state band per robot over the
// shown window. Wheel zooms, drag pans, Shift+drag selects the range the
// panels use, a click picks the moment the map shows. See DESIGN.md.

const LABEL_W = 76; // robot names
const AXIS_H = 18;
const BARS_H = 26;
const LANE_H = 10;
const LANE_GAP = 5;
const DRAG_PX = 3; // less is a click
const MIN_SELECT = 60_000; // ms; a shorter selection is a slip

/** Same tones as the robots panel; offline is a gap, not a color. */
const STATE: Record<string, { fill: string; label: () => string }> = {
	run: { fill: "var(--color-success)", label: () => m.state_run() },
	idle: {
		fill: "color-mix(in oklch, var(--color-base-content) 30%, transparent)",
		label: () => m.state_idle(),
	},
	pause: { fill: "var(--color-warning)", label: () => m.state_pause() },
	error: { fill: "var(--color-error)", label: () => m.state_error() },
	other: {
		fill: "color-mix(in oklch, var(--color-base-content) 15%, transparent)",
		label: () => m.state_other(),
	},
};

export function duration(ms: number): string {
	if (ms < 2 * HOUR)
		return m.duration_m({ n: String(Math.round(ms / 60_000)) });
	if (ms < 2 * DAY) return m.duration_h({ n: String(Math.round(ms / HOUR)) });
	return m.duration_d({ n: String(Math.round(ms / DAY)) });
}

/** Tracks an element's width. */
function useWidth() {
	const ref = useRef<HTMLDivElement>(null);
	const [w, setW] = useState(0);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return [ref, w] as const;
}

export interface Range {
	from: number;
	to: number;
}

interface Props {
	data: TimelineData | null;
	now: number;
	view: Window;
	setView: Dispatch<SetStateAction<Window>>;
	selection: Range | null;
	setSelection: (r: Range | null) => void;
	/** the moment the map shows; null = live */
	cursor: number | null;
	setCursor: (t: number | null) => void;
	selected: string;
	/** distance buckets for this width; the parent fetches that many */
	onWidth: (plotPx: number) => void;
}

export function Timeline({
	data,
	now,
	view,
	setView,
	selection,
	setSelection,
	cursor,
	setCursor,
	selected,
	onWidth,
}: Props) {
	const [box, width] = useWidth();
	const svg = useRef<SVGSVGElement>(null);
	const plotW = Math.max(1, width - LABEL_W);
	useEffect(() => onWidth(plotW), [plotW, onWidth]);

	const { from, to } = rangeOf(view, now);
	const xOf = (t: number) => LABEL_W + ((t - from) / (to - from)) * plotW;
	const tOf = (x: number) => from + ((x - LABEL_W) / plotW) * (to - from);
	const live = view.end === null && cursor === null;

	// Latest values for the native wheel listener below.
	const latest = useRef({ tOf, now });
	latest.current = { tOf, now };
	useEffect(() => {
		const el = svg.current;
		if (!el) return;
		// Native and non-passive: a React onWheel can't stop the page scrolling.
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const { tOf, now } = latest.current;
			const at = tOf(e.clientX - el.getBoundingClientRect().left);
			setView((v) => zoom(v, Math.exp(e.deltaY * 0.0015), at, now));
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [setView]);

	const drag = useRef<{
		x0: number;
		x: number;
		select: boolean;
		moved: boolean;
	} | null>(null);
	const localX = (e: React.PointerEvent) =>
		e.clientX - (svg.current?.getBoundingClientRect().left ?? 0);

	const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		const x = localX(e);
		drag.current = { x0: x, x, select: e.shiftKey, moved: false };
	};
	const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
		const d = drag.current;
		if (!d) return;
		const x = localX(e);
		if (!d.moved && Math.abs(x - d.x0) < DRAG_PX) return;
		d.moved = true;
		if (d.select) {
			const [a, b] = [tOf(d.x0), tOf(x)].sort((p, q) => p - q);
			const sel = { from: Math.max(a, from), to: Math.min(b, to, now) };
			// Clamped to the window, a drag over the names can leave nothing (or
			// to < from, which /history refuses): keep the selection as it was.
			if (sel.to - sel.from >= MIN_SELECT) setSelection(sel);
		} else {
			const dt = -((x - d.x) / plotW) * (to - from);
			setView((v) => pan(v, dt, now));
		}
		d.x = x;
	};
	const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
		const d = drag.current;
		drag.current = null;
		if (d && !d.moved && localX(e) >= LABEL_W)
			setCursor(Math.min(tOf(localX(e)), now));
	};
	const toLive = () => {
		setView(LIVE_DAY);
		setSelection(null);
		setCursor(null);
	};
	const onKeyDown = (e: React.KeyboardEvent) => {
		const step = (to - from) / 100;
		if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
			e.preventDefault();
			const t = (cursor ?? to) + (e.key === "ArrowLeft" ? -step : step);
			setCursor(t >= now ? null : Math.max(t, from));
		} else if (e.key === "Escape") {
			setSelection(null);
			setCursor(null);
		}
	};

	const lanes = data?.robots ?? [];
	const height = AXIS_H + BARS_H + 6 + lanes.length * (LANE_H + LANE_GAP);
	const step = (() => {
		const t = ticks(from, to, Math.max(2, Math.floor(plotW / 90)));
		return { t, size: t.length > 1 ? t[1] - t[0] : to - from };
	})();
	const max = Math.max(1e-6, ...(data?.distance ?? [0]));
	// The data may still be for the window before a pan: place it by its own range.
	const bucket = data ? (data.to - data.from) / data.distance.length : 0;
	const clip = useId();

	return (
		<section className="sticky top-0 z-20 rounded-xl border border-base-300 bg-base-100 px-3 pt-2 pb-2.5 shadow-sm">
			<div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
				<h2 className="font-medium text-base-content">{m.timeline_title()}</h2>
				<span className="tnum text-base-content/60">
					{view.end === null
						? m.timeline_last({ span: duration(view.span) })
						: `${stamp(from)} – ${stamp(to)}`}
				</span>
				{selection && (
					<span className="badge badge-sm gap-1 border-primary/40 bg-primary/10 text-base-content">
						<span className="tnum">
							{stamp(selection.from)} – {stamp(selection.to)}
						</span>
						<button
							type="button"
							onClick={() => setSelection(null)}
							aria-label={m.timeline_clear()}
							className="opacity-60 hover:opacity-100"
						>
							<X className="size-3" />
						</button>
					</span>
				)}
				{cursor !== null && (
					<span className="tnum font-medium text-base-content">
						{m.timeline_cursor({ time: stamp(cursor) })}
					</span>
				)}
				<span className="ml-auto flex items-center gap-3">
					<span className="hidden text-base-content/45 text-xs lg:inline">
						{m.timeline_hint()}
					</span>
					{live ? (
						<span className="flex items-center gap-1 text-success text-xs">
							<Radio className="size-3.5" aria-hidden />
							{m.timeline_live()}
						</span>
					) : (
						<button
							type="button"
							onClick={toLive}
							className="btn btn-primary btn-xs"
						>
							<Radio className="size-3.5" aria-hidden />
							{m.timeline_to_live()}
						</button>
					)}
				</span>
			</div>

			{/* A slider over time: ←/→ move the moment shown, Esc goes back to live. */}
			<div
				ref={box}
				role="slider"
				tabIndex={0}
				aria-label={m.timeline_title()}
				aria-valuemin={from}
				aria-valuemax={to}
				aria-valuenow={cursor ?? to}
				aria-valuetext={cursor === null ? m.timeline_live() : stamp(cursor)}
				onKeyDown={onKeyDown}
				className="rounded outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
			>
				<svg
					ref={svg}
					width={width}
					height={height}
					className="block cursor-grab touch-none select-none active:cursor-grabbing"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onDoubleClick={toLive}
					aria-hidden="true"
				>
					{/* axis */}
					{step.t.map((t) => (
						<g key={t}>
							<line
								x1={xOf(t)}
								x2={xOf(t)}
								y1={AXIS_H - 4}
								y2={height}
								stroke="var(--color-base-300)"
							/>
							<text
								x={xOf(t) + 3}
								y={AXIS_H - 7}
								className="tnum fill-base-content/50 text-[10px]"
							>
								{tickLabel(t, step.size)}
							</text>
						</g>
					))}

					{/* fleet distance */}
					<text
						x={0}
						y={AXIS_H + BARS_H - 4}
						className="fill-base-content/50 text-[10px]"
					>
						{m.timeline_fleet_distance()}
					</text>
					<clipPath id={clip}>
						<rect x={LABEL_W} y={0} width={plotW} height={height} />
					</clipPath>
					<g clipPath={`url(#${clip})`}>
						{data?.distance.map((d, i) => {
							if (d <= 0) return null;
							const x = xOf(data.from + i * bucket);
							const h = (d / max) * (BARS_H - 4);
							return (
								<rect
									// biome-ignore lint/suspicious/noArrayIndexKey: buckets are positional
									key={i}
									x={x + 0.5}
									y={AXIS_H + BARS_H - h}
									width={Math.max(1, xOf(data.from + (i + 1) * bucket) - x - 1)}
									height={h}
									fill="var(--data-2)"
								>
									<title>{`${stamp(data.from + i * bucket)} · ${d.toFixed(2)} km`}</title>
								</rect>
							);
						})}
					</g>

					{/* robots */}
					{lanes.map((lane, i) => {
						const y = AXIS_H + BARS_H + 6 + i * (LANE_H + LANE_GAP);
						const on = lane.robot === selected;
						return (
							<g key={lane.robot}>
								<text
									x={0}
									y={y + LANE_H - 1}
									className={`text-[11px] ${on ? "fill-base-content font-medium" : "fill-base-content/60"}`}
								>
									{lane.robot.length > 11
										? `${lane.robot.slice(0, 10)}…`
										: lane.robot}
								</text>
								<rect
									x={LABEL_W}
									y={y}
									width={plotW}
									height={LANE_H}
									fill="color-mix(in oklch, var(--color-base-content) 4%, transparent)"
								/>
								<g clipPath={`url(#${clip})`}>
									{lane.bands.map(([a, b, kind]) => {
										if (kind === "off") return null;
										const st = STATE[kind] ?? STATE.other;
										return (
											<rect
												key={a}
												x={xOf(a)}
												y={y}
												width={Math.max(0.5, xOf(b) - xOf(a))}
												height={LANE_H}
												fill={st.fill}
											>
												<title>{`${lane.robot} · ${st.label()} · ${stamp(a)} – ${stamp(b)}`}</title>
											</rect>
										);
									})}
								</g>
							</g>
						);
					})}

					{/* selection */}
					{selection && (
						<rect
							x={xOf(selection.from)}
							y={AXIS_H - 4}
							width={Math.max(1, xOf(selection.to) - xOf(selection.from))}
							height={height - AXIS_H + 4}
							fill="color-mix(in oklch, var(--color-primary) 14%, transparent)"
							stroke="var(--color-primary)"
							strokeOpacity={0.5}
						/>
					)}

					{/* cursor */}
					{cursor !== null && cursor >= from && cursor <= to && (
						<line
							x1={xOf(cursor)}
							x2={xOf(cursor)}
							y1={AXIS_H - 6}
							y2={height}
							stroke="var(--robot)"
							strokeWidth={2}
						/>
					)}
				</svg>
			</div>

			<ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 pl-[76px] text-[11px] text-base-content/60">
				{Object.entries(STATE).map(([k, s]) => (
					<li key={k} className="flex items-center gap-1.5">
						<span
							className="inline-block h-2 w-3 rounded-sm"
							style={{ background: s.fill }}
							aria-hidden
						/>
						{s.label()}
					</li>
				))}
				<li className="flex items-center gap-1.5">
					<span
						className="inline-block h-2 w-3 rounded-sm border border-base-content/20"
						aria-hidden
					/>
					{m.state_off()}
				</li>
			</ul>
		</section>
	);
}
