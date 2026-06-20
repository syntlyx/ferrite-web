/**
 * Base HTTP client.
 * Token management + single point for all fetch calls.
 */

import i18n from "@/i18n";

const BASE = "/api";

type QueryParam = string | number | boolean | null | undefined;
type QueryParams<T extends object> = {
  [K in keyof T]: T[K] extends QueryParam ? T[K] : never;
};

type ApiErrorPayload = {
  error?: string;
  code?: string;
  kind?: string;
  details?: string;
};

type ApiClientErrorOptions = {
  status: number;
  statusText: string;
  code?: string;
  kind?: string;
  details?: string;
  rawMessage?: string;
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly code?: string;
  readonly kind?: string;
  readonly details?: string;
  readonly rawMessage?: string;

  constructor(message: string, options: ApiClientErrorOptions) {
    super(message);
    this.name = "ApiClientError";
    this.status = options.status;
    this.statusText = options.statusText;
    this.code = options.code;
    this.kind = options.kind;
    this.details = options.details;
    this.rawMessage = options.rawMessage;
  }
}

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

type RequestOpts = {
  /** Override the default 30s timeout, e.g. for long-running batch operations. */
  timeoutMs?: number;
};

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: RequestOpts,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 30_000);

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));

  if (res.status === 401) {
    setToken(null);
    window.location.pathname = "/login";
    throw new ApiClientError(i18n.t("errors.unauthorized"), {
      status: res.status,
      statusText: res.statusText,
      code: "unauthorized",
      kind: "unauthorized",
    });
  }

  if (!res.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await res.json()) as ApiErrorPayload;
    } catch {
      try {
        payload.error = (await res.text()) || undefined;
      } catch {
        /* ignore */
      }
    }

    const message = translatedErrorMessage(payload, res.status, res.statusText);
    throw new ApiClientError(message, {
      status: res.status,
      statusText: res.statusText,
      code: payload.code,
      kind: payload.kind,
      details: payload.details,
      rawMessage: payload.error,
    });
  }

  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? (res.json() as Promise<T>) : (null as T);
}

// ── Convenience shorthands ────────────────────────────────────────────────────

export const http = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown, opts?: RequestOpts) =>
    request<T>("POST", path, body, opts),
  del: <T>(path: string) => request<T>("DELETE", path),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
};

function translatedErrorMessage(
  payload: ApiErrorPayload,
  status: number,
  statusText: string,
): string {
  const rawMessage = payload.error ?? statusText;
  const details = payload.details ?? rawMessage;
  const code = payload.code ?? defaultErrorCode(status);
  const translated = i18n.t(`errors.${code}`, {
    details,
    defaultValue: "",
  });

  if (typeof translated === "string" && translated.trim()) {
    return translated;
  }

  const fallback = i18n.t(`errors.${defaultErrorCode(status)}`, {
    details,
    defaultValue: "",
  });

  if (typeof fallback === "string" && fallback.trim()) {
    return fallback;
  }

  return rawMessage;
}

function defaultErrorCode(status: number): string {
  if (status === 400) return "bad_request";
  if (status === 401) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  return "internal";
}
