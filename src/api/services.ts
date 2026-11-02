import { http } from "./client";
import type { BlockedServicesResponse, PutBlockedServicesResponse, ServiceCatalog } from "./types";

let catalogCache: Promise<ServiceCatalog> | null = null;

/** The built-in service catalog. It only changes with a server release, so one
 *  fetch serves the whole session; a failed fetch is retried next call. */
export function catalog(): Promise<ServiceCatalog> {
  catalogCache ??= http.get<ServiceCatalog>("/services").catch((e: unknown) => {
    catalogCache = null;
    throw e;
  });
  return catalogCache;
}

/** Services blocked for every device. */
export function getBlocked(): Promise<BlockedServicesResponse> {
  return http.get("/blocklist/services");
}

/** Replace the services blocked for every device; live at once and persisted. */
export function putBlocked(services: string[]): Promise<PutBlockedServicesResponse> {
  return http.put("/blocklist/services", { services });
}
