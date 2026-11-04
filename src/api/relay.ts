import { http } from "./client";
import type { RelaySettings, RelayView } from "./types";

/** This box reached through a relay: settings, its ID there, the connection. */
export function get(): Promise<RelayView> {
  return http.get("/relay");
}

/** Saved and applied at once. */
export function put(body: RelaySettings): Promise<RelayView> {
  return http.put("/relay", body);
}
