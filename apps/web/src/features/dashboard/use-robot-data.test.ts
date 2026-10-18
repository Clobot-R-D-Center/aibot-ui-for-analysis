// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAY, LIVE_DAY } from "#/features/timeline/time-view";
import { fetchRobotData, type RobotData } from "./robot-data";
import { useRobotData } from "./use-robot-data";

vi.mock("./robot-data", async (orig) => ({
	...(await orig<typeof import("./robot-data")>()),
	fetchRobotData: vi.fn(),
}));

const data = (n: number) =>
	({ kpis: [], events: [], n }) as unknown as RobotData;

describe("useRobotData background refresh", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("keeps showing data through a failed refresh and picks up the next one", async () => {
		const fetch = vi.mocked(fetchRobotData);
		fetch
			.mockResolvedValueOnce(data(1))
			.mockRejectedValueOnce(new Error("gateway down"))
			.mockResolvedValueOnce(data(2));
		const { result } = renderHook(() =>
			useRobotData("robot-a", LIVE_DAY, { refreshMs: 1000 }),
		);
		await act(() => vi.advanceTimersByTimeAsync(250)); // the first load waits out the debounce
		expect(result.current.state).toEqual({ status: "ready", data: data(1) });

		await act(() => vi.advanceTimersByTimeAsync(1000)); // refresh fails
		expect(result.current.state).toEqual({ status: "ready", data: data(1) });

		await act(() => vi.advanceTimersByTimeAsync(1000)); // refresh succeeds
		expect(result.current.state).toEqual({ status: "ready", data: data(2) });
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("asks once per settled window, showing the last data meanwhile", async () => {
		const fetch = vi.mocked(fetchRobotData);
		fetch.mockReset().mockResolvedValue(data(1));
		const { result, rerender } = renderHook(
			({ end }) =>
				useRobotData("robot-a", { span: DAY, end }, { refreshMs: 0 }),
			{ initialProps: { end: 1_000_000 } },
		);
		await act(() => vi.advanceTimersByTimeAsync(250));
		expect(fetch).toHaveBeenCalledTimes(1);

		// a drag: the window moves on every event
		for (let i = 1; i <= 10; i++) {
			rerender({ end: 1_000_000 - i * 60_000 });
			await act(() => vi.advanceTimersByTimeAsync(16));
			expect(result.current.state.status).toBe("ready"); // no skeleton flash
		}
		await act(() => vi.advanceTimersByTimeAsync(250));
		expect(fetch).toHaveBeenCalledTimes(2); // once for the whole drag
	});
});
