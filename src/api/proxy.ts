import { http, withQuery } from "./client";
import type {
  ProxyCompanions,
  ProxyConfig,
  ProxyStateResponse,
  ProxyStatsResponse,
  PutProxyResponse,
} from "./types";

/** Full proxy config + per-egress health (socks5 passwords are redacted).
 *  A service rule arrives without `pattern`; it is filled in as "" so every
 *  rule has the same shape. */
export function get(): Promise<ProxyStateResponse> {
  return http.get<ProxyStateResponse>("/proxy").then((r) => ({
    ...r,
    proxy: { ...r.proxy, rules: r.proxy.rules.map((x) => ({ ...x, pattern: x.pattern ?? "" })) },
  }));
}

/** Replace the whole proxy config; hot-reloads rules/egresses and persists. */
export function put(body: ProxyConfig): Promise<PutProxyResponse> {
  return http.put("/proxy", body);
}

/** Live per-egress traffic counters, rule hit counts, and routed domains. */
export function stats(): Promise<ProxyStatsResponse> {
  return http.get("/proxy/stats");
}

/**
 * What else the site of a rule (its key: pattern or `service:<id>`) pulls in,
 * each name tried straight and through the rule's tunnel. Takes a few
 * seconds: the tries are real.
 */
export function companions(rule: string): Promise<ProxyCompanions> {
  return http.get(withQuery("/proxy/companions", { rule }), { timeoutMs: 60_000 });
}
