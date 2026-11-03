/**
 * Every block and setting the command palette can jump to.
 *
 * `key` is the i18n key the page renders the label with, so the palette shows
 * the same words and finds the same element: settings rows, panels and
 * section labels carry their label in `data-search`. `tab` opens the right
 * tab through `?tab=`; `parent` names the panel or tab for the breadcrumb;
 * `words` are extra English search terms — the names people know a feature
 * by (rate limit, ntfy, Pi-hole) — matched beside the translated label.
 */
export interface SectionEntry {
  key: string;
  page: string;
  tab?: string;
  parent?: string;
  words?: string;
}

const S = "/settings";

export const SECTIONS: SectionEntry[] = [
  // ── Settings · General ──────────────────────────────────────────────────────
  { key: "settings.general", page: S, tab: "general", words: "ttl cache storage logging" },
  {
    key: "settings.min_ttl",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "ttl minimum cache",
  },
  {
    key: "settings.max_ttl",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "ttl maximum cache",
  },
  {
    key: "settings.client_ttl",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "ttl devices cache",
  },
  {
    key: "settings.serve_stale",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "optimistic cache stale expired serve",
  },
  {
    key: "settings.log_retention",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "query log days keep history retention",
  },
  {
    key: "settings.storage_backend",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "sqlite memory query log storage",
  },
  {
    key: "settings.storage_path",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "database location disk ram tmpfs",
  },
  {
    key: "settings.blocklist_cache_dir",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "blocklist cache location disk",
  },
  {
    key: "settings.log_max_mb",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "log size cap megabytes",
  },
  {
    key: "settings.web_dir",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "web ui directory assets",
  },
  {
    key: "settings.blocking_enabled",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "blocklist filtering master switch on off",
  },
  {
    key: "settings.block_response",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "nxdomain nodata 0.0.0.0 refused blocked answer",
  },
  {
    key: "settings.debug_logging",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "debug verbose logs",
  },
  {
    key: "settings.log_ignore",
    page: S,
    tab: "general",
    parent: "settings.general",
    words: "ignore hide patterns arpa local",
  },
  { key: "settings.privacy", page: S, tab: "general", words: "privacy recording" },
  {
    key: "settings.log_queries",
    page: S,
    tab: "general",
    parent: "settings.privacy",
    words: "query log record privacy",
  },
  {
    key: "settings.keep_stats",
    page: S,
    tab: "general",
    parent: "settings.privacy",
    words: "statistics stats record privacy",
  },
  {
    key: "settings.purge_data",
    page: S,
    tab: "general",
    parent: "settings.privacy",
    words: "delete stored data wipe history purge",
  },

  // ── Settings · Resolvers, network, panel ────────────────────────────────────
  {
    key: "settings.upstream_resolvers",
    page: S,
    tab: "resolvers",
    words: "upstream doh dot dns servers cloudflare google quad9",
  },
  {
    key: "settings.zone_routing",
    page: S,
    tab: "resolvers",
    words: "zones forward conditional reverse ptr local domain",
  },
  {
    key: "settings.resolver",
    page: S,
    tab: "network",
    words: "resolver dnssec ecs canary private relay ech doh bypass",
  },
  {
    key: "settings.dns_firefox_canary",
    page: S,
    tab: "network",
    parent: "settings.resolver",
    words: "firefox doh canary bypass dns over https",
  },
  {
    key: "settings.dns_block_private_relay",
    page: S,
    tab: "network",
    parent: "settings.resolver",
    words: "icloud private relay apple safari iphone mask",
  },
  {
    key: "settings.dns_strip_ech",
    page: S,
    tab: "network",
    parent: "settings.resolver",
    words: "ech encrypted client hello sni tls",
  },
  { key: "settings.network", page: S, tab: "network", words: "network listen bind" },
  {
    key: "settings.dns_bind",
    page: S,
    tab: "network",
    parent: "settings.network",
    words: "listen port 53 bind address",
  },
  {
    key: "settings.cache_size",
    page: S,
    tab: "network",
    parent: "settings.network",
    words: "cache entries size",
  },
  {
    key: "settings.dns_dnssec",
    page: S,
    tab: "network",
    parent: "settings.resolver",
    words: "dnssec validation",
  },
  {
    key: "settings.dns_strip_ecs",
    page: S,
    tab: "network",
    parent: "settings.resolver",
    words: "ecs edns client subnet privacy",
  },
  {
    key: "settings.blocklist_cache_size",
    page: S,
    tab: "network",
    parent: "settings.network",
    words: "blocklist cache size",
  },
  {
    key: "settings.api_bind",
    page: S,
    tab: "network",
    parent: "settings.network",
    words: "panel port listen http 80 api",
  },
  { key: "settings.panel", page: S, tab: "panel", words: "panel shortcut domain fe.te" },
  {
    key: "settings.panel_enabled",
    page: S,
    tab: "panel",
    parent: "settings.panel",
    words: "panel shortcut record",
  },
  {
    key: "settings.panel_domain",
    page: S,
    tab: "panel",
    parent: "settings.panel",
    words: "panel domain name",
  },
  {
    key: "settings.panel_ipv4",
    page: S,
    tab: "panel",
    parent: "settings.panel",
    words: "panel ip address",
  },
  {
    key: "settings.panel_url",
    page: S,
    tab: "panel",
    parent: "settings.panel",
    words: "panel url link",
  },

  // ── Settings · Access ───────────────────────────────────────────────────────
  { key: "settings.access", page: S, tab: "access", words: "security password api key login" },
  {
    key: "settings.api_key",
    page: S,
    tab: "access",
    parent: "settings.access",
    words: "token api key bearer",
  },
  {
    key: "settings.password",
    page: S,
    tab: "access",
    parent: "settings.access",
    words: "password login sign in",
  },
  {
    key: "settings.dns_clients",
    page: S,
    tab: "access",
    words: "acl allow deny clients cidr rate limit who",
  },
  {
    key: "settings.rate_limit",
    page: S,
    tab: "access",
    parent: "settings.dns_clients",
    words: "rate limit queries per minute flood",
  },
  {
    key: "settings.allowed_clients",
    page: S,
    tab: "access",
    parent: "settings.dns_clients",
    words: "allow acl cidr only answer",
  },
  {
    key: "settings.denied_clients",
    page: S,
    tab: "access",
    parent: "settings.dns_clients",
    words: "deny block acl cidr never",
  },
  {
    key: "sessions.title",
    page: S,
    tab: "access",
    words: "sessions browsers sign out logged in devices",
  },
  { key: "mcp.title", page: S, tab: "access", words: "mcp claude ai assistant agent" },

  // ── Settings · Notifications, system ────────────────────────────────────────
  {
    key: "notifications.title",
    page: S,
    tab: "notifications",
    words: "notifications webhook ntfy telegram discord slack gotify alerts",
  },
  {
    key: "notifications.webhook",
    page: S,
    tab: "notifications",
    parent: "notifications.title",
    words: "webhook url",
  },
  {
    key: "notifications.tunnel_alerts",
    page: S,
    tab: "notifications",
    parent: "notifications.title",
    words: "tunnel alerts down",
  },
  {
    key: "notifications.new_device",
    page: S,
    tab: "notifications",
    parent: "notifications.title",
    words: "new device joined alert",
  },
  { key: "settings.updates", page: S, tab: "system", words: "update upgrade version release" },
  { key: "backup.title", page: S, tab: "system", words: "backup restore export config download" },
  {
    key: "sync.title",
    page: S,
    tab: "system",
    words: "sync secondary primary replica follow two boxes",
  },
  {
    key: "import.title",
    page: S,
    tab: "system",
    words: "import pihole pi-hole adguard teleporter migrate move",
  },

  // ── Tunnels ─────────────────────────────────────────────────────────────────
  {
    key: "tunnels.general",
    page: "/tunnels",
    tab: "general",
    words: "selective routing proxy advertise",
  },
  {
    key: "tunnels.enabled",
    page: "/tunnels",
    tab: "general",
    parent: "tunnels.general",
    words: "selective routing enable",
  },
  {
    key: "tunnels.advertise_ipv4",
    page: "/tunnels",
    tab: "general",
    parent: "tunnels.general",
    words: "advertise ip address",
  },
  {
    key: "tunnels.max_connections",
    page: "/tunnels",
    tab: "general",
    parent: "tunnels.general",
    words: "connections limit",
  },
  {
    key: "tunnels.probe_target",
    page: "/tunnels",
    tab: "general",
    parent: "tunnels.general",
    words: "probe health check",
  },
  {
    key: "tunnels.alert_webhook",
    page: "/tunnels",
    tab: "general",
    parent: "tunnels.general",
    words: "alert webhook down",
  },
  {
    key: "tunnels.egresses",
    page: "/tunnels",
    tab: "egresses",
    words: "wireguard socks proxy egress vpn proton",
  },
  { key: "tunnels.rules", page: "/tunnels", tab: "rules", words: "routing rules domains services" },

  // ── Filtering ───────────────────────────────────────────────────────────────
  { key: "blocklist.quick_curate", page: "/blocklist", words: "quick add block allow" },
  {
    key: "services.title",
    page: "/blocklist",
    words: "services apps tiktok youtube netflix block",
  },
  {
    key: "safesearch.title",
    page: "/blocklist",
    words: "safesearch youtube restricted google bing",
  },
  {
    key: "blocklist.manual_rules",
    page: "/blocklist",
    words: "manual rules regex custom block allow whitelist blacklist",
  },

  // ── Devices, records, tools ─────────────────────────────────────────────────
  { key: "clients.manual_aliases", page: "/clients", words: "names aliases mac rename" },
  { key: "dns.add_or_update", page: "/dns", words: "add record a aaaa cname local dns" },
  {
    key: "tools.dns_lookup",
    page: "/tools",
    tab: "dns",
    words: "dig lookup resolve nslookup query",
  },
  { key: "tools.dnssec", page: "/tools", tab: "dns", words: "dnssec validate check" },
  {
    key: "tools.domain_check",
    page: "/tools",
    tab: "dns",
    words: "check why blocked explain domain",
  },
  { key: "tools.whois", page: "/tools", tab: "dns", words: "whois registrar owner" },
  {
    key: "tools.egress_check",
    page: "/tools",
    tab: "network",
    words: "egress tunnel test ip address",
  },
  { key: "tools.cert", page: "/tools", tab: "network", words: "tls certificate ssl https" },
  { key: "tools.tcp_probe", page: "/tools", tab: "network", words: "tcp port probe connect" },
];
