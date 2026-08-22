import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * `prefers-reduced-motion: reduce` が設定されている環境かどうか(NFR-41)。
 * SSR・`matchMedia` 未実装環境(一部のテスト環境など)では安全側に倒して false を返す。
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * マウス等の高精度ポインタ(PC相当)を使っている環境かどうか。
 * SSR・`matchMedia` 未実装環境(一部のテスト環境など)では安全側に倒して false を返す。
 */
export function prefersFinePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(pointer: fine)").matches;
}
