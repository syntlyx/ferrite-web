import { useCallback, useSyncExternalStore } from "react";

// `storage` events only fire in *other* tabs, so we keep an in-tab pub/sub to
// notify subscribers in the writing tab as well.
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/**
 * Reactive `localStorage` value backed by `useSyncExternalStore`.
 * Reads are a synchronous snapshot (no stale first paint); writes sync across
 * tabs via the native `storage` event and across the current tab via `emit()`.
 */
export function useLocalStorage(key: string, fallback: string): [string, (next: string) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) onChange();
      };
      window.addEventListener("storage", onStorage);
      listeners.add(onChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        listeners.delete(onChange);
      };
    },
    [key],
  );

  const value = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key) ?? fallback,
    () => fallback,
  );

  const setValue = useCallback(
    (next: string) => {
      localStorage.setItem(key, next);
      emit();
    },
    [key],
  );

  return [value, setValue];
}
