// The time window the dashboard shows: pure math for zooming, panning and the
// axis, so the Timeline component only maps pixels to it. See time-view.test.ts.

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
/** what the gateway keeps (HISTORY_DAYS) */
export const MAX_SPAN = 62 * DAY;
export const MIN_SPAN = 10 * MIN;

/** `span` ms ending at `end`; end null = live, ending now and moving with it. */
export interface Window {
	span: number;
	end: number | null;
}

export const LIVE_DAY: Window = { span: DAY, end: null };

export function rangeOf(w: Window, now: number) {
	const to = w.end ?? now;
	return { from: to - w.span, to };
}

/** An end at or past now is live; nothing reaches back beyond MAX_SPAN. */
function settle(span: number, end: number, now: number): Window {
	const s = Math.min(MAX_SPAN, Math.max(MIN_SPAN, span));
	if (end >= now) return { span: s, end: null };
	return { span: s, end: Math.max(end, now - MAX_SPAN + s) };
}

/**
 * Zoom by `factor` (> 1 = out) keeping time `at` where it is, as maps do:
 * zooming in on the past leaves live, zooming out to now returns to it.
 */
export function zoom(
	w: Window,
	factor: number,
	at: number,
	now: number,
): Window {
	const { from, to } = rangeOf(w, now);
	const span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, w.span * factor));
	const f = (at - from) / (to - from);
	return settle(span, at + (1 - f) * span, now);
}

/** Move the window by `dt` ms (negative = into the past). */
export function pan(w: Window, dt: number, now: number): Window {
	return settle(w.span, (w.end ?? now) + dt, now);
}

const STEPS = [
	MIN,
	5 * MIN,
	10 * MIN,
	15 * MIN,
	30 * MIN,
	HOUR,
	3 * HOUR,
	6 * HOUR,
	12 * HOUR,
	DAY,
	2 * DAY,
	7 * DAY,
];

/** Axis ticks on round local times, at most `max` of them. */
export function ticks(from: number, to: number, max: number): number[] {
	const step =
		STEPS.find((s) => (to - from) / s <= max) ?? STEPS[STEPS.length - 1];
	// local time: Korea has no DST, so one offset fits the whole range
	const tz = new Date(from).getTimezoneOffset() * MIN;
	const out: number[] = [];
	for (let t = Math.ceil((from - tz) / step) * step + tz; t <= to; t += step)
		out.push(t);
	return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "14:30", or "10/18" on a midnight or when the ticks are days apart. */
export function tickLabel(t: number, step: number): string {
	const d = new Date(t);
	return step >= DAY || (d.getHours() === 0 && d.getMinutes() === 0)
		? `${d.getMonth() + 1}/${d.getDate()}`
		: `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "10/18 14:30" */
export const stamp = (t: number) => {
	const d = new Date(t);
	return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
