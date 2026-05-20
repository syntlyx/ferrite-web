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

/** Force re-download of all lists; waits for the FST rebuild to complete */
export function refreshAll(): Promise<RefreshAllListsResponse> {
  return http.post("/lists/refresh");
}
