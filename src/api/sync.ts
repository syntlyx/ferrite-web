import { http } from "./client";
import type { SyncPatch, SyncView } from "./types";

/** Whether this box follows a primary ferrite, and how the last syncs went. */
export function get(): Promise<SyncView> {
  return http.get("/sync");
}

/** Follow a primary (or stop, with an empty `primary`). */
export function put(body: SyncPatch): Promise<SyncView> {
  return http.put("/sync", body);
}

/** Sync at once; `restarting` when it changed something here. */
export function now(): Promise<SyncView & { restarting: boolean }> {
  return http.post("/sync/now", undefined, { timeoutMs: 30_000 });
}
