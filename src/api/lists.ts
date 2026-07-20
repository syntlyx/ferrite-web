import { http } from "./client";
import type {
  ListsResponse,
  AddListBody,
  AddListResponse,
  PatchListBody,
  PatchListResponse,
  RemoveListResponse,
  RefreshListResponse,
  RefreshAllListsResponse,
} from "./types";

/** All configured subscription lists */
export function getAll(): Promise<ListsResponse> {
  return http.get("/lists");
}

/** Add a new list and trigger a background FST rebuild */
export function add(body: AddListBody): Promise<AddListResponse> {
  return http.post("/lists", body);
}

/**
 * Enable or disable a list without removing it.
 * Triggers a background FST rebuild.
 */
export function toggle(name: string, body: PatchListBody): Promise<PatchListResponse> {
  return http.patch(`/lists/${encodeURIComponent(name)}`, body);
}

/** Remove a list and rebuild the FST without it */
export function remove(name: string): Promise<RemoveListResponse> {
  return http.del(`/lists/${encodeURIComponent(name)}`);
}

/** Force re-download of a single list, ignoring disk cache */
export function refresh(name: string): Promise<RefreshListResponse> {
  return http.post(`/lists/${encodeURIComponent(name)}/refresh`);
}

/** Force re-download of all lists; waits for the FST rebuild to complete.
 *  Downloading every list + one full rebuild can easily exceed the default
 *  30s client timeout, so allow up to 5 minutes. Also refreshes allowlist
 *  subscriptions — the server rebuilds both sets in one pass. */
export function refreshAll(): Promise<RefreshAllListsResponse> {
  return http.post("/lists/refresh", undefined, { timeoutMs: 300_000 });
}

// ── Allowlist subscriptions ──────────────────────────────────────────────────
// Mirror of the blocklist endpoints above, opposite polarity: these lists
// exempt domains from blocking instead of blocking them.

/** All configured allowlist subscriptions */
export function getAllAllow(): Promise<ListsResponse> {
  return http.get("/allowlists");
}

/** Add a new allowlist and trigger a background rebuild */
export function addAllow(body: AddListBody): Promise<AddListResponse> {
  return http.post("/allowlists", body);
}

/** Enable or disable an allowlist without removing it. */
export function toggleAllow(name: string, body: PatchListBody): Promise<PatchListResponse> {
  return http.patch(`/allowlists/${encodeURIComponent(name)}`, body);
}

/** Remove an allowlist and rebuild the allow set without it */
export function removeAllow(name: string): Promise<RemoveListResponse> {
  return http.del(`/allowlists/${encodeURIComponent(name)}`);
}

/** Force re-download of a single allowlist, ignoring disk cache */
export function refreshAllow(name: string): Promise<RefreshListResponse> {
  return http.post(`/allowlists/${encodeURIComponent(name)}/refresh`);
}
