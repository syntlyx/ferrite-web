import { http, withQuery } from "./client";
import type { QueryEntry, QueryFilters } from "./types";

/**
 * Paginated query log from SQLite.
 * `client_ip` accepts a single IP or a comma-separated list (OR logic).
 * Strips empty / undefined filter params before sending.
 */
export function list(filters: QueryFilters = {}): Promise<QueryEntry[]> {
  return http.get(withQuery("/queries", filters));
}

/** Delete all entries from the query log (timeseries and counters are unaffected) */
export function purge(): Promise<{ status: string }> {
  return http.del("/queries");
}
