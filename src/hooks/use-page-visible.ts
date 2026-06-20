import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

const getSnapshot = () => document.visibilityState !== "hidden";

// Server has no document; assume visible so SSR markup matches the first paint.
const getServerSnapshot = () => true;

/** Tracks `document.visibilityState` so pollers can pause in hidden tabs. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
