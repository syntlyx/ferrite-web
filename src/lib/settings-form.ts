/**
 * The Settings page's form model: the editable drafts behind the inputs, how a
 * settings payload becomes those drafts, and how edited drafts become the
 * PATCH body — split into the fields the server applies live and the ones
 * that take a restart. Pure data and functions; the page holds the state.
 */
import type {
  PatchSettingsBody,
  Settings as SettingsType,
  StorageBackend,
  UpstreamConfig,
  ZoneConfig,
} from "@/api/types";

export type UpstreamDraft = {
  type: string;
  address: string;
  port: string;
  tls_name: string;
  url: string;
  bootstrap_ip: string;
  egress: string;
};

export type ZoneDraft = {
  name: string;
  upstream: string;
};

export const DEFAULT_UPSTREAM_DRAFT: UpstreamDraft = {
  type: "plain",
  address: "1.1.1.1",
  port: "53",
  tls_name: "",
  url: "",
  bootstrap_ip: "",
  egress: "",
};

export const UPSTREAM_PRESETS: { label: string; draft: UpstreamDraft }[] = [
  {
    label: "Cloudflare DoT",
    draft: {
      type: "tls",
      address: "1.1.1.1",
      port: "853",
      tls_name: "cloudflare-dns.com",
      url: "",
      bootstrap_ip: "",
      egress: "",
    },
  },
  {
    label: "Google DoT",
    draft: {
      type: "tls",
      address: "8.8.8.8",
      port: "853",
      tls_name: "dns.google",
      url: "",
      bootstrap_ip: "",
      egress: "",
    },
  },
  {
    label: "Quad9 DoT",
    draft: {
      type: "tls",
      address: "9.9.9.9",
      port: "853",
      tls_name: "dns.quad9.net",
      url: "",
      bootstrap_ip: "",
      egress: "",
    },
  },
  {
    label: "Cloudflare DoH",
    draft: {
      type: "https",
      address: "",
      port: "443",
      tls_name: "",
      url: "https://cloudflare-dns.com/dns-query",
      bootstrap_ip: "1.1.1.1",
      egress: "",
    },
  },
];

export function defaultPort(type: string): string {
  if (type === "tls" || type === "quic") return "853";
  return "53";
}

function upstreamToDraft(upstream: UpstreamConfig): UpstreamDraft {
  return {
    ...DEFAULT_UPSTREAM_DRAFT,
    type: upstream.type || "plain",
    address: upstream.address ?? "",
    port: String(upstream.port ?? Number(defaultPort(upstream.type))),
    tls_name: upstream.tls_name ?? "",
    url: upstream.url ?? "",
    bootstrap_ip: upstream.bootstrap_ip ?? "",
    egress: upstream.egress ?? "",
  };
}

function draftToUpstream(draft: UpstreamDraft): UpstreamConfig {
  const type = draft.type || "plain";
  if (type === "https") {
    const upstream: UpstreamConfig = { type, url: draft.url.trim() };
    const bootstrap = draft.bootstrap_ip.trim();
    if (bootstrap) upstream.bootstrap_ip = bootstrap;
    return upstream;
  }

  const upstream: UpstreamConfig = {
    type,
    address: draft.address.trim(),
    port: Number(draft.port),
  };
  if (type === "tls" || type === "quic") upstream.tls_name = draft.tls_name.trim();
  // Tunneling is supported for plain DNS-over-TCP and DoT only (both ride a byte
  // stream); DoH/DoQ can't go through the userspace egress.
  if ((type === "plain" || type === "tls") && draft.egress.trim()) {
    upstream.egress = draft.egress.trim();
  }
  return upstream;
}

function upstreamsToDraft(upstreams: UpstreamConfig[] | undefined): UpstreamDraft[] {
  return upstreams?.length ? upstreams.map(upstreamToDraft) : [{ ...DEFAULT_UPSTREAM_DRAFT }];
}

function zonesToDraft(zones: ZoneConfig[] | undefined): ZoneDraft[] {
  return zones?.map((z) => ({ name: z.name, upstream: z.upstream })) ?? [];
}

