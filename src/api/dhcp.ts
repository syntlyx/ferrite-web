import { http } from "./client";
import type { DhcpLease, DhcpSettings, DhcpView, RaSettings } from "./types";

/** The DHCP server and IPv6 announcer: settings, status, detected defaults. */
export function get(): Promise<DhcpView> {
  return http.get("/dhcp");
}

/** Both sections whole; checked, saved and applied at once. */
export function put(body: { dhcp: DhcpSettings; ra: RaSettings }): Promise<DhcpView> {
  return http.put("/dhcp", body);
}

/** The leases the server is holding right now. */
export function leases(): Promise<{ leases: DhcpLease[]; now: number }> {
  return http.get("/dhcp/leases");
}
