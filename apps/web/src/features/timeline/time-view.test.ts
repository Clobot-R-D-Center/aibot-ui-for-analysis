import { describe, expect, it } from "vitest";
import {
	DAY,
	HOUR,
	MAX_SPAN,
	MIN,
	MIN_SPAN,
	pan,
	rangeOf,
	ticks,
	zoom,
} from "./time-view";

const now = new Date(2026, 9, 19, 12, 0).getTime();

describe("time window", () => {
	it("zooms about the pointer, leaving live only when the end moves back", () => {
		const w = { span: 4 * HOUR, end: now - 2 * HOUR };
		const at = now - 3 * HOUR; // 3/4 of the way across
		const z = zoom(w, 0.5, at, now);
		expect(z.span).toBe(2 * HOUR);
		const r = rangeOf(z, now);
		expect(r.from + 0.75 * z.span).toBe(at); // still 3/4 of the way

		const live = { span: DAY, end: null };
		expect(zoom(live, 2, now - HOUR, now)).toEqual({
			span: 2 * DAY,
			end: null,
		});
		const past = zoom(live, 0.5, now - 12 * HOUR, now); // in on the middle
		expect(past.end).toBe(now - 6 * HOUR);
		expect(zoom(live, 0.5, now, now).end).toBeNull(); // in on now: still live
		expect(zoom(live, 0.5, now - 0.02 * DAY, now).end).toBeNull(); // near now, too
	});

	it("keeps the span within limits", () => {
		expect(zoom({ span: DAY, end: null }, 1e6, now, now).span).toBe(MAX_SPAN);
		expect(zoom({ span: DAY, end: null }, 1e-6, now, now).span).toBe(MIN_SPAN);
	});

	it("pans into the past, turns live at now, and stops at the oldest data", () => {
		expect(pan({ span: DAY, end: null }, -HOUR, now)).toEqual({
			span: DAY,
			end: now - HOUR,
		});
		expect(pan({ span: DAY, end: now - HOUR }, 2 * HOUR, now).end).toBeNull();
		const far = pan({ span: DAY, end: null }, -100 * DAY, now);
		expect(rangeOf(far, now).from).toBe(now - MAX_SPAN);
	});

	it("puts ticks on round local times", () => {
		const t = ticks(now - 6 * HOUR + 7 * MIN, now, 8);
		expect(t.map((x) => new Date(x).getMinutes())).toEqual(
			t.map(() => 0), // hourly at most 8: on the hour
		);
		expect(t.length).toBeLessThanOrEqual(8);
		const days = ticks(now - 30 * DAY, now, 6);
		expect(days.every((x) => new Date(x).getHours() === 0)).toBe(true);
	});
});