function draftToZone(draft: ZoneDraft): ZoneConfig {
  return {
    name: draft.name.trim(),
    upstream: draft.upstream.trim(),
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

export type HotForm = {
  dns_min_ttl: string;
  dns_max_ttl: string;
  dns_client_ttl: string;
  log_retention_days: string;
  log_max_mb: string;
  web_dir: string;
  api_key: string;
  password: string;
  blocklist_enabled: boolean;
  debug_logging: boolean;
  log_queries: boolean;
  keep_stats: boolean;
};

export type RestartForm = {
  storage_backend: StorageBackend;
  storage_path: string;
  blocklist_cache_dir: string;
  dns_bind_addr: string;
  dns_cache_size: string;
  dns_strip_ecs: boolean;
  dns_dnssec: boolean;
  blocklist_decision_cache_size: string;
  api_bind_addr: string;
  upstream: UpstreamDraft[];
  zones: ZoneDraft[];
  panel_enabled: boolean;
  panel_domain: string;
  panel_ipv4: string;
  panel_url: string;
};

export function hotFormFromSettings(s: SettingsType): Omit<HotForm, "api_key" | "password"> {
  return {
    dns_min_ttl: String(s.dns?.min_ttl ?? ""),
    dns_max_ttl: String(s.dns?.max_ttl ?? ""),
    dns_client_ttl: String(s.dns?.client_ttl ?? ""),
    log_retention_days: String(s.storage?.log_retention_days ?? ""),
    log_max_mb: String(s.storage?.log_max_mb ?? ""),
    web_dir: String(s.web_dir ?? ""),
    blocklist_enabled: s.blocklist?.enabled ?? true,
    // Matches the server default: debug logging is off unless turned on.
    debug_logging: s.debug_logging ?? false,
    // Recording is on unless the operator switched it off.
    log_queries: s.storage?.log_queries ?? true,
    keep_stats: s.storage?.keep_stats ?? true,
  };
}

/** Build the restart-form draft from a settings payload. Shared by the initial
 *  load and the post-restart poll so the two stay in sync. */
export function restartFormFromSettings(s: SettingsType): RestartForm {
  return {
    storage_backend: s.storage?.backend ?? "sqlite",
    storage_path: s.storage?.path ?? "",
    blocklist_cache_dir: s.storage?.blocklist_cache_dir ?? "",
    dns_bind_addr: s.dns?.bind_addr ?? "",
    dns_cache_size: String(s.dns?.cache_size ?? ""),
    dns_strip_ecs: s.dns?.strip_ecs ?? true,
    dns_dnssec: s.dns?.dnssec ?? true,
    blocklist_decision_cache_size: String(s.blocklist?.decision_cache_size ?? ""),
    api_bind_addr: s.api?.bind_addr ?? "",
    upstream: upstreamsToDraft(s.upstream),
    zones: zonesToDraft(s.zones),
    panel_enabled: s.panel?.enabled ?? true,
    panel_domain: s.panel?.domain ?? "fe.te",
    panel_ipv4: s.panel?.ipv4 ?? "",
    panel_url: s.panel?.url ?? "",
  };
}

/** Diff the live-applied fields against the loaded settings. */
export function buildHotPatch(
  form: HotForm,
  logIgnore: string[],
  settings: SettingsType,
): PatchSettingsBody {
  const patch: PatchSettingsBody = {};
  if (form.dns_min_ttl !== "" && Number(form.dns_min_ttl) !== settings.dns?.min_ttl)
    patch.dns_min_ttl = Number(form.dns_min_ttl);
  if (form.dns_max_ttl !== "" && Number(form.dns_max_ttl) !== settings.dns?.max_ttl)
    patch.dns_max_ttl = Number(form.dns_max_ttl);
  // 0 is a real value here ("clients must not cache"), so only "" means unset.
  if (form.dns_client_ttl !== "" && Number(form.dns_client_ttl) !== settings.dns?.client_ttl)
    patch.dns_client_ttl = Number(form.dns_client_ttl);
  if (
    form.log_retention_days !== "" &&
    Number(form.log_retention_days) !== settings.storage?.log_retention_days
  )
    patch.log_retention_days = Number(form.log_retention_days);
  if (form.log_max_mb !== "" && Number(form.log_max_mb) !== (settings.storage?.log_max_mb ?? 0))
    patch.log_max_mb = Number(form.log_max_mb);
  const nextWebDir = form.web_dir.trim();
  const currentWebDir = settings.web_dir ?? "";
  if (nextWebDir !== currentWebDir) patch.web_dir = nextWebDir === "" ? null : nextWebDir;
  if (form.api_key.trim() !== "") patch.api_key = form.api_key.trim();
  if (form.password !== "") patch.password = form.password;
  if (form.blocklist_enabled !== (settings.blocklist?.enabled ?? true))
    patch.blocklist_enabled = form.blocklist_enabled;
  if (form.debug_logging !== (settings.debug_logging ?? false))
    patch.debug_logging = form.debug_logging;
  if (form.log_queries !== (settings.storage?.log_queries ?? true))
    patch.log_queries = form.log_queries;
  if (form.keep_stats !== (settings.storage?.keep_stats ?? true))
    patch.keep_stats = form.keep_stats;
  const originalIgnore = settings.dns?.log_ignore ?? [];
  if (JSON.stringify(logIgnore) !== JSON.stringify(originalIgnore))
    patch.dns_log_ignore = logIgnore;
  return patch;
}

/** Diff the restart-required fields against the loaded settings. */
export function buildRestartPatch(form: RestartForm, settings: SettingsType): PatchSettingsBody {
  const patch: PatchSettingsBody = {};
  if (form.storage_backend !== (settings.storage?.backend ?? "sqlite"))
    patch.storage_backend = form.storage_backend;
  // Only meaningful for the sqlite backend, and only when it actually moved.
  if (
    form.storage_backend === "sqlite" &&
    form.storage_path.trim() !== "" &&
    form.storage_path.trim() !== (settings.storage?.path ?? "")
  )
    patch.storage_path = form.storage_path.trim();
  // Independent of the backend: the memory backend still keeps this on disk.
  if (
    form.blocklist_cache_dir.trim() !== "" &&
    form.blocklist_cache_dir.trim() !== (settings.storage?.blocklist_cache_dir ?? "")
  )
    patch.blocklist_cache_dir = form.blocklist_cache_dir.trim();
  if (form.dns_bind_addr !== (settings.dns?.bind_addr ?? ""))
    patch.dns_bind_addr = form.dns_bind_addr;
  if (form.dns_cache_size !== String(settings.dns?.cache_size ?? ""))
    patch.dns_cache_size = Number(form.dns_cache_size);
  if (form.dns_strip_ecs !== (settings.dns?.strip_ecs ?? true))
    patch.dns_strip_ecs = form.dns_strip_ecs;
  if (form.dns_dnssec !== (settings.dns?.dnssec ?? true)) patch.dns_dnssec = form.dns_dnssec;
  if (form.blocklist_decision_cache_size !== String(settings.blocklist?.decision_cache_size ?? ""))
    patch.blocklist_decision_cache_size = Number(form.blocklist_decision_cache_size);
  if (form.api_bind_addr !== (settings.api?.bind_addr ?? ""))
    patch.api_bind_addr = form.api_bind_addr;

  const nextUpstreams = form.upstream.map(draftToUpstream);
  const currentUpstreams = (settings.upstream ?? []).map(upstreamToDraft).map(draftToUpstream);
  if (stableJson(nextUpstreams) !== stableJson(currentUpstreams)) patch.upstream = nextUpstreams;

  const nextZones = form.zones.map(draftToZone).filter((z) => z.name || z.upstream);
  const currentZones = zonesToDraft(settings.zones).map(draftToZone);
  if (stableJson(nextZones) !== stableJson(currentZones)) patch.zones = nextZones;

  if (form.panel_enabled !== (settings.panel?.enabled ?? true))
    patch.panel_enabled = form.panel_enabled;
  const nextPanelDomain = form.panel_domain.trim() || "fe.te";
  if (nextPanelDomain !== (settings.panel?.domain ?? "fe.te")) patch.panel_domain = nextPanelDomain;
  const nextPanelIpv4 = form.panel_ipv4.trim();
  if (nextPanelIpv4 !== (settings.panel?.ipv4 ?? ""))
    patch.panel_ipv4 = nextPanelIpv4 === "" ? null : nextPanelIpv4;
  const nextPanelUrl = form.panel_url.trim();
  if (nextPanelUrl !== (settings.panel?.url ?? ""))
    patch.panel_url = nextPanelUrl === "" ? null : nextPanelUrl;
  return patch;
}
