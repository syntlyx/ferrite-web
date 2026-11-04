import { http } from "./client";
import type { SetupInfo, SetupResult } from "./types";

/**
 * `/setup`: a device at home sets itself up for encrypted DNS, without the
 * panel's password. Both answer from home only.
 */
export function info(): Promise<SetupInfo> {
  return http.get("/setup");
}

/** Set this device up; `name` only counts for a device without one. */
export function claim(name?: string): Promise<SetupResult> {
  return http.post("/setup", { name: name ?? null });
}
