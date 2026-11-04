/**
 * The demo build's API: every request the panel makes is answered here, in
 * the browser, from anonymized sample data (the screenshot harness's
 * fixtures). Nothing leaves the page and nothing is kept. The query log and
 * the dashboard's feed keep moving, a pause counts down, and a change shows
 * a note that the demo doesn't save it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import blocklistBlacklist from "./data/blocklist-blacklist.json";
import blocklistCheck from "./data/blocklist-check.json";
import blocklistWhitelist from "./data/blocklist-whitelist.json";
import clientsAliases from "./data/clients-aliases.json";
import clientsData from "./data/clients.json";
import customRecords from "./data/custom-records.json";
import listsData from "./data/lists.json";
import logsData from "./data/logs.json";
import proxyData from "./data/proxy.json";
import queriesData from "./data/queries.json";
import servicesData from "./data/services.json";
import settingsData from "./data/settings.json";
import statsSummary from "./data/stats-summary.json";
import statsSystem from "./data/stats-system.json";
import statsTimeseries from "./data/stats-timeseries.json";
import statsTopBlocked from "./data/stats-top-blocked.json";
import statsTopClients from "./data/stats-top-clients.json";
import statsTopDomains from "./data/stats-top-domains.json";
import toolsDnssec from "./data/tools-dnssec.json";
import toolsResolve from "./data/tools-resolve.json";
import toolsWhois from "./data/tools-whois.json";

import { DEMO_WRITE_EVENT } from "./events";

type Json = any;

const copy = <T>(v: T): T => structuredClone(v);
const nowSecs = () => Math.floor(Date.now() / 1000);

const clientList = (): Json[] => (clientsData as Json).clients ?? [];
const fixtureQueries = (): Json[] =>
  Array.isArray(queriesData) ? (queriesData as Json[]) : ((queriesData as Json).queries ?? []);

// ── A query log that keeps moving ───────────────────────────────────────────
// The fixture is replayed: one more query every couple of seconds, taken in
// turn from the sample with a fresh id and time.

const START = Date.now();
const EVERY_MS = 2200;
const fixtureNewest = Math.max(...fixtureQueries().map((q) => Date.parse(q.timestamp)));
const fixtureTopId = Math.max(...fixtureQueries().map((q) => q.id));
const live: Json[] = []; // newest first

function catchUp() {
  const due = Math.floor((Date.now() - START) / EVERY_MS);
  const sample = fixtureQueries();
  while (live.length < due && sample.length > 0) {
    const n = live.length;
    const src =
      sample[(sample.length - 1 - ((n * 7) % sample.length) + sample.length) % sample.length];
    live.unshift({
      ...src,
      id: fixtureTopId + n + 1,
      timestamp: new Date(START + (n + 1) * EVERY_MS).toISOString(),
      latency_ms: src.status === "blocked" ? 0 : src.latency_ms,
    });
    if (live.length > 400) live.pop();
  }
}

/** The sample, moved so its newest entry was a few seconds before the demo opened. */
function shiftedFixture(): Json[] {
  const shift = START - 4000 - fixtureNewest;
  return fixtureQueries().map((q) => ({
    ...q,
    timestamp: new Date(Date.parse(q.timestamp) + shift).toISOString(),
  }));
}

function allQueries(): Json[] {
  catchUp();
  return [...live, ...shiftedFixture()];
}

// ── Pieces built from the sample (as the screenshot mock builds them) ────────

const byName = (...names: string[]) =>
  names
    .map((n) => clientList().find((c) => c.name === n))
    .filter(Boolean)
    .map((c: Json) => c.macs[0] ?? c.ips[0]);

function minuteOfWeek(d = new Date()) {
  return ((d.getDay() + 6) % 7) * 1440 + d.getHours() * 60 + d.getMinutes();
}

