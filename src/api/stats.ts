import { http, withQuery } from "./client";
import type {
  StatsSummary,
  TimeseriesBucket,
  TopBlockedResponse,
  TopBlockedParams,
  TopClientsResponse,
  SystemStats,
} from "./types";

/** Live in-memory counters — safe to poll every 2–5 seconds */
export function summary(): Promise<StatsSummary> {
  return http.get("/stats/summary");
}

/**
 * 24h rolling timeseries — 144 × 10-min buckets.
 * Buckets include total, blocked, cached, and upstream counts.
 * Buckets with zero traffic are omitted; fill gaps client-side.
 */
export function timeseries(): Promise<TimeseriesBucket[]> {
  return http.get("/stats/timeseries");
}

/** Top blocked domains from the query log (default: last 24h, top 20) */
export function topBlocked(params: TopBlockedParams = {}): Promise<TopBlockedResponse> {
  return http.get(withQuery("/stats/top-blocked", params));
}

/** Top queried domains from the query log (default: last 24h, top 20) */
export function topDomains(params: TopBlockedParams = {}): Promise<TopBlockedResponse> {
  return http.get(withQuery("/stats/top-domains", params));
}

/** Top clients by query count (default: last 24h, top 20) */
export function topClients(params: TopBlockedParams = {}): Promise<TopClientsResponse> {
  return http.get(withQuery("/stats/top-clients", params));
}

/**
 * System resource usage snapshot — CPU, memory, swap, load avg, uptime.
 * Response takes ~200 ms (two CPU samples). Poll no more than every 2–5 s.
 */
export function systemStats(): Promise<SystemStats> {
  return http.get("/stats/system");
}
