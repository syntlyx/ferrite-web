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

export type QueryStatus = "allowed" | "blocked" | "cached" | "upstream";

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
  kind: "blacklist" | "wildcard" | "list" | string;
  name: string; // list name, "manual blacklist", or the wildcard pattern
  matched: string; // the key/pattern that matched (domain or a parent of it)
}

/** The whitelist entry that exempts a domain. */
export interface WhitelistMatch {
  entry: string; // the configured whitelist entry (exact key or wildcard)
  matched: string; // where it matched (the domain or a parent of it)
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
  min_ttl: number;
  max_ttl: number;
  log_ignore?: string[];
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

export interface StorageConfig {
  backend: string;
  path: string;
  log_retention_days?: number;
}

export interface ApiConfig {
  bind_addr: string;
  api_key?: string;
  password_hash?: string;
}

export interface BlocklistConfig {
  enabled?: boolean;
  decision_cache_size?: number;
  lists?: SubscriptionList[];
  wildcard_block?: string[];
  whitelist?: string[];
  client_bypass?: string[];
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
  web_dir?: string;
  debug_logging?: boolean;
}

/** Only runtime-patchable fields */
export interface PatchSettingsBody {
  api_key?: string | null;
  password?: string | null;
  dns_min_ttl?: number;
  dns_max_ttl?: number;
  dns_log_ignore?: string[];
  web_dir?: string | null;
  log_retention_days?: number;
  blocklist_enabled?: boolean;
  blocklist_client_bypass?: string[];
  debug_logging?: boolean;
  dns_bind_addr?: string;
  dns_cache_size?: number;
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
  pattern: string;
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
