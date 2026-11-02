import { http } from "./client";
import type { ImportPart, ImportPlan, ImportResult } from "./types";

const RAW = { rawContentType: "application/octet-stream", timeoutMs: 120_000 };

/** What a Pi-hole Teleporter archive or an AdGuardHome.yaml would bring over —
 *  nothing changes yet. */
export function preview(file: Blob): Promise<{ plan: ImportPlan }> {
  return http.post("/import", file, RAW);
}

/** Import the chosen parts of the same file. */
export function apply(file: Blob, parts: ImportPart[]): Promise<ImportResult> {
  return http.post(`/import?apply=${parts.join(",")}`, file, RAW);
}
