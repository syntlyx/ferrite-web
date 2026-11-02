import { http } from "./client";
import type { PauseState } from "./types";

/** What is paused right now — box-wide and per device (unix seconds). */
export function get(): Promise<PauseState> {
  return http.get("/blocking/pause");
}

/** Pause filtering for `minutes`: box-wide, or for the given device IPs/MACs. */
export function pause(minutes: number, clients: string[] = []): Promise<PauseState> {
  return http.post("/blocking/pause", { minutes, clients });
}

/** End a pause early: box-wide, or for the given devices. */
export function resume(clients: string[] = []): Promise<PauseState> {
  return http.post("/blocking/resume", { clients });
}
