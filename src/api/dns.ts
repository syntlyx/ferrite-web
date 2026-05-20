import { http } from "./client";
import type {
  CustomRecordsResponse,
  AddCustomRecordBody,
  AddCustomRecordResponse,
  RemoveCustomRecordResponse,
} from "./types";

/** All local DNS overrides (A / AAAA / CNAME, wildcards supported) */
export function getAll(): Promise<CustomRecordsResponse> {
  return http.get("/custom-records");
}

/** Add a new record; ttl defaults to 300 if omitted */
export function add(body: AddCustomRecordBody): Promise<AddCustomRecordResponse> {
  return http.post("/custom-records", body);
}

/** Remove a record by domain */
export function remove(domain: string): Promise<RemoveCustomRecordResponse> {
  return http.del(`/custom-records/${encodeURIComponent(domain)}`);
}
