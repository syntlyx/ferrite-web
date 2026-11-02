import { useSyncExternalStore } from "react";
import { api } from "@/api";
import type { PauseState } from "@/api/types";

/**
 * Temporary pauses of filtering, shared by the shell (the box-wide pause and
 * its banner) and the Clients page (per-device pauses).
 *
 * The server owns the deadlines; this polls them while anything is mounted and
 * counts down between polls on the server's clock — the offset is taken from
 * the `now` each response carries, so a phone whose clock is a minute off
 * still shows the right time left.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

let state: PauseState | null = null;
/** Server clock minus browser clock, seconds. */
let skew = 0;
let version = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;

const POLL_MS = 15_000;

function emit() {
  version += 1;
  for (const l of listeners) l();
}

function nowServer(): number {
  return Date.now() / 1000 + skew;
}

function anyPaused(s: PauseState | null): boolean {
  return !!s && (s.global_until != null || s.clients.length > 0);
}

/** A one-second tick only while something is counting down. */
function syncTicker() {
  const want = anyPaused(state) && listeners.size > 0;
  if (want && !tickTimer) tickTimer = setInterval(onTick, 1000);
  if (!want && tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function onTick() {
  // A deadline just passed: ask the server rather than guess, so the banner
  // goes away exactly when filtering is back.
  const now = nowServer();
  const lapsed =
    (state?.global_until != null && state.global_until <= now) ||
    state?.clients.some((c) => c.until <= now);
  if (lapsed) void refresh();
  else emit();
}

function apply(next: PauseState) {
  state = next;
  skew = next.now - Date.now() / 1000;
  emit();
  syncTicker();
}

async function refresh(): Promise<void> {
  try {
    apply(await api.getPause());
  } catch {
    // Keep the last known state; the next poll tries again.
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refresh();
    pollTimer = setInterval(() => {
      if (document.visibilityState !== "hidden") void refresh();
    }, POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    syncTicker();
  };
}

export interface PauseView {
  /** Seconds left on the box-wide pause; null when not paused. */
  globalLeft: number | null;
  /** Seconds left per paused device key (normalised IP or MAC). */
  clientLeft: Map<string, number>;
  pauseGlobal: (minutes: number) => Promise<void>;
  resumeGlobal: () => Promise<void>;
  pauseClients: (keys: string[], minutes: number) => Promise<void>;
  resumeClients: (keys: string[]) => Promise<void>;
}

const actions = {
  pauseGlobal: async (minutes: number) => apply(await api.pauseBlocking(minutes)),
  resumeGlobal: async () => apply(await api.resumeBlocking()),
  pauseClients: async (keys: string[], minutes: number) =>
    apply(await api.pauseBlocking(minutes, keys)),
  resumeClients: async (keys: string[]) => apply(await api.resumeBlocking(keys)),
};

export function usePause(): PauseView {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  const now = nowServer();
  const left = (until: number) => Math.max(0, Math.ceil(until - now));
  return {
    globalLeft: state?.global_until != null ? left(state.global_until) : null,
    clientLeft: new Map((state?.clients ?? []).map((c) => [c.key, left(c.until)])),
    ...actions,
  };
}

/** `4:05`, or `1:02:05` past an hour. */
export function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** The pause lengths the panel offers, in minutes. */
export const PAUSE_OPTIONS = [5, 30, 60] as const;
