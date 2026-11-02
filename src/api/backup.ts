import { http } from "./client";
import type { ConfigImportResponse } from "./types";

/** The whole configuration as `config.toml` text (includes secrets). */
export function exportConfig(): Promise<string> {
  return http.get("/config/export", { textResponse: true });
}

/** Restore a `config.toml`; the service restarts once it is written. */
export function importConfig(toml: string): Promise<ConfigImportResponse> {
  return http.post("/config/import", toml, { rawContentType: "application/toml" });
}
