import { http } from "./client";
import type {
  BlacklistResponse,
  WhitelistResponse,
  DomainBlacklistResult,
  DomainWhitelistResult,
  DomainCheckResult,
  BlocklistProfile,
  ProfilesResponse,
  PutProfilesResponse,
} from "./types";

// ── Blacklist ─────────────────────────────────────────────────────────────────

export function getBlacklist(): Promise<BlacklistResponse> {
  return http.get("/blocklist/blacklist");
}

export function addBlacklist(domain: string): Promise<DomainBlacklistResult> {
  return http.post("/blocklist/blacklist", { domain });
}

export function removeBlacklist(domain: string): Promise<DomainBlacklistResult> {
  return http.del(`/blocklist/blacklist/${encodeURIComponent(domain)}`);
}

// ── Whitelist ─────────────────────────────────────────────────────────────────

export function getWhitelist(): Promise<WhitelistResponse> {
  return http.get("/blocklist/whitelist");
}

export function addWhitelist(domain: string): Promise<DomainWhitelistResult> {
  return http.post("/blocklist/whitelist", { domain });
}

export function removeWhitelist(domain: string): Promise<DomainWhitelistResult> {
  return http.del(`/blocklist/whitelist/${encodeURIComponent(domain)}`);
}

// ── Check ─────────────────────────────────────────────────────────────────────

/** Check whether a domain would be blocked (considers whitelist override) */
export function checkDomain(domain: string): Promise<DomainCheckResult> {
  return http.get(`/blocklist/check/${encodeURIComponent(domain)}`);
}

// ── Per-device profiles ───────────────────────────────────────────────────────

/** Configured profiles + the list names available to build them from. */
export function getProfiles(): Promise<ProfilesResponse> {
  return http.get("/blocklist/profiles");
}

/** Replace the whole profile set; hot-reloads and persists. */
export function putProfiles(profiles: BlocklistProfile[]): Promise<PutProfilesResponse> {
  return http.put("/blocklist/profiles", profiles);
}
