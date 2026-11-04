import { http, withQuery } from "./client";
import type { SecureDnsDevice, SecureDnsSettings, SecureDnsView } from "./types";

/** DNS over TLS / HTTPS for devices: settings, status, what to type in. */
export function get(): Promise<SecureDnsView> {
  return http.get("/secure-dns");
}

/** The whole section; checked, saved and applied at once. */
export function put(body: SecureDnsSettings): Promise<SecureDnsView> {
  return http.put("/secure-dns", body);
}

/** Ask Let's Encrypt again now, not at the next try after a failure. */
export function renew(): Promise<SecureDnsView> {
  return http.post("/secure-dns/renew");
}

/** A short-lived link to `device`'s profile for iPhone, iPad and Mac. */
export function profileLink(device: string): Promise<{ url: string; device: string }> {
  return http.post("/secure-dns/profile-link", { device });
}

/**
 * The device name a client from Clients goes by in encrypted DNS, if any.
 * `client` is its key (MAC or IP): found by that first, so a renamed client
 * keeps its device.
 */
export function device(name: string, client?: string): Promise<SecureDnsDevice> {
  return http.get(withQuery("/secure-dns/device", { name, client: client ?? null }));
}

/** Give a client from Clients a device name in encrypted DNS, as its own. */
export function makeDevice(name: string, client?: string): Promise<SecureDnsDevice> {
  return http.post("/secure-dns/device", { name, client: client ?? null });
}
