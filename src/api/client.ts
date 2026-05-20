/**
 * Base HTTP client.
 * Token management + single point for all fetch calls.
 */

const BASE = "/api";

type QueryParam = string | number | boolean | null | undefined;
type QueryParams<T extends object> = {
  [K in keyof T]: T[K] extends QueryParam ? T[K] : never;
};

// ── Token helpers ─────────────────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem("ferrite_token");
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem("ferrite_token", token);
  else localStorage.removeItem("ferrite_token");
}

export function withQuery<T extends object>(path: string, params: QueryParams<T>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, QueryParam][]) {
    if (value != null && value !== "") query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

// ── Core request ─────────────────────────────────────────────────────────────

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));

  if (res.status === 401) {
    setToken(null);
    window.location.pathname = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    // Error responses are { "error": "..." } — extract the message
    let message = res.statusText;
    try {
      const json = (await res.json()) as { error?: string };
      message = json.error ?? message;
    } catch {
      try {
        message = (await res.text()) || message;
      } catch {
        /* ignore */
      }
    }
    throw new Error(message);
  }

  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? (res.json() as Promise<T>) : (null as T);
}

// ── Convenience shorthands ────────────────────────────────────────────────────

export const http = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};
