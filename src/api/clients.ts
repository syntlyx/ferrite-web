import { http } from "./client";
import type {
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
