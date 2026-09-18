import { http, withQuery } from "./client";
import type { QueryEntry, QueryFilters } from "./types";

/**
 * Paginated query log from SQLite.
 * `client_ip` and `device` each accept a single value or a comma-separated list
 * (OR logic, and OR-combined with each other). `device` matches a device across
 * every IP it used. Strips empty / undefined filter params before sending.
 */
export function list(filters: QueryFilters = {}): Promise<QueryEntry[]> {
  return http.get(withQuery("/queries", filters));
}

/**
 * Delete everything the query log holds: SQLite rows, rollups, the in-memory
 * ring buffer, top-N counters and totals, and the per-tunnel host lists.
 *
 * The server then rebuilds the database file. That normally finishes while the
 * request is still open (`done`), but on a large log it can outlast it and
 * carry on in the background (`running`). `failed` means the rows are gone and
 * the file is the same size — usually too little free disk space.
 */
export function purge(): Promise<{
  status: string;
  vacuum?: "done" | "failed" | "running";
}> {
  return http.del("/queries");
}
