import {
	CheckCircle2,
	CircleDot,
	Hourglass,
	Pause,
	Play,
	Repeat,
	TriangleAlert,
	Wifi,
	WifiOff,
} from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import { m } from "#/paraglide/messages.js";
import type { EventKind, RobotEvent } from "./robot-data";

type IconCmp = ComponentType<{ className?: string; style?: CSSProperties }>;

const META: Record<
	EventKind,
	{ icon: IconCmp; color: string; label: () => string }
> = {
	online: { icon: Wifi, color: "var(--data-3)", label: () => m.event_online() },
	offline: {
		icon: WifiOff,
		color: "var(--muted)",
		label: () => m.event_offline(),
	},
	run_start: {
		icon: Play,
		color: "var(--accent)",
		label: () => m.event_run_start(),
	},
	run_end: {
		icon: CheckCircle2,
		color: "var(--data-3)",
		label: () => m.event_run_end(),
	},
	error: {
		icon: TriangleAlert,
		color: "var(--data-4)",
		label: () => m.event_error(),
	},
	pause: { icon: Pause, color: "var(--muted)", label: () => m.event_pause() },
	state: { icon: Repeat, color: "var(--muted)", label: () => m.event_state() },
	wait: {
		icon: Hourglass,
		color: "var(--data-2)",
		label: () => m.event_wait(),
	},
};

/** Recorded events, newest first; picking one shows the map at that moment. */
export function EventLog({
	events,
	at = null,
	onPick,
}: {
	events: RobotEvent[];
	/** the moment the map shows, to mark the event there */
	at?: number | null;
	onPick?: (t: number) => void;
}) {
	if (events.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-10 text-center text-muted">
				<CircleDot className="size-5 text-faint" aria-hidden />
				<p className="text-sm">{m.events_empty()}</p>
			</div>
		);
	}
	return (
		<ul className="flex flex-col">
			{events.map((e, i) => {
				const meta = META[e.kind];
				const Icon = meta.icon;
				return (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: same-minute events can repeat time+kind+detail; the list is replaced whole, never reordered
						key={`${i}-${e.time}-${e.kind}`}
						className="border-border/60 border-b last:border-0"
					>
						<button
							type="button"
							onClick={() => onPick?.(e.t)}
							aria-current={e.t === at ? "true" : undefined}
							className={`flex w-full items-center gap-3 rounded-md px-1 py-2.5 text-left transition-colors hover:bg-surface-raised ${e.t === at ? "bg-surface-raised" : ""}`}
						>
							<span
								className="grid size-7 shrink-0 place-items-center rounded-md"
								style={{
									background:
										"color-mix(in oklch, var(--surface-raised), transparent)",
								}}
							>
								<Icon className="size-4" style={{ color: meta.color }} />
							</span>
							<div className="min-w-0 flex-1">
								<div className="truncate text-ink text-sm">{e.detail}</div>
								<div className="text-muted text-xs">{meta.label()}</div>
							</div>
							<time className="tnum shrink-0 text-faint text-xs tabular-nums">
								{e.time}
							</time>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
