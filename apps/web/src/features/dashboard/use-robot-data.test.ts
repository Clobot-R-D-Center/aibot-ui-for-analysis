// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRobotData, type RobotData } from "./demo-data";
import { useRobotData } from "./use-robot-data";

vi.mock("./demo-data", async (orig) => ({
	...(await orig<typeof import("./demo-data")>()),
	fetchRobotData: vi.fn(),
}));

const data = (n: number) =>
	({ kpis: [], distance: [], run: [], events: [], n }) as unknown as RobotData;
const flush = () => act(async () => {});

describe("useRobotData background refresh", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("keeps showing data through a failed refresh and picks up the next one", async () => {
		const fetch = vi.mocked(fetchRobotData);
		fetch
			.mockResolvedValueOnce(data(1))
			.mockRejectedValueOnce(new Error("gateway down"))
			.mockResolvedValueOnce(data(2));
		const { result } = renderHook(() => useRobotData("robot-a", 7, 1000));
		await flush();
		expect(result.current.state).toEqual({ status: "ready", data: data(1) });

		await act(() => vi.advanceTimersByTimeAsync(1000)); // refresh fails
		expect(result.current.state).toEqual({ status: "ready", data: data(1) });

		await act(() => vi.advanceTimersByTimeAsync(1000)); // refresh succeeds
		expect(result.current.state).toEqual({ status: "ready", data: data(2) });
		expect(fetch).toHaveBeenCalledTimes(3);
	});
});
