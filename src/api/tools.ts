import { http } from "./client";
import type {
  ResolveResult,
  WhoisResult,
  DnssecResult,
  EgressCheckResult,
  CertResult,
  TcpProbeResult,
} from "./types";

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

/** DNSSEC validation check: resolves `name`/`type` fresh and reports the AD
 *  flag and RRSIG count from upstream. */
export function dnssec(name: string, type: string): Promise<DnssecResult> {
  return http.get(
    `/tools/dnssec?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
  );
}

/** Egress reachability check. Omit `egress` to check the box's own direct exit. */
export function egressCheck(egress?: string): Promise<EgressCheckResult> {
  const qs = egress ? `?egress=${encodeURIComponent(egress)}` : "";
  return http.get(`/tools/egress-check${qs}`);
}

/** Fetch the TLS certificate chain for `host`:`port` (default 443), optionally
 *  through an egress tunnel. */
export function cert(host: string, port?: number, egress?: string): Promise<CertResult> {
  const params = new URLSearchParams({ host });
  if (port) params.set("port", String(port));
  if (egress) params.set("egress", egress);
  return http.get(`/tools/cert?${params.toString()}`);
}

/** TCP reachability probe for `host`:`port`, optionally through an egress
 *  tunnel. A refused/timed-out connection resolves with `reachable: false`. */
export function tcpProbe(host: string, port: number, egress?: string): Promise<TcpProbeResult> {
  const params = new URLSearchParams({ host, port: String(port) });
  if (egress) params.set("egress", egress);
  return http.get(`/tools/tcp-probe?${params.toString()}`);
}
