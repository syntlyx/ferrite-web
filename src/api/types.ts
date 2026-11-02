// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthStatus {
  authenticated: boolean;
  password_set: boolean;
}

export interface LoginResponse {
  token: string;
  expires_in: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

export interface TopClientEntry {
  name: string;
  total: number;
  ips: string[];
  macs: string[];
}

export interface StatsSummary {
  total_queries: number;
  blocked_queries: number;
  cached_queries: number;
  upstream_queries: number;
  block_percentage: number;
  total_domains_blocked: number;
  /** Query stats dropped under writer back-pressure; >0 means counters/feed undercount. */
  dropped_stats: number;
  top_domains: [string, number][];
  top_blocked: [string, number][];
  top_clients: TopClientEntry[];
  recent_domains: QueryEntry[];
  recent_blocked: QueryEntry[];
  timeseries: TimeseriesBucket[];
}

export interface SystemMemory {
  total_bytes: number;
  used_bytes: number;
  used_percent: number;
  available_bytes?: number;
  free_bytes?: number;
  allocated_bytes?: number;
  reclaimable_bytes?: number;
}

export interface SystemNetwork {
  rx_bytes_per_sec: number;
  tx_bytes_per_sec: number;
  link_speed_mbps: number | null;
  rx_utilization_percent: number | null;
  tx_utilization_percent: number | null;
}

export interface SystemDisk {
  mount: string;
  total_bytes: number;
  used_bytes: number;
  used_percent: number;
}

export interface SystemLoadAvg {
  one: number;
  five: number;
  fifteen: number;
}

export interface SystemProcess {
  memory_bytes: number;
  memory_percent: number;
  cpu_percent: number;
}

export interface SystemStats {
  cpu_usage_percent: number;
  cpu_temp_celsius: number | null;
  memory: SystemMemory;
  swap: SystemMemory;
  network: SystemNetwork;
  disk: SystemDisk | null;
  load_avg: SystemLoadAvg;
  uptime_seconds: number;
  process: SystemProcess | null;
}

/**
 * One 10-minute bucket in the 24h timeseries.
 * `bucket` — Unix timestamp (UTC) of the start of the window.
 * Buckets with zero traffic are omitted from the API response;
 * the frontend must fill gaps with zeros when rendering a full chart.
 * `cached` + `upstream` + `blocked` should match `total`.
 */
export interface TimeseriesBucket {
  bucket: number;
  total: number;
  blocked: number;
  cached: number;
  upstream: number;
}

export interface TopBlockedEntry {
  domain: string;
  count: number;
}

export interface TopBlockedResponse {
  domains: TopBlockedEntry[];
  from_ts: number;
  to_ts: number;
}

export interface TopClientsResponse {
  clients: TopClientEntry[];
  from_ts: number;
  to_ts: number;
}

export interface TopBlockedParams {
  limit?: number; // default 20, max 200
  hours?: number; // default 24, max 168
}

// ─────────────────────────────────────────────────────────────────────────────
// Query log
// ─────────────────────────────────────────────────────────────────────────────

export type QueryStatus = "allowed" | "blocked" | "cached" | "upstream" | "routed";

/**
 * DNS query type number (1=A, 28=AAAA, 5=CNAME, 15=MX, 16=TXT, 12=PTR, 33=SRV, 65=HTTPS).
 */
export type QueryTypeNum = number;

/**
 * DNS response code (0=NOERROR, 1=FORMERR, 2=SERVFAIL, 3=NXDOMAIN).
 */
export type RCode = 0 | 1 | 2 | 3 | number;

export interface QueryEntry {
  id: number;
  timestamp: string; // ISO 8601, e.g. "2025-04-22T14:03:12Z"
  domain: string;
  query_type: QueryTypeNum;
  client_ip: string; // source IP at query time
  device: string; // stable device identity: MAC when known, else the IP (fallback)
  client_name?: string; // resolved PTR or alias; absent if unknown
  status: QueryStatus;
  latency_ms: number;
  upstream: string | null; // upstream resolver label, null if cache/blocklist
  rcode: RCode;
}

export interface QueryFilters {
  from_ts?: number;
  to_ts?: number;
  domain?: string;
  client_ip?: string;
  /** Device identity token(s) (MAC or IP fallback), comma-separated. Returns all
   *  of a device's queries across every IP it used. OR-combined with client_ip. */
  device?: string;
  status?: QueryStatus | "";
  limit?: number;
  before_id?: number;
  before_ts?: number;
  /** Delta cursor: only entries with id > after_id, served from the live ring
   *  buffer. The server ignores all other filters on this path. */
  after_id?: number;
  offset?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientEntry {
  name: string; // PTR hostname, manual alias, or IP string
  ips: string[]; // all IPs belonging to this client
  macs: string[]; // learned MACs associated with this client
  total: number;
  blocked: number;
  last_seen: number; // Unix timestamp
  is_alias: boolean; // true if name was set via aliases API
  blocking_bypassed: boolean; // true when this client bypasses blocklist filtering
  /** Unix seconds the box first saw any of its MACs; absent when unknown or
   *  learned before first sightings were kept. */
  first_seen?: number;
}

/** One device in detail — `GET /clients/{device}/stats`. Everything from
 *  `top_domains` down covers the last `hours`. */
export interface DeviceStats {
  device: string;
  name: string | null;
  ips: string[];
  mac: string | null;
  total: number;
  blocked: number;
  last_seen: number;
  first_seen: number | null;
  hours: number;
  top_domains: DeviceDomain[];
  top_blocked: DeviceDomain[];
  services: { id: string; name: string; queries: number; blocked: number }[];
  /** 10-minute buckets with any queries, oldest first. */
  activity: { bucket: number; total: number; blocked: number }[];
}

export interface DeviceDomain {
  domain: string;
  total: number;
  blocked: number;
}

export interface ClientsResponse {
  clients: ClientEntry[];
}

export interface ClientAlias {
  ip?: string;
  mac?: string;
  name: string;
  type?: "ip" | "mac";
}

export interface AliasesResponse {
  aliases: ClientAlias[];
}

export interface AddAliasBody {
  ip?: string;
  mac?: string;
  name: string;
}

export interface RemoveAliasResponse {
  ip?: string;
  mac?: string;
  status: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocklist
// ─────────────────────────────────────────────────────────────────────────────

export interface BlacklistResponse {
  blacklist: string[];
}

export interface WhitelistResponse {
  whitelist: string[];
}

export interface DomainBlacklistResult {
  domain: string;
  status: "blacklisted" | "removed";
}

export interface DomainWhitelistResult {
  domain: string;
  status: "whitelisted" | "removed";
}

/** A source that matches a domain in the block-check attribution. */
export interface BlockSource {
  kind: "blacklist" | "wildcard" | "service" | "list" | string;
  name: string; // list name, "manual blacklist", or the wildcard pattern
  matched: string; // the key/pattern that matched (domain or a parent of it)
}

/** The whitelist entry that exempts a domain. */
export interface WhitelistMatch {
  entry: string; // the configured whitelist entry (exact key or wildcard)
  matched: string; // where it matched (the domain or a parent of it)
  /** The subscribed allowlist that holds the entry; absent for a manual entry. */
  list?: string;
}

/** Selective-routing decision for a domain in the block-check. */
export interface DomainRouting {
  /** Whether selective routing is enabled at all. */
  enabled: boolean;
  /** The matched rule, or null when the domain routes direct. */
  match: {
    egress: string;
    /** Rule is scoped to specific clients only. */
    client_scoped: boolean;
    healthy: boolean;
  } | null;
}

export interface DomainCheckResult {
  domain: string;
  blocked: boolean;
  whitelisted: boolean;
  /** Present when whitelisted — which entry exempted it. */
  whitelist_match?: WhitelistMatch;
  /** Every source that would block this domain (may be non-empty even when
   *  `blocked` is false, if a whitelist entry overrides it). */
  sources?: BlockSource[];
  /** Selective-routing decision: whether/where this domain's traffic is tunneled. */
  routing?: DomainRouting;
  /** Present when asked with `client`: that device's own decision. */
  for_client?: ClientDecision;
}

/** One device's decision for a domain. */
export interface ClientDecision {
  client: string;
  mac?: string | null;
  /** The profile on for the device right now, if any. */
  profile?: string | null;
  /** Paused or bypassing filtering. */
  filtering_off: boolean;
  blocked: boolean;
  /** The safe host this name resolves to for the device instead, if any. */
  safe_search_answer?: string | null;
}

// ── Per-device blocking profiles ──────────────────────────────────────────────

/** A profile applies a subset of the subscription lists to specific clients. */
export interface BlocklistProfile {
  /** Stable slug; derived from the name client-side. */
  id: string;
  name: string;
  /** Subscription list names this profile includes (subset of all lists). */
  lists: string[];
  /** Client IPs/MACs this profile applies to. */
  clients: string[];
  /** Domains blocked only for this profile (overrides the global whitelist). */
  block: string[];
  /** Domains allowed only for this profile (overrides the global block + lists). */
  allow: string[];
  /** Catalog service ids blocked only for this profile (same tier as `block`). */
  services: string[];
  /** Weekly windows when the profile applies (box-local time). Empty = always. */
  schedule: ScheduleWindow[];
  /** Force SafeSearch for these devices (on top of the network-wide setting). */
  safe_search: boolean;
  /** YouTube Restricted Mode for these devices; the stricter of this and the
   *  network-wide setting applies. */
  youtube_restricted: YoutubeRestrict;
  /** Allowlist subscription names this profile includes. Empty = inherit
   *  every enabled allowlist. */
  allowlists: string[];
  /** Block everything not explicitly allowed (local network names exempt). */
  default_deny: boolean;
}

export interface ProfilesResponse {
  profiles: BlocklistProfile[];
  /** Subscription list names available to build profiles from. */
  available_lists: string[];
  /** Allowlist subscription names available for per-profile selection. */
  available_allowlists: string[];
  /** Saved profile id → is its schedule on right now. */
  active?: Record<string, boolean>;
  /** The box-local clock schedules are judged by. */
  clock?: { minute_of_week: number; utc_offset: string };
}

/** One weekly window of a profile schedule. */
export interface ScheduleWindow {
  /** `mon`…`sun`, the days the window starts on. Empty = every day. */
  days: string[];
  /** `HH:MM`, box-local. */
  from: string;
  /** `HH:MM`; earlier than `from` runs past midnight, equal covers the day. */
  to: string;
}

export interface PutProfilesResponse {
  status: string;
  persisted: boolean;
  saved_to?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostic tools (DNS lookup + WHOIS)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveAnswer {
  name: string;
  type: string;
  ttl: number;
  data: string;
}

export interface ResolveResult {
  query: string;
  type: string;
  rcode: string;
  upstream: string;
  answers: ResolveAnswer[];
}

export interface WhoisResult {
  query: string;
  server: string;
  result: string;
}

/** DNSSEC validation check for `name`/`type`, resolved fresh through upstream. */
export interface DnssecResult {
  query: string;
  type: string;
  rcode: string;
  /** The DNSSEC AD (Authenticated Data) flag from the upstream response. */
  authenticated: boolean;
  /** Number of RRSIG records returned with the answer. */
  rrsig_count: number;
  upstream: string;
  answers: ResolveAnswer[];
}

/** Egress reachability check: connects out through `egress` (or direct when
 *  null) and reports the observed exit IP via Cloudflare's trace endpoint. */
export interface EgressCheckResult {
  /** The egress id checked, or null for the box's own direct exit. */
  egress: string | null;
  /** null when the check could not complete. */
  healthy: boolean | null;
  connect_ms: number;
  exit_ip: string | null;
  country: string | null;
  colo: string | null;
  tls: string | null;
}

/** One link in a TLS certificate chain. Either a parsed cert or a parse failure. */
export interface CertEntry {
  is_leaf: boolean;
  sha256: string;
  /** Present on parse failure; the parsed fields below are absent then. */
  parse_error?: string;
  subject?: string;
  issuer?: string;
  sans?: string[];
  not_before?: string;
  not_before_unix?: number;
  not_after?: string;
  not_after_unix?: number;
  serial?: string;
  sig_alg?: string;
}

export interface CertResult {
  host: string;
  port: number;
  egress: string | null;
  connect_ms: number;
  /** The leaf is `chain[0]` (`is_leaf: true`). */
  chain: CertEntry[];
}

/** TCP reachability probe. A refused/timed-out connection returns
 *  `reachable: false` (HTTP 200), not an error response. */
export interface TcpProbeResult {
  host: string;
  port: number;
  egress: string | null;
  reachable: boolean;
  connect_ms?: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription lists
// ─────────────────────────────────────────────────────────────────────────────

/** Breakdown of how an Adblock-format list was interpreted (present only for
 *  Adblock lists like EasyList; explains the rules-vs-domains gap). */
export interface AdblockStats {
  kept: number;
  exceptions: number;
  unblocked_by_exception: number;
  scoped_skipped: number;
  cosmetic_skipped: number;
  unsupported_skipped: number;
}

export interface SubscriptionList {
  name: string;
  url: string;
  enabled: boolean;
  domains_loaded?: number;
  parse_stats?: AdblockStats;
}

export interface ListsResponse {
  lists: SubscriptionList[];
}

export interface AddListBody {
  name: string;
  url: string;
  enabled: boolean;
}

export interface AddListResponse {
  list: SubscriptionList;
}

export interface PatchListBody {
  enabled: boolean;
}

export interface PatchListResponse {
  list: SubscriptionList;
}

export interface RemoveListResponse {
  name: string;
  status: string;
}

export interface RefreshListResponse {
  name: string;
  domains_loaded: number;
  parse_stats?: AdblockStats;
}

export interface RefreshAllListsResponse {
  lists: SubscriptionList[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom DNS records
// ─────────────────────────────────────────────────────────────────────────────

export type DnsRecordType = "A" | "AAAA" | "CNAME";

export interface CustomRecord {
  domain: string;
  type: DnsRecordType;
  value: string;
  ttl: number;
}

export interface CustomRecordsResponse {
  records: CustomRecord[];
}

export interface AddCustomRecordBody {
  domain: string;
  type: DnsRecordType;
  value: string;
  ttl?: number;
}

export interface AddCustomRecordResponse {
  record: CustomRecord;
}

export interface RemoveCustomRecordResponse {
  domain: string;
  status: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

export interface DnsConfig {
  bind_addr: string;
  cache_size: number;
  /** Bounds for ferrite's *own* cache — not what client devices are told. */
  min_ttl: number;
  max_ttl: number;
  /** Ceiling on the TTL advertised to client devices; `0` = don't cache. */
  client_ttl?: number;
  /** Optimistic cache: answer expired entries briefly while refreshing them. */
  serve_stale?: boolean;
  /** Seconds past expiry an entry may still be served. */
  stale_max_age?: number;
  /** Queries per client per minute; 0 = no limit. */
  rate_limit?: number;
  /** IPs / CIDR ranges answered; empty = everyone. */
  allowed_clients?: string[];
  /** IPs / CIDR ranges never answered. */
  denied_clients?: string[];
  log_ignore?: string[];
  strip_ecs?: boolean;
  dnssec?: boolean;
}

export interface UpstreamConfig {
  type: string;
  address?: string;
  port?: number;
  tls_name?: string;
  url?: string;
  bootstrap_ip?: string;
  /** Route this resolver's DNS through a named egress (tunnel). Only for
   *  `plain`/`tls`. Empty/absent = direct; falls back to direct if the tunnel
   *  is down. */
  egress?: string;
}

export interface ZoneConfig {
  name: string;
  upstream: string;
}

/** Which store holds the query log. `memory` writes nothing to disk and keeps
 *  nothing across a restart. Configuration is in config.toml either way. */
export type StorageBackend = "sqlite" | "memory";

/** One place the database could be put, as reported by
 *  `GET /api/storage/locations`. */
export interface StorageSuggestion {
  /** Full database path — what `storage_path` would be set to. */
  path: string;
  /** The mount it sits on. */
  dir: string;
  /** Filesystem type, or "disk" when it wasn't detected. */
  fstype: string;
  /** In RAM: no flash wear, and empty again after a reboot. */
  ram_backed: boolean;
  total_bytes?: number | null;
  available_bytes?: number | null;
  /** True for the location currently configured. */
  current: boolean;
}

export interface StorageLocations {
  backend: StorageBackend;
  current: string;
  default: string;
  suggestions: StorageSuggestion[];
  /** The compiled blocklist cache, placed from the same suggestions — each
   *  one's `dir` is what `blocklist_cache_dir` would be set to. */
  blocklist_cache?: {
    current: string;
    default: string;
    available_bytes?: number | null;
  };
}

export interface StorageConfig {
  backend?: StorageBackend;
  /** Where the database file lives. Unused by the `memory` backend. */
  path: string;
  /** Directory for the compiled blocklist (FSTs and per-list caches). */
  blocklist_cache_dir?: string;
  log_retention_days?: number;
  /** Cap the query log at this many MB, oldest first. 0/absent = no size cap. */
  log_max_mb?: number;
  /** Privacy switch: keep a per-query log. Absent means the server default (on). */
  log_queries?: boolean;
  /** Privacy switch: keep aggregate statistics. Absent means the server default (on). */
  keep_stats?: boolean;
}

export interface ApiConfig {
  bind_addr: string;
  api_key?: string;
  password_hash?: string;
}

/** What a blocked name is answered with. */
export type BlockResponse = "nxdomain" | "nodata" | "null_ip" | "custom_ip" | "refused";

export interface BlocklistConfig {
  enabled?: boolean;
  /** Absent means `nxdomain`. */
  block_response?: BlockResponse;
  block_ipv4?: string | null;
  block_ipv6?: string | null;
  decision_cache_size?: number;
  lists?: SubscriptionList[];
  /** Manual block entries: exact domains and `*.wildcard` patterns alike. */
  domains?: string[];
  /** @deprecated Folded into `domains` by the server on load. */
  wildcard_block?: string[];
  /** @deprecated Folded into `allowlist.domains` by the server on load. */
  whitelist?: string[];
  client_bypass?: string[];
}

/** A manual client name alias. Exactly one of `ip`/`mac` is set. */
export interface ClientAliasConfig {
  ip?: string;
  mac?: string;
  name: string;
}

export interface PanelConfig {
  enabled?: boolean;
  domain?: string;
  ipv4?: string | null;
  url?: string | null;
}

/** Full parsed config returned by GET /api/settings */
export interface Settings {
  dns?: DnsConfig;
  upstream?: UpstreamConfig[];
  zones?: ZoneConfig[];
  storage?: StorageConfig;
  api?: ApiConfig;
  panel?: PanelConfig;
  blocklist?: BlocklistConfig;
  custom_records?: CustomRecord[];
  client_aliases?: ClientAliasConfig[];
  web_dir?: string;
  debug_logging?: boolean;
}

/** Only runtime-patchable fields */
export interface PatchSettingsBody {
  api_key?: string | null;
  password?: string | null;
  dns_min_ttl?: number;
  dns_max_ttl?: number;
  dns_client_ttl?: number;
  dns_serve_stale?: boolean;
  dns_stale_max_age?: number;
  dns_rate_limit?: number;
  dns_allowed_clients?: string[];
  dns_denied_clients?: string[];
  dns_log_ignore?: string[];
  web_dir?: string | null;
  log_retention_days?: number;
  log_max_mb?: number;
  /** Restart required — the store is built once, at startup. */
  storage_backend?: StorageBackend;
  /** Restart required. Validated server-side before it is saved. */
  storage_path?: string;
  /** Restart required. Validated server-side before it is saved. */
  blocklist_cache_dir?: string;
  log_queries?: boolean;
  keep_stats?: boolean;
  blocklist_enabled?: boolean;
  blocklist_client_bypass?: string[];
  blocklist_block_response?: BlockResponse;
  blocklist_block_ipv4?: string | null;
  blocklist_block_ipv6?: string | null;
  debug_logging?: boolean;
  dns_bind_addr?: string;
  dns_cache_size?: number;
  dns_strip_ecs?: boolean;
  dns_dnssec?: boolean;
  blocklist_decision_cache_size?: number;
  api_bind_addr?: string;
  upstream?: UpstreamConfig[];
  zones?: ZoneConfig[];
  panel_enabled?: boolean;
  panel_domain?: string;
  panel_ipv4?: string | null;
  panel_url?: string | null;
}

export interface PatchSettingsResponse {
  status: string;
  changed: string[];
  persisted: boolean;
  saved_to?: string;
  restart_required: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Updates
// ─────────────────────────────────────────────────────────────────────────────

export interface UpdateComponent {
  current: string;
  latest: string;
  update_available: boolean;
  blocked?: IncompatibleUpdate | null;
}

export interface AvailableUpdate {
  version: string;
  download_url?: string;
  release_notes?: string;
  server_compat?: string;
}

export interface IncompatibleUpdate {
  version: string;
  required_server: string;
  reason: string;
}

export interface RawUpdateCheckResponse {
  current_server_version: string;
  current_server_sha256?: string | null;
  current_web_version: string;
  current_web_sha256?: string | null;
  server_update: AvailableUpdate | null;
  web_update: AvailableUpdate | null;
  incompatible_web_update?: IncompatibleUpdate | null;
  checked_at?: number | null;
  cache_ttl_seconds?: number;
  stale?: boolean;
  check_pending?: boolean;
  last_error?: string | null;
}

export interface UpdateCheckResponse {
  server: UpdateComponent;
  web: UpdateComponent;
  checked_at?: number | null;
  stale?: boolean;
  check_pending?: boolean;
  last_error?: string | null;
}

export interface UpdateApplyResponse {
  status: "updated" | "up_to_date";
  version: string;
}

// ── Proxy / selective routing ───────────────────────────────────────────────

export type EgressKind = "direct" | "socks5" | "wireguard" | "evasion";

export interface ProxyEgress {
  id: string;
  name: string;
  enabled: boolean;
  kind: EgressKind;
  /** socks5: proxy host */
  address?: string | null;
  /** socks5: proxy port */
  port?: number | null;
  username?: string | null;
  /** Redacted (null) on GET; leave blank on save to keep the stored one. */
  password?: string | null;
  /** wireguard: raw `.conf` text (`[Interface]`/`[Peer]`). */
  config?: string | null;
  /** evasion: ClientHello split offset (blank = auto-split at the SNI). */
  seg_position?: number | null;
  /** wireguard: per-connection socket buffer in KiB (blank = default). */
  buffer_kb?: number | null;
}

export interface ProxyRule {
  /** Domain or `*.wildcard`; empty for a service rule. The server omits it
   *  when empty — `api.getProxy` fills it back in. */
  pattern: string;
  /** Catalog service id this rule routes instead of a single pattern. */
  service?: string | null;
  egress: string;
  fail_closed: boolean;
  /** Restrict the rule to these device tokens (MAC or IP). Empty/absent = all
   *  clients. Matches the server's per-rule client scoping. */
  clients?: string[];
}

export interface ProxyConfig {
  enabled: boolean;
  http_port: number;
  https_port: number;
  advertise_ipv4?: string | null;
  advertise_ipv6?: string | null;
  max_connections: number;
  /** host:port the active probe connects to through each egress (blank = default). */
  probe_target?: string | null;
  egresses: ProxyEgress[];
  rules: ProxyRule[];
}

export interface ProxyStateResponse {
  proxy: ProxyConfig;
  egress_health: Record<string, "up" | "down">;
  /** Effective kernel UDP recv-buffer ceiling (KiB); WG buffers above it may stall. */
  max_buffer_kb?: number | null;
}

export interface PutProxyResponse {
  status: string;
  persisted: boolean;
  saved_to?: string | null;
}

/** One domain's traffic through an egress (server keeps a bounded LRU table). */
export interface EgressDomainStats {
  host: string;
  conns: number;
  bytes_up: number;
  bytes_down: number;
  last_seen_secs_ago: number;
}

/** Cumulative counters for one egress (since process start). */
export interface EgressStats {
  healthy: boolean;
  active: number;
  total_conns: number;
  bytes_up: number;
  bytes_down: number;
  connect_fails: number;
  fail_closed_drops: number;
  /** WireGuard only: seconds since the last handshake (null = never / other kinds). */
  handshake_age_secs?: number | null;
  /** WireGuard only: which implementation carries the tunnel. Null for other
   *  kinds, unbuilt/disabled egresses, and servers predating the field. */
  backend?: "kernel" | "userspace" | null;
  /** Seconds this egress has been unhealthy (null while healthy). */
  down_since_secs?: number | null;
  /** Down past the server's alert grace — what the sidebar badge keys on. */
  alerting?: boolean;
  /** Last active-probe result (latency + reachability); null until first probe. */
  probe?: EgressProbe | null;
  /** Busiest first. */
  domains: EgressDomainStats[];
}

/** The last active-probe measurement through an egress. */
export interface EgressProbe {
  /** Round-trip of the last successful probe (ms); null if it failed. */
  rtt_ms: number | null;
  /** Did the last probe succeed? */
  ok: boolean;
  /** Seconds since the last probe ran. */
  last_probe_secs_ago: number;
}

export interface ProxyRuleHits {
  /** The rule's key: its pattern, or `service:<id>` for a service rule. */
  pattern: string;
  egress: string;
  hits: number;
}

export interface ProxyStatsResponse {
  egresses: Record<string, EgressStats>;
  rules: ProxyRuleHits[];
  /** Same kernel probe as GET /api/proxy, so the poll keeps it fresh. */
  max_buffer_kb?: number | null;
}

// ── Server logs ─────────────────────────────────────────────────────────────

export interface LogEntry {
  id: number;
  timestamp: string;
  level: string;
  target: string;
  message: string;
}

export interface LogsResponse {
  logs: LogEntry[];
}

// ── Pausing filtering ────────────────────────────────────────────────────────

export interface PauseState {
  /** Server clock, unix seconds — count down against this, not the browser's. */
  now: number;
  /** When the box-wide pause ends; null when the box is not paused. */
  global_until: number | null;
  /** Paused devices, by normalised IP or MAC. */
  clients: { key: string; until: number }[];
}

// ── Backup & restore ─────────────────────────────────────────────────────────

export interface ConfigImportResponse {
  saved_to: string;
  backup: string | null;
  restart: boolean;
}

// ── Service catalog ───────────────────────────────────────────────────────────

/** One built-in catalog service: a named set of domains. */
export interface ServiceInfo {
  id: string;
  name: string;
  /** One of `ServiceCatalog.categories`. */
  category: string;
  /** Can a tunnel rule route it? False for services that also speak their own
   *  protocol (messengers, game launchers, Spotify). */
  routable: boolean;
  /** Each domain also covers its subdomains. */
  domains: string[];
}

export interface ServiceCatalog {
  /** Category ids in display order. */
  categories: string[];
  services: ServiceInfo[];
}

export interface BlockedServicesResponse {
  services: string[];
}

export interface PutBlockedServicesResponse {
  status: string;
  services: string[];
  persisted: boolean;
  saved_to?: string | null;
}

// ── SafeSearch ────────────────────────────────────────────────────────────────

export type YoutubeRestrict = "off" | "moderate" | "strict";

/** Network-wide SafeSearch / YouTube Restricted Mode. */
export interface SafeSearchSettings {
  safe_search: boolean;
  youtube_restricted: YoutubeRestrict;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

/** A browser signed in to the panel. Times are unix seconds; 0 = not known
 *  (sessions from before ferrite kept the details). */
export interface PanelSession {
  id: string;
  created: number;
  last_seen: number;
  expires: number;
  /** The User-Agent it signed in with. */
  agent: string;
  ip: string;
  /** The device at `ip`, as the client list names it. */
  device: string | null;
  /** The session making this request. */
  current: boolean;
}

// ── Notifications ─────────────────────────────────────────────────────────────

/** What the receiver at the webhook expects — decides the shape of the body. */
export type WebhookFormat = "json" | "ntfy" | "discord" | "slack" | "telegram" | "gotify";

/** The webhook and which events go to it. */
export interface NotificationsSettings {
  webhook?: string | null;
  /** Absent means `json`. */
  format?: WebhookFormat;
  /** The chat a Telegram bot posts to. */
  chat_id?: string | null;
  /** A tunnel down for over a minute, and its recovery. */
  tunnel_alerts: boolean;
  /** A device the box has never seen joins the network. */
  new_device: boolean;
}

// ── MCP ───────────────────────────────────────────────────────────────────────

/** The MCP endpoint for AI assistants. */
export interface McpSettings {
  enabled: boolean;
  /** Offer the tools that change things. */
  allow_changes: boolean;
}

// ── Import from Pi-hole / AdGuard Home ───────────────────────────────────────

export type ImportPart =
  | "lists"
  | "rules"
  | "records"
  | "devices"
  | "services"
  | "dns"
  | "upstreams";

/** What an uploaded Pi-hole or AdGuard Home setup says, in ferrite's terms. */
export interface ImportPlan {
  source: "pihole" | "adguard";
  lists: { url: string; name: string; enabled: boolean }[];
  allowlists: { url: string; name: string; enabled: boolean }[];
  block: string[];
  allow: string[];
  records: CustomRecord[];
  aliases: { ip?: string | null; mac?: string | null; name: string }[];
  profiles: BlocklistProfile[];
  bypass: string[];
  services: string[];
  safe_search: boolean;
  youtube_restricted: YoutubeRestrict;
  block_response: BlockResponse | null;
  block_ipv4: string | null;
  block_ipv6: string | null;
  rate_limit: number | null;
  allowed_clients: string[];
  denied_clients: string[];
  serve_stale: boolean | null;
  upstreams: UpstreamConfig[];
  zones: ZoneConfig[];
  /** What couldn't be carried over, one line each. */
  notes: string[];
}

export interface ImportResult {
  status: string;
  source: string;
  applied: Record<string, unknown>;
  restart_required: boolean;
}

// ── Following a primary ferrite ──────────────────────────────────────────────

export type SyncSection = "filtering" | "records" | "devices" | "dns" | "tunnels";

export interface SyncView {
  /** The primary's panel URL; empty when this box follows nobody. */
  primary: string;
  api_key_set: boolean;
  /** Seconds between syncs. */
  interval: number;
  sections: SyncSection[];
  status: {
    last_attempt: number | null;
    last_ok: number | null;
    last_change: number | null;
    changed: string[];
    error: string | null;
  };
}

export interface SyncPatch {
  primary: string;
  /** Absent = keep, null = clear. */
  api_key?: string | null;
  interval?: number;
  sections?: SyncSection[];
}
