import {
	BatteryCharging,
	CheckCircle2,
	CircleDot,
	Play,
	ShieldCheck,
	TriangleAlert,
} from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import { m } from "#/paraglide/messages.js";
import type { EventKind, RobotEvent } from "./demo-data";

type IconCmp = ComponentType<{ className?: string; style?: CSSProperties }>;

const META: Record<
	EventKind,
	{ icon: IconCmp; color: string; label: () => string }
> = {
	task_start: {
		icon: Play,
		color: "var(--accent)",
		label: () => m.event_task_start(),
	},
	task_done: {
		icon: CheckCircle2,
		color: "var(--data-3)",
		label: () => m.event_task_done(),
	},
	warning: {
		icon: TriangleAlert,
		color: "var(--data-4)",
		label: () => m.event_warning(),
	},
	avoid: {
		icon: ShieldCheck,
		color: "var(--data-2)",
		label: () => m.event_avoid(),
	},
	dock: {
		icon: BatteryCharging,
		color: "var(--muted)",
		label: () => m.event_dock(),
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
			{events.map((e) => {
				const meta = META[e.kind];
				const Icon = meta.icon;
				return (
					<li
						key={`${e.time}-${e.detail}`}
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
