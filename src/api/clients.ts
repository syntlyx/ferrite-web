import { http } from "./client";
import type {
  ClientEntry,
  ClientsResponse,
  AliasesResponse,
  AddAliasBody,
  ClientAlias,
  RemoveAliasResponse,
} from "./types";

/** Top clients by query count across retained history. IPv4+IPv6 sharing a PTR name are merged. */
export function list(limit = 50): Promise<ClientsResponse> {
  return http.get(`/clients?limit=${limit}`);
}

/**
 * Device identity tokens for a client, used to filter the query log by device.
 * Queries are tagged by MAC when known, so a client's MAC(s) capture its whole
 * history across every IP it used. Falls back to the client's IP(s), then name.
 */
export function deviceTokens(client: ClientEntry): string[] {
  if (client.macs.length > 0) return client.macs;
  if (client.ips.length > 0) return client.ips;
  return [client.name];
}

// ── Aliases ───────────────────────────────────────────────────────────────────

/** All manually configured aliases */
export function getAliases(): Promise<AliasesResponse> {
  return http.get("/clients/aliases");
}

/**
 * Add or update a manual alias.
 * Takes priority over PTR lookup and persists across restarts.
 */
export function addAlias(body: AddAliasBody): Promise<ClientAlias> {
  return http.post("/clients/aliases", body);
}

/** Remove a manual alias by IP or MAC address */
export function removeAlias(key: string): Promise<RemoveAliasResponse> {
  return http.del(`/clients/aliases/${encodeURIComponent(key)}`);
}
