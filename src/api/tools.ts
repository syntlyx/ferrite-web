import { http } from "./client";
import type { ResolveResult, WhoisResult } from "./types";

/** DNS lookup (dig/nslookup) for `name` of `type`, resolved through ferrite's
 *  own upstreams (a fresh query, not the cache). */
export function resolve(name: string, type: string): Promise<ResolveResult> {
  return http.get(
    `/tools/resolve?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
  );
}

/** WHOIS lookup for a domain / IP (IANA referral → registry). */
export function whois(query: string): Promise<WhoisResult> {
  return http.get(`/tools/whois?query=${encodeURIComponent(query)}`);
}
