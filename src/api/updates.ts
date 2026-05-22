import { http } from "./client";
import type { RawUpdateCheckResponse, UpdateCheckResponse, UpdateApplyResponse } from "./types";

/** Check configured releases for server and web UI updates */
export async function check(force = false): Promise<UpdateCheckResponse> {
  const raw = await http.get<RawUpdateCheckResponse>(
    force ? "/update/check?force=true" : "/update/check",
  );
  return {
    server: {
      current: raw.current_server_version,
      latest: raw.server_update?.version ?? raw.current_server_version,
      update_available: raw.server_update != null,
    },
    web: {
      current: raw.current_web_version,
      latest: raw.web_update?.version ?? raw.incompatible_web_update?.version ?? raw.current_web_version,
      update_available: raw.web_update != null,
      blocked: raw.incompatible_web_update ?? null,
    },
    checked_at: raw.checked_at,
    stale: raw.stale,
    check_pending: raw.check_pending,
    last_error: raw.last_error,
  };
}

/**
 * Download and replace the running server binary.
 * Process must be restarted manually after this call.
 */
export function updateServer(): Promise<UpdateApplyResponse> {
  return http.post("/update/server");
}

/**
 * Download and extract the new web bundle to the ferrite web directory.
 */
export function updateWeb(): Promise<UpdateApplyResponse> {
  return http.post("/update/web");
}
