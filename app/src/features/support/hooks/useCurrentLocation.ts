"use client";

import { useCallback, useRef, useState } from "react";

import type { LatLngLike } from "@/features/support/services/distance";

export type CurrentLocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "granted"; coords: LatLngLike }
  | { status: "denied" }
  | { status: "unavailable" };

/** One-shot, non-persistent current-location request. Never starts tracking. */
export function useCurrentLocation(): { state: CurrentLocationState; request: () => void } {
  const [state, setState] = useState<CurrentLocationState>({ status: "idle" });
  const statusRef = useRef<CurrentLocationState["status"]>("idle");

  const request = useCallback(() => {
    if (statusRef.current === "loading" || statusRef.current === "granted") return;
    if (typeof window === "undefined" || !navigator.geolocation) {
      statusRef.current = "unavailable";
      setState({ status: "unavailable" });
      return;
    }
    statusRef.current = "loading";
    setState({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        statusRef.current = "granted";
        setState({ status: "granted", coords: { lat: position.coords.latitude, lng: position.coords.longitude } });
      },
      (error) => {
        const status = error.code === 1 ? "denied" : "unavailable";
        statusRef.current = status;
        setState({ status });
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  return { state, request };
}
