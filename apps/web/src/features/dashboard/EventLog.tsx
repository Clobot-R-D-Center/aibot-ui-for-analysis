import {
	Bell,
	CheckCircle2,
	CircleDot,
	CircleX,
	Clock,
	Hourglass,
	MapPinned,
	OctagonAlert,
	Pause,
	Play,
	Repeat,
	RotateCcw,
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
	task_ok: {
		icon: CheckCircle2,
		color: "var(--data-3)",
		label: () => m.event_task_ok(),
	},
	task_fail: {
		icon: CircleX,
		color: "var(--data-4)",
		label: () => m.event_task_fail(),
	},
	alarm: { icon: Bell, color: "var(--data-4)", label: () => m.event_alarm() },
	obstacle: {
		icon: OctagonAlert,
		color: "var(--data-2)",
		label: () => m.event_obstacle(),
	},
	recovery: {
		icon: RotateCcw,
		color: "var(--muted)",
		label: () => m.event_recovery(),
	},
	recovery_fail: {
		icon: RotateCcw,
		color: "var(--data-4)",
		label: () => m.event_recovery_fail(),
	},
	zone: { icon: MapPinned, color: "var(--muted)", label: () => m.event_zone() },
	pending: {
		icon: Clock,
		color: "var(--muted)",
		label: () => m.event_pending(),
	},
};

export function EventLog({ events }: { events: RobotEvent[] }) {
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
						className="flex items-center gap-3 border-border/60 border-b py-2.5 last:border-0"
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
					</li>
				);
			})}
		</ul>
	);
}
