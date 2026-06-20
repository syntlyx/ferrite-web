import { http, withQuery } from "./client";
import type { LogsResponse } from "./types";

/** Recent server log records from the in-memory ring (delta-poll via after_id). */
export function get(params: {
  after_id?: number;
  level?: string;
  limit?: number;
}): Promise<LogsResponse> {
  return http.get(withQuery("/logs", params));
}
