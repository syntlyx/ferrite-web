import { http } from "./client";
import type { AuthStatus, LoginResponse } from "./types";

/** Check current session — always public (🔓) */
export function checkAuth(): Promise<AuthStatus> {
  return http.get("/auth");
}

/** Authenticate with password, receive a 24h session token */
export function login(password: string): Promise<LoginResponse> {
  return http.post("/auth", { password });
}

/** Invalidate the current session token */
export function logout(): Promise<void> {
  return http.del("/auth");
}
