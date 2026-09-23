import { http } from "./client";
import type {
  Settings,
  PatchSettingsBody,
  PatchSettingsResponse,
  StorageLocations,
} from "./types";

/** Full current config (api_key is redacted as "***" if set) */
export function get(): Promise<Settings> {
  return http.get("/settings");
}

/**
 * Patch runtime-patchable settings; persists changes to config file.
 * Set api_key to null to disable API key auth.
 */
export function patch(body: PatchSettingsBody): Promise<PatchSettingsResponse> {
  return http.patch("/settings", body);
}

/** Where the database can live on this box: the on-disk default, any
 *  RAM-backed mounts ferrite can write to, and the location in use. */
export function locations(): Promise<StorageLocations> {
  return http.get("/storage/locations");
}
