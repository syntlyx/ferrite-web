import { http } from "./client";
import type { SecureDnsSettings, SecureDnsView } from "./types";

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
