import { http } from "./client";
import type { AuthStatus, LoginResponse, PanelSession } from "./types";

/** Check current session — always public (🔓) */
export function checkAuth(): Promise<AuthStatus> {
  return http.get("/auth");
}

/** Authenticate with password, receive a session token (7 days since last use) */
export function login(password: string): Promise<LoginResponse> {
  return http.post("/auth", { password });
}

/** Invalidate the current session token */
export function logout(): Promise<void> {
  return http.del("/auth");
}

/** Every session that can still sign in, oldest first. */
export function sessions(): Promise<PanelSession[]> {
  return http.get("/auth/sessions");
}

/** Sign one session out — possibly the caller's own. */
export function revokeSession(id: string): Promise<{ status: string }> {
  return http.del(`/auth/sessions/${encodeURIComponent(id)}`);
}

/** Sign out every session but the caller's. */
export function revokeOtherSessions(): Promise<{ status: string; removed: number }> {
  return http.del("/auth/sessions");
}
