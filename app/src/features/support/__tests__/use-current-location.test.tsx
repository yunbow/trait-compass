import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCurrentLocation } from "@/features/support/hooks/useCurrentLocation";

type Success = PositionCallback;
type Failure = PositionErrorCallback;

afterEach(() => vi.restoreAllMocks());

function mockGeolocation() {
  let success: Success | undefined;
  let failure: Failure | undefined;
  const getCurrentPosition = vi.fn((nextSuccess: Success, nextFailure: Failure) => { success = nextSuccess; failure = nextFailure; });
  const watchPosition = vi.fn();
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition, watchPosition } });
  return { getCurrentPosition, watchPosition, resolve: (lat = 35.6938, lng = 139.7036) => success?.({ coords: { latitude: lat, longitude: lng } } as GeolocationPosition), reject: (code: number) => failure?.({ code } as GeolocationPositionError) };
}

describe("useCurrentLocation", () => {
  it("idleからloadingを経てgrantedになり、watchPositionは使わない", () => {
    const geo = mockGeolocation();
    const { result } = renderHook(() => useCurrentLocation());
    act(() => result.current.request());
    expect(result.current.state.status).toBe("loading");
    expect(geo.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { timeout: 10_000, maximumAge: 60_000 });
    act(() => geo.resolve());
    expect(result.current.state).toEqual({ status: "granted", coords: { lat: 35.6938, lng: 139.7036 } });
    expect(geo.watchPosition).not.toHaveBeenCalled();
  });

  it.each([[1, "denied"], [2, "unavailable"]] as const)("エラーコード%sは%sになる", (code, status) => {
    const geo = mockGeolocation();
    const { result } = renderHook(() => useCurrentLocation());
    act(() => result.current.request());
    act(() => geo.reject(code));
    expect(result.current.state.status).toBe(status);
  });

  it("利用不可時はunavailableになり、loading/granted中の再要求は無視する", () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    const unavailable = renderHook(() => useCurrentLocation());
    act(() => unavailable.result.current.request());
    expect(unavailable.result.current.state.status).toBe("unavailable");

    const geo = mockGeolocation();
    const { result } = renderHook(() => useCurrentLocation());
    act(() => { result.current.request(); result.current.request(); });
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    act(() => geo.resolve());
    act(() => result.current.request());
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});
