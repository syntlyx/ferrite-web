import { useSyncExternalStore } from "react";

import { api } from "@/api";
import type { Settings } from "@/api/types";

/**
 * The server config, fetched once and shared by every component that needs it.
 *
 * Four places used to fetch `/api/settings` independently — the shell, the
 * dashboard, the queries page and the clients page — which meant three
 * redundant round trips per navigation and, worse, three copies that nothing
 * kept in step: only the shell listened for `ferrite:settings-changed`, so a
 * switch toggled in another tab left the others rendering a stale answer until
 * they happened to remount.
 *
 * This is external state (it lives on the server, not in React), so it is read
 * through `useSyncExternalStore` rather than mirrored into component state by
 * an effect. One fetch, one snapshot, every consumer re-rendered together when
 * it changes.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

let snapshot: Settings | null = null;
let inFlight: Promise<void> | null = null;
/** Bumped on every settled refresh so subscribers re-read even when the
 *  response is deep-equal to what they already had. */
let version = 0;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

async function refresh(): Promise<void> {
  // Collapse concurrent callers (mount + focus + a settings-changed event can
  // land together) onto a single request.
  if (inFlight) return inFlight;
  inFlight = api
    .getSettings()
    .then((next: Settings) => {
      snapshot = next;
      emit();
    })
    .catch(() => {
      // Leave the last good snapshot in place: a page rendering slightly stale
      // config beats one that blanks its banners because a poll failed.
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Event handlers must not return the promise — listeners are fire-and-forget. */
function onExternalChange(): void {
  void refresh();
}

function subscribe(listener: Listener): () => void {
  const first = listeners.size === 0;
  listeners.add(listener);

  if (first) {
    window.addEventListener("focus", onExternalChange);
    window.addEventListener("ferrite:settings-changed", onExternalChange);
  }
  // Fetch on the first subscriber, and whenever a later one arrives with
  // nothing cached yet.
  if (snapshot === null) void refresh();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("focus", onExternalChange);
      window.removeEventListener("ferrite:settings-changed", onExternalChange);
    }
  };
}

/** Stable across renders while nothing has changed — `useSyncExternalStore`
 *  compares by identity and would loop forever on a fresh object. */
function getSnapshot(): number {
  return version;
}

function getServerSnapshot(): number {
  return 0;
}

/**
 * The current server config, or `null` until the first response arrives.
 * Treat `null` as "not known yet" and render the neutral case.
 */
export function useSettings(): Settings | null {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return snapshot;
}

/** Ask for a re-fetch; also what `ferrite:settings-changed` triggers. */
export function refreshSettings(): Promise<void> {
  return refresh();
}

/** Test seam: drop the cached config so the next subscriber refetches. */
export function resetSettingsStore(): void {
  snapshot = null;
  emit();
}