function utcOffset() {
  const m = -new Date().getTimezoneOffset();
  const sign = m >= 0 ? "+" : "-";
  const a = Math.abs(m);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

function profiles() {
  const base = {
    lists: [],
    block: [],
    allow: [],
    services: [],
    schedule: [],
    safe_search: false,
    youtube_restricted: "off",
    allowlists: [],
    default_deny: false,
  };
  const mow = minuteOfWeek();
  // School nights: Sun–Thu 21:30 → 07:00, judged on the visitor's clock.
  const day = Math.floor(mow / 1440); // 0 = Monday
  const min = mow % 1440;
  const evening = [6, 0, 1, 2, 3].includes(day) && min >= 21 * 60 + 30;
  const morning = [0, 1, 2, 3, 4].includes(day) && min < 7 * 60;
  return {
    profiles: [
      {
        ...base,
        id: "kids",
        name: "Kids",
        clients: byName("ipad-mini", "kindle-oasis"),
        services: ["tiktok", "roblox", "fortnite", "snapchat"],
        block: ["*.casino.example"],
        safe_search: true,
        youtube_restricted: "moderate",
      },
      {
        ...base,
        id: "school-nights",
        name: "School nights",
        clients: byName("switch-dock", "ps5-console"),
        services: ["youtube", "twitch", "discord"],
        schedule: [{ days: ["sun", "mon", "tue", "wed", "thu"], from: "21:30", to: "07:00" }],
      },
      {
        ...base,
        id: "iot",
        name: "IoT",
        clients: byName("robovac", "hue-bridge", "ring-doorbell", "ecobee-thermostat"),
        allow: ["*.meethue.com", "*.ring.com", "*.ecobee.com"],
        default_deny: true,
      },
    ],
    available_lists: ((listsData as Json).lists ?? []).map((l: Json) => l.name),
    available_allowlists: [],
    active: { kids: true, "school-nights": evening || morning, iot: true },
    clock: { minute_of_week: mow, utc_offset: utcOffset() },
  };
}

const CURATED_DAY: Record<string, [string, number, number][]> = {
  "ipad-mini": [
    ["www.youtube.com", 1840, 0],
    ["i.ytimg.com", 1210, 0],
    ["rr3---sn-4g5e6nsz.googlevideo.com", 960, 0],
    ["www.tiktok.com", 412, 412],
    ["v16-webapp.tiktok.com", 288, 288],
    ["roblox.com", 236, 236],
    ["apis.roblox.com", 174, 174],
    ["gateway.icloud.com", 151, 0],
    ["app-measurement.com", 133, 133],
    ["www.khanacademy.org", 129, 0],
    ["cdn.kastatic.org", 118, 0],
    ["googleads.g.doubleclick.net", 97, 97],
    ["mask.icloud.com", 90, 0],
  ],
};

function deviceStats(token: string) {
  const c = clientList().find((x) => x.macs.includes(token) || x.ips.includes(token));
  const mine = fixtureQueries().filter(
    (q) => q.device === token || (c && c.ips.includes(q.client_ip)),
  );
  const tally = new Map<string, Json>();
  for (const q of mine) {
    const t = tally.get(q.domain) ?? { domain: q.domain, total: 0, blocked: 0 };
    t.total += 1;
    if (q.status === "blocked") t.blocked += 1;
    tally.set(q.domain, t);
  }
  const curated: [string, number, number][] | undefined = c ? CURATED_DAY[c.name] : undefined;
  const rows: Json[] = curated
    ? curated.map(([domain, total, blocked]) => ({ domain, total, blocked }))
    : [...tally.values()];
  const top = [...rows].sort((a, b) => b.total - a.total || a.domain.localeCompare(b.domain));
  const topBlocked = rows
    .filter((r) => r.blocked > 0)
    .sort((a, b) => b.blocked - a.blocked || a.domain.localeCompare(b.domain));
  const catalog: Json[] = (servicesData as Json).services ?? [];
  const owner = (d: string) =>
    catalog.find((s) => s.domains.some((x: string) => d === x || d.endsWith("." + x)));
  const services = new Map<string, Json>();
  for (const r of rows) {
    const s = owner(r.domain);
    if (!s) continue;
    const u = services.get(s.id) ?? { id: s.id, name: s.name, queries: 0, blocked: 0 };
    u.queries += r.total;
    u.blocked += r.blocked;
    services.set(s.id, u);
  }
  const now = nowSecs();
  const end = Math.floor(now / 600) * 600;
  const perBucket = Math.max(4, Math.round((c?.total ?? 2000) / 400));
  const activity = Array.from({ length: 144 }, (_, i) => {
    const bucket = end - (143 - i) * 600;
    const hour = new Date(bucket * 1000).getHours();
    const day = hour >= 7 && hour <= 23 ? 1 : 0.25;
    const wave = 0.6 + 0.4 * Math.sin(i / 7) * Math.cos(i / 17);
    const total = Math.round(perBucket * day * wave * (0.8 + ((i * 37) % 11) / 25));
    return { bucket, total, blocked: Math.round(total * 0.12) };
  }).filter((a) => a.total > 0);
  return {
    device: token,
    name: c?.name ?? null,
    ips: c?.ips ?? [],
    mac: c?.macs[0] ?? null,
    total: c?.total ?? mine.length,
    blocked: c?.blocked ?? 0,
    last_seen: now - 40,
    first_seen: now - 86400 * 41,
    hours: 24,
    top_domains: top.slice(0, 10),
    top_blocked: topBlocked.slice(0, 10),
    services: [...services.values()].sort((a, b) => b.queries - a.queries),
    activity,
  };
}

function sessions() {
  const now = nowSecs();
  return [
    {
      id: "4b1f0c9a7e2d3a58",
      created: now - 86400 * 5,
      last_seen: now - 60 * 3,
      expires: now + 86400 * 7,
      agent: navigator.userAgent,
      ip: "192.168.1.94",
      device: "desktop-pc",
      current: true,
    },
    {
      id: "9c03aa51d0e4b712",
      created: now - 86400 * 2,
      last_seen: now - 3600 * 5,
      expires: now + 86400 * 7,
      agent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      ip: "192.168.1.114",
      device: "iphone-15",
      current: false,
    },
  ];
}

function proxyStats() {
  const doc: Json = proxyData;
  const cfg = doc?.proxy ?? doc ?? { egresses: [], rules: [] };
  const egresses: Record<string, Json> = {};
  cfg.egresses.forEach((e: Json, i: number) => {
    const hosts = cfg.rules
      .filter((r: Json) => r.egress === e.id && r.pattern)
      .map((r: Json, j: number) => ({
        host: r.pattern.replace(/^\*\./, "www."),
        conns: 140 - j * 31 - i * 17,
        bytes_up: (9 - j) * 3_100_000,
        bytes_down: (9 - j) * 184_000_000,
        last_seen_secs_ago: 12 + j * 40,
      }));
    egresses[e.id] = {
      healthy: true,
      active: 6 - i * 3,
      total_conns: 2140 - i * 900,
      bytes_up: 61_000_000 - i * 20_000_000,
      bytes_down: 3_900_000_000 - i * 1_500_000_000,
      connect_fails: i,
      fail_closed_drops: 0,
      handshake_age_secs: 47 + i * 30,
      backend: "kernel",
      down_since_secs: null,
      alerting: false,
      probe: { rtt_ms: 38 + i * 71, ok: true, last_probe_secs_ago: 9 },
      domains: hosts,
    };
  });
  const rules = cfg.rules.map((r: Json, i: number) => ({
    pattern: r.pattern || `service:${r.service}`,
    egress: r.egress,
    hits: 900 - i * 120,
  }));
  return { egresses, rules, max_buffer_kb: 4096 };
}

function freshSeries(series: Json) {
  if (!Array.isArray(series) || series.length === 0) return series;
  const last = Math.max(...series.map((b) => b.bucket));
  const shift = Math.floor(Date.now() / 1000 / 600) * 600 - last;
  return series.map((b) => ({ ...b, bucket: b.bucket + shift }));
}

function summary() {
  const d: Json = copy(statsSummary);
  for (const k of ["top_domains", "top_blocked", "top_clients"])
    if (Array.isArray(d[k])) d[k] = d[k].slice(0, 20);
  d.timeseries = freshSeries(d.timeseries);
  d.top_clients = d.top_clients.map((c: Json) => ({
    ...c,
    blocked: c.blocked ?? clientList().find((x) => x.name === c.name)?.blocked ?? 0,
  }));
  d.top_blocked_clients = clientList()
    .filter((c) => c.blocked > 0)
    .sort((a, b) => b.blocked - a.blocked)
    .slice(0, 20)
    .map(({ name, total, blocked, ips, macs }) => ({ name, total, blocked, ips, macs }));
  // The feed and the totals follow the replayed queries.
  const rows = allQueries();
  d.recent_domains = rows.slice(0, 20);
  d.recent_blocked = rows.filter((q) => q.status === "blocked").slice(0, 20);
  const extra = live.length;
  const extraBlocked = live.filter((q) => q.status === "blocked").length;
  const extraCached = live.filter((q) => q.status === "cached").length;
  d.total_queries += extra;
  d.blocked_queries += extraBlocked;
  d.cached_queries += extraCached;
  d.upstream_queries += extra - extraBlocked - extraCached;
  return d;
}

// ── Pausing works for real, within the page ─────────────────────────────────

let pausedUntil: number | null = null;
const pausedClients = new Map<string, number>();

function pauseState() {
  const now = nowSecs();
  if (pausedUntil != null && pausedUntil <= now) pausedUntil = null;
  for (const [k, until] of pausedClients) if (until <= now) pausedClients.delete(k);
  return {
    now,
    global_until: pausedUntil,
    clients: [...pausedClients].map(([key, until]) => ({ key, until })),
  };
}

// ── Routing ──────────────────────────────────────────────────────────────────

function get(path: string, qs: URLSearchParams): Json {
  const p = path;
  if (p === "/auth") return { authenticated: true, password_set: true };

  if (p === "/stats/summary") return summary();
  if (p === "/stats/system") return statsSystem;
  if (p === "/stats/timeseries") return freshSeries(copy(statsTimeseries));
  if (p === "/stats/top-clients") return statsTopClients;
  if (p === "/stats/top-domains") return statsTopDomains;
  if (p === "/stats/top-blocked") return statsTopBlocked;

  if (p === "/queries") {
    const rows = allQueries();
    const after = Number(qs.get("after_id") ?? 0);
    if (after > 0) return rows.filter((q) => q.id > after);
    const before = Number(qs.get("before_id") ?? 0);
    const domain = qs.get("domain");
    const status = qs.get("status");
    const device = qs.get("device")?.split(",") ?? [];
    const ip = qs.get("client_ip");
    const limit = Number(qs.get("limit") ?? 100);
    return rows
      .filter((q) => !before || q.id < before)
      .filter((q) => !domain || q.domain.includes(domain))
      .filter((q) => !status || q.status === status)
      .filter(
        (q) =>
          (device.length === 0 && !ip) || device.includes(q.device) || (ip && q.client_ip === ip),
      )
      .slice(0, limit);
  }

  if (p === "/clients") {
    // Last seen moves with the replay: the busiest devices were just active.
    const d: Json = copy(clientsData);
    const newest = Math.max(...d.clients.map((c: Json) => c.last_seen ?? 0));
    const shift = nowSecs() - 30 - newest;
    d.clients = d.clients.map((c: Json) => ({ ...c, last_seen: (c.last_seen ?? 0) + shift }));
    return d;
  }
  if (p === "/clients/aliases") return clientsAliases;
  {
    const m = p.match(/^\/clients\/([^/]+)\/stats$/);
    if (m) return deviceStats(decodeURIComponent(m[1]));
  }

  if (p === "/services") return servicesData;
  if (p === "/blocklist/profiles") return profiles();
  if (p === "/blocklist/services") return { services: ["tiktok", "temu"] };
  if (p === "/blocklist/safe-search") return { safe_search: true, youtube_restricted: "off" };
  if (p === "/blocking/pause") return pauseState();
  if (p === "/allowlists") return { lists: [] };

  if (p === "/notifications")
    return {
      webhook: "https://ntfy.sh/ferrite-home",
      format: "ntfy",
      tunnel_alerts: true,
      new_device: true,
    };
  if (p === "/settings/mcp") return { enabled: true, allow_changes: false };
  if (p === "/storage/locations") {
    const dir = "/var/lib/ferrite";
    return {
      backend: "sqlite",
      current: `${dir}/ferrite.db`,
      default: `${dir}/ferrite.db`,
      suggestions: [
        {
          dir,
          path: `${dir}/ferrite.db`,
          fstype: "ext4",
          ram_backed: false,
          current: true,
          available_bytes: 23_400_000_000,
        },
      ],
      blocklist_cache: { current: dir, default: dir, available_bytes: 23_400_000_000 },
    };
  }
  if (p === "/auth/sessions") return sessions();

  if (p === "/proxy") return proxyData;
  if (p === "/proxy/stats") return proxyStats();

  if (p.startsWith("/blocklist/check")) {
    const doc: Json = blocklistCheck;
    const asked = decodeURIComponent(p.split("/").pop() || "") || qs.get("domain");
    if (!doc || !asked) return doc;
    const seen = fixtureQueries().filter((q) => q.domain === asked);
    if (seen.length > 0 && !seen.some((q) => q.status === "blocked"))
      return { ...doc, domain: asked, blocked: false, sources: [], whitelisted: false };
    return {
      ...doc,
      domain: asked,
      sources: (doc.sources ?? []).map((s: Json) => ({ ...s, matched: asked })),
    };
  }
  if (p === "/blocklist/blacklist") return blocklistBlacklist;
  if (p === "/blocklist/whitelist") return blocklistWhitelist;
  if (p === "/lists") return listsData;

  if (p.startsWith("/tools/resolve")) return toolsResolve;
  if (p.startsWith("/tools/whois")) return toolsWhois;
  if (p.startsWith("/tools/dnssec")) return toolsDnssec;

  if (p === "/settings") return settingsData;
  if (p === "/custom-records") return customRecords;
  if (p === "/logs") {
    const after = Number(qs.get("after_id") ?? 0);
    const logs: Json[] = (logsData as Json).logs ?? [];
    return { logs: after > 0 ? logs.filter((e) => e.id > after) : logs };
  }
  if (p.startsWith("/update"))
    return {
      // The raw server shape — the API client turns it into server/web rows.
      current_server_version: "0.2.0",
      current_web_version: "0.2.0",
      server_update: null,
      web_update: null,
      incompatible_web_update: null,
      checked_at: Math.floor(Date.now() / 1000) - 3600,
      stale: false,
      check_pending: false,
      last_error: null,
    };
  if (p === "/secure-dns") return secureView();
  if (p === "/dhcp") return dhcpView();
  if (p === "/dhcp/leases") return dhcpLeases();
  if (p === "/sync")
    return {
      primary: "",
      api_key_set: false,
      interval: 300,
      sections: ["filtering", "records", "devices", "dns"],
      status: { last_attempt: null, last_ok: null, last_change: null, changed: [], error: null },
    };
  return {};
}

// ── DHCP ── a running server on the demo network.
let dhcpCfg: Json = {
  dhcp: {
    enabled: true,
    subnet_mask: "255.255.255.0",
    pool_start: "192.168.1.100",
    pool_end: "192.168.1.199",
    domain: "lan",
    lease_secs: 86400,
    reservations: [
      { mac: "02:4e:1a:7c:00:02", ip: "192.168.1.2", name: "hue-bridge" },
      { mac: "02:4e:1a:7c:00:32", ip: "192.168.1.50", name: "ipad-mini" },
      { mac: "02:4e:1a:7c:00:4d", ip: "192.168.1.77", name: "macbook-air-m2" },
    ],
  },
  ra: { enabled: false, rdnss_lifetime: 1800, interval_secs: 200 },
};
const DHCP_LEASES: [string, string, string | null, number, boolean][] = [
  ["192.168.1.2", "02:4e:1a:7c:00:02", "Philips-hue", 20, true],
  ["192.168.1.50", "02:4e:1a:7c:00:32", "iPad", 7, true],
  ["192.168.1.77", "02:4e:1a:7c:00:4d", "MacBook-Air", 15, true],
  ["192.168.1.106", "02:4e:1a:7c:00:6a", "LG-webOS-TV", 11, false],
  ["192.168.1.112", "02:4e:1a:7c:00:70", "kindle-a1b2", 3, false],
  ["192.168.1.114", "02:4e:1a:7c:00:72", "Pixel-8-Pro", 22, false],
  ["192.168.1.147", "02:4e:1a:7c:00:93", "SHIELD", 18, false],
  ["192.168.1.155", "02:4e:1a:7c:00:9b", null, 9, false],
];
function dhcpView(): Json {
  const d = dhcpCfg.dhcp;
  return {
    ...dhcpCfg,
    status: {
      running: d.enabled,
      error: null,
      server_ip: d.enabled ? d.server_ip || "192.168.1.10" : null,
      gateway: d.enabled ? d.gateway || "192.168.1.1" : null,
      dns: d.enabled ? (d.dns && d.dns.length ? d.dns : ["192.168.1.10"]) : [],
      domain: d.domain || "lan",
      ra_running: dhcpCfg.ra.enabled,
      ra_error: null,
      ra_interface: dhcpCfg.ra.enabled ? dhcpCfg.ra.interface || "eth0" : null,
      ra_rdnss: dhcpCfg.ra.enabled ? ["fd00::10"] : [],
    },
    detected: {
      server_ip: "192.168.1.10",
      subnet_mask: "255.255.255.0",
      gateway: "192.168.1.1",
      interface: "eth0",
      ipv6: ["fd00::10", "2a02:8000:1::10"],
    },
  };
}
function dhcpLeases(): Json {
  if (!dhcpCfg.dhcp.enabled) return { leases: [], now: Math.floor(Date.now() / 1000) };
  const now = Math.floor(Date.now() / 1000);
  return {
    now,
    leases: DHCP_LEASES.map(([ip, mac, hostname, hours, reserved]) => ({
      ip,
      mac,
      hostname,
      expires_at: now + hours * 3600,
      reserved,
    })),
  };
}

// ── Encrypted DNS ── serving DoT and DoH for a name of the operator's.
let secureCfg: Json = {
  enabled: true,
  hostname: "dns.example.net",
  certificate: "letsencrypt",
  acme: { email: "me@example.net" },
  dot_port: 853,
  doh_port: 443,
};
let secureToken = true;
function secureView(): Json {
  const c = secureCfg;
  const on = c.enabled && !!c.hostname;
  return {
    config: c,
    token_set: secureToken,
    status: {
      running: on,
      error:
        c.enabled && !c.hostname ? "set the name devices connect to, like dns.example.com" : null,
      dot: on && c.dot_port !== 0,
      doh: on && c.doh_port !== 0,
      dot_error: null,
      doh_error: null,
      dot_shared: false,
      // Tunnels listen on 443 in the demo: DNS over HTTPS shares it.
      doh_shared: on && c.doh_port === 443,
      cert: on
        ? {
            names: [c.hostname, `*.${c.hostname}`],
            issuer: "Let's Encrypt",
            not_before: Math.floor(Date.now() / 1000) - 29 * 86400,
            not_after: Math.floor(Date.now() / 1000) + 61 * 86400,
          }
        : null,
      cert_warning: null,
      acme:
        on && c.certificate === "letsencrypt"
          ? {
              state: "ok",
              step: null,
              error: null,
              next: Math.floor(Date.now() / 1000) + 31 * 86400,
            }
          : null,
    },
    setup: {
      dot_host: c.hostname && c.dot_port ? c.hostname : null,
      dot_port: c.dot_port,
      doh_url:
        c.hostname && c.doh_port
          ? c.doh_port === 443
            ? `https://${c.hostname}/dns-query`
            : `https://${c.hostname}:${c.doh_port}/dns-query`
          : null,
    },
  };
}

function write(method: string, path: string, body: Json): Json {
  if (path === "/auth" || path === "/auth/login") return { token: "demo", expires_in: 86400 };
  if (path === "/secure-dns/renew") return secureView();
  if (path === "/secure-dns" && method === "PUT") {
    const acme = { ...(body.acme as Json) };
    if (acme.cloudflare_token) secureToken = true;
    delete acme.cloudflare_token;
    secureCfg = { ...secureCfg, ...body, acme };
    return secureView();
  }
  if (path === "/dhcp" && method === "PUT") {
    dhcpCfg = { dhcp: body?.dhcp ?? dhcpCfg.dhcp, ra: body?.ra ?? dhcpCfg.ra };
    return dhcpView();
  }
  if (path === "/blocking/pause") {
    const until = nowSecs() + Number(body?.minutes ?? 5) * 60;
    const clients: string[] = body?.clients ?? [];
    if (clients.length === 0) pausedUntil = until;
    else for (const c of clients) pausedClients.set(c, until);
    return pauseState();
  }
  if (path === "/blocking/resume") {
    const clients: string[] = body?.clients ?? [];
    if (clients.length === 0) pausedUntil = null;
    else for (const c of clients) pausedClients.delete(c);
    return pauseState();
  }
  window.dispatchEvent(new CustomEvent(DEMO_WRITE_EVENT, { detail: { method, path } }));
  // Hand back what a read of the same thing would, so the page stays whole.
  const read = get(path.split("?")[0], new URLSearchParams(path.split("?")[1] ?? ""));
  return read && Object.keys(read).length > 0 ? copy(read) : (body ?? {});
}

export async function demoRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  // A beat of latency, so loading states look like they do on a real box.
  await new Promise((r) => setTimeout(r, 60 + Math.random() * 120));
  const [pathname, search = ""] = path.split("?");
  if (method === "GET") return copy(get(pathname, new URLSearchParams(search)));
  return write(method, pathname + (search ? `?${search}` : ""), body);
}
