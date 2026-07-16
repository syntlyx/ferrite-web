import { http } from "./client";
import type { ProxyConfig, ProxyStateResponse, ProxyStatsResponse, PutProxyResponse } from "./types";

/** Full proxy config + per-egress health (socks5 passwords are redacted). */
export function get(): Promise<ProxyStateResponse> {
  return http.get("/proxy");
}

/** Replace the whole proxy config; hot-reloads rules/egresses and persists. */
export function put(body: ProxyConfig): Promise<PutProxyResponse> {
  return http.put("/proxy", body);
}

/** Live per-egress traffic counters, rule hit counts, and routed domains. */
export function stats(): Promise<ProxyStatsResponse> {
  return http.get("/proxy/stats");
}
