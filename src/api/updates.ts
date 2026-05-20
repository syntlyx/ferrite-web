import { http } from "./client";
import type { RawUpdateCheckResponse, UpdateCheckResponse, UpdateApplyResponse } from "./types";

/** Check configured releases for server and web UI updates */
export async function check(): Promise<UpdateCheckResponse> {
  const raw = await http.get<RawUpdateCheckResponse>("/update/check");
  return {
    server: {
      current: raw.current_server_version,
      latest: raw.server_update?.version ?? raw.current_server_version,
      update_available: raw.server_update != null,
    },
    web: {
      current: raw.current_web_version,
      latest: raw.web_update?.version ?? raw.current_web_version,
      update_available: raw.web_update != null,
    },
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
