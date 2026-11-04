import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRowKeys } from "@/hooks/use-row-keys";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import {
  Plus,
  Trash2,
  Save,
  Waypoints,
  ChevronRight,
  Check,
  Pencil,
  Users,
  RefreshCw,
  Search,
  Cable,
  ListFilter,
  ArrowDownUp,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { fmt, formatBytes } from "@/lib/format";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  SettingsPanel,
  SettingRow,
  StatusTile,
  StatusBadge,
} from "@/components/layout/SettingsPanel";
import { Spinner } from "@/components/feedback/Spinner";
import { Err } from "@/components/feedback/Err";
import {
  Input,
  SearchInput,
  Select,
  Switch,
  Btn,
  IconBtn,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { usePageVisible } from "@/hooks/use-page-visible";
import { deviceTokens } from "@/api/clients";
import { DevicePicker } from "@/components/DevicePicker";
import { useTabParam } from "@/hooks/use-tab-param";
import { ServiceIcon } from "@/components/ServicePicker";
import type {
  ClientEntry,
  EgressKind,
  EgressProbe,
  EgressStats,
  ProxyConfig,
  ProxyEgress,
  ProxyRule,
  ProxyStatsResponse,
  ServiceCatalog,
} from "@/api/types";
import { Segmented } from "@/components/ui/segmented";
import { Tag } from "@/components/feedback/Badge";
import { RuleCompanions } from "@/components/RuleCompanions";

const KINDS: EgressKind[] = ["direct", "socks5", "wireguard", "evasion"];

/** A rule's identity in the server's hit counters: its pattern, or
 *  `service:<id>` for a service rule. */
const ruleKey = (r: ProxyRule) => (r.service != null ? `service:${r.service}` : r.pattern);

/** Shared grid template so the rules header and every rule row line up (from
 *  `sm` up — a phone stacks each rule as a small card instead). */
const RULE_COLS = "sm:grid-cols-[minmax(0,1fr)_10rem_9rem_5rem_3.5rem_3.75rem]";

/** One colour per egress, by position, so a long rule list groups by tunnel at
 *  a glance. */
const EGRESS_TONES = [
  "border-upstream/30 bg-upstream/8 text-upstream",
  "border-routed/30 bg-routed/8 text-routed",
  "border-ember/30 bg-ember/8 text-ember",
  "border-cached/30 bg-cached/8 text-cached",
  "border-warn/30 bg-warn/8 text-warn",
];

/** Per-egress ↑/↓ throughput (bytes/sec), derived from deltas between polls. */
type Rates = Record<string, { up: number; down: number }>;

/** "1.2 MB/s" for a bytes-per-second figure. */
const fmtRate = (bps: number) => `${formatBytes(Math.round(bps))}/s`;

/** Compact "12s / 3m / 2h ago"-style age. */
const fmtAge = (secs: number) => {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
};

/** Rounded Mbit/s a TCP window of `kb` KiB sustains over `rttMs` round-trip
 *  (throughput ≈ window / RTT). Drives the buffer-size speed calculator. */
const mbit = (kb: number, rttMs: number) =>
  Math.round((kb * 1024 * 8) / (rttMs / 1000) / 1_000_000);

/** Rough concurrent-download count the egress's SINGLE shared UDP buffer must
 *  hold at once. Used to flag a per-conn buffer whose aggregate (buffer × this)
 *  exceeds the kernel limit — the real cause of media stalling on big buffers. */
const PARALLEL_CONNS = 8;

// Mirror the server's per-egress UDP recv-buffer target (see
// proxy::egress::wireguard): per-conn buffer × concurrency, floored at 8 MiB and
// capped at 32 MiB. The kernel clamps SO_RCVBUF to net.core.rmem_max, so this is
// the rmem_max a WireGuard egress actually needs — recommending less under-serves
// the tunnel's own request.
const wantBytes = (bufKb: number) =>
  Math.min(Math.max(bufKb * 1024 * PARALLEL_CONNS, 8 * 1024 * 1024), 32 * 1024 * 1024);

/** Slugify a display name into a stable egress id (the key rules reference). */
const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const EMPTY: ProxyConfig = {
  enabled: false,
  http_port: 80,
  https_port: 443,
  advertise_ipv4: null,
  advertise_ipv6: null,
  max_connections: 128,
  probe_target: null,
  egresses: [],
  rules: [],
};

export default function Tunnels() {
  const { t } = useTranslation();
  const toast = useToast();
  const [tab, setTab] = useTabParam("rules");

  const [cfg, setCfg] = useState<ProxyConfig>(EMPTY);
  // Snapshot of the last loaded config; the sticky save bar shows only when the
  // draft drifts from it, and Reset restores it without a round-trip.
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(EMPTY));
  const [health, setHealth] = useState<Record<string, "up" | "down">>({});
  const [stats, setStats] = useState<ProxyStatsResponse | null>(null);
  const [rates, setRates] = useState<Rates>({});
  // Last poll's cumulative byte counters, for rate-from-delta computation.
  const prevSample = useRef<{
    t: number;
    bytes: Record<string, { up: number; down: number }>;
  } | null>(null);
  const [maxBuf, setMaxBuf] = useState<number | null>(null);
  const [awayFound, setAwayFound] = useState<string | null>(null);
  const [knownClients, setKnownClients] = useState<ClientEntry[]>([]);
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  // Both lists are edited and deleted by index, so their rows carry identity of
  // their own — see `useRowKeys`. The expanded rule is tracked by that key too.
  const egressKeys = useRowKeys(cfg.egresses.length);
  const ruleKeys = useRowKeys(cfg.rules.length);
  const [openRule, setOpenRule] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [egressFilter, setEgressFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    return api
      .getProxy()
      .then((d) => {
        setCfg(d.proxy);
        egressKeys.reset(d.proxy.egresses.length);
        ruleKeys.reset(d.proxy.rules.length);
        setSavedJson(JSON.stringify(d.proxy));
        setHealth(d.egress_health ?? {});
        setMaxBuf(d.max_buffer_kb ?? null);
        setAwayFound(
          [d.away_address?.ipv4, d.away_address?.ipv6].filter(Boolean).join(", ") || null,
        );
        setErr("");
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [, egressKeys, ruleKeys]);

  useEffect(() => {
    void load();
  }, [load]);

  // Known clients populate the per-rule device picker (same source as the query
  // log's device filter). Best-effort: an empty list just means "All devices".
  useEffect(() => {
    api
      .clients(200)
      .then((r) => setKnownClients(r.clients))
      .catch(() => {});
    api
      .serviceCatalog()
      .then(setCatalog)
      .catch(() => {});
  }, []);

  const serviceById = useMemo(
    () => new Map((catalog?.services ?? []).map((s) => [s.id, s])),
    [catalog],
  );

  // Refresh egress health + traffic stats on a timer WITHOUT clobbering the
  // user's unsaved edits: update only `health`/`stats`, never `cfg`. A WireGuard
  // egress flips to "up" a few seconds after save once its handshake completes,
  // so a one-shot reload would otherwise show a stale "down" until a manual page
  // refresh. Rates are cumulative-counter deltas between consecutive polls.
  const visible = usePageVisible();
  useEffect(() => {
    if (!visible) return;
    const poll = () =>
      api
        .proxyStats()
        .then((d) => {
          setStats(d);
          setMaxBuf(d.max_buffer_kb ?? null);
          setHealth(
            Object.fromEntries(
              Object.entries(d.egresses).map(([id, s]) => [id, s.healthy ? "up" : "down"]),
            ),
          );
          const now = Date.now();
          const prev = prevSample.current;
          if (prev && now > prev.t) {
            const dt = (now - prev.t) / 1000;
            setRates(
              Object.fromEntries(
                Object.entries(d.egresses).flatMap(([id, s]) => {
                  const p = prev.bytes[id];
                  // max(0, …): a counter reset (egress deleted+recreated) must
                  // not flash a huge negative-wrapped rate.
                  return p
                    ? [
                        [
                          id,
                          {
                            up: Math.max(0, s.bytes_up - p.up) / dt,
                            down: Math.max(0, s.bytes_down - p.down) / dt,
                          },
                        ],
                      ]
                    : [];
                }),
              ),
            );
          }
          prevSample.current = {
            t: now,
            bytes: Object.fromEntries(
              Object.entries(d.egresses).map(([id, s]) => [
                id,
                { up: s.bytes_up, down: s.bytes_down },
              ]),
            ),
          };
        })
        .catch(() => {});
    poll(); // first sample right away; rates appear from the second poll
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [visible]);

  // ── Mutators (edit a local draft; Save persists the whole config) ──
  const setField = <K extends keyof ProxyConfig>(key: K, value: ProxyConfig[K]) =>
    setCfg((c) => ({ ...c, [key]: value }));

  const updateEgress = (i: number, patch: Partial<ProxyEgress>) =>
    setCfg((c) => ({
      ...c,
      egresses: c.egresses.map((e, idx) => (idx === i ? { ...e, ...patch } : e)),
    }));

  // Rename: the id (machine name rules reference) is auto-derived from the display
  // name. Cascade the new id into any rules pointing at the old one so renaming
  // never orphans a rule.
  const renameEgress = (i: number, name: string) =>
    setCfg((c) => {
      const oldId = c.egresses[i].id;
      const id = slug(name);
      return {
        ...c,
        egresses: c.egresses.map((e, idx) => (idx === i ? { ...e, name, id } : e)),
        rules: c.rules.map((r) => (r.egress === oldId ? { ...r, egress: id } : r)),
      };
    });

  const addEgress = () => {
    egressKeys.add();
    setCfg((c) => ({
      ...c,
      egresses: [...c.egresses, { id: "", name: "", enabled: true, kind: "direct" }],
    }));
  };

  const removeEgress = (i: number) => {
    egressKeys.remove(i);
    setCfg((c) => ({ ...c, egresses: c.egresses.filter((_, idx) => idx !== i) }));
  };

  // Toggle a whole device in/out of a rule's scope. A device contributes all its
  // tokens (MAC(s) preferred, else IP(s)) so it matches across every IP it uses;
  // the server matches a rule when ANY listed token equals the client's IP/MAC.
  const toggleDevice = (i: number, c: ClientEntry) => {
    const tokens = deviceTokens(c).map((x) => x.toLowerCase());
    setCfg((cfg) => ({
      ...cfg,
      rules: cfg.rules.map((r, idx) => {
        if (idx !== i) return r;
        const cur = (r.clients ?? []).map((x) => x.toLowerCase());
        const on = tokens.some((tok) => cur.includes(tok));
        const next = on
          ? cur.filter((x) => !tokens.includes(x))
          : [...cur, ...tokens.filter((tok) => !cur.includes(tok))];
        return { ...r, clients: next };
      }),
    }));
  };

  const updateRule = (i: number, patch: Partial<ProxyRule>) =>
    setCfg((c) => ({
      ...c,
      rules: c.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));

  // Clear filters when adding so the new (blank) rule is never hidden behind an
  // active search or egress filter.
  const addRule = () => {
    setFilter("");
    setEgressFilter("");
    ruleKeys.add();
    setOpenRule(ruleKeys.keyAt(cfg.rules.length));
    setCfg((c) => ({
      ...c,
      rules: [
        ...c.rules,
        { pattern: "", egress: c.egresses[0]?.id ?? "", fail_closed: true, clients: [] },
      ],
    }));
  };

  const removeRule = (i: number) => {
    ruleKeys.remove(i);
    setCfg((c) => ({ ...c, rules: c.rules.filter((_, idx) => idx !== i) }));
  };

  function reset() {
    const restored = JSON.parse(savedJson) as ProxyConfig;
    setCfg(restored);
    egressKeys.reset(restored.egresses.length);
    ruleKeys.reset(restored.rules.length);
    setOpenRule(null);
  }

  /** Rules for what a routed site pulls in, on its own rule's tunnel; saved
   *  at once (the panel only offers it with nothing else pending). */
  async function addCompanions(rule: ProxyRule, sites: string[]) {
    const taken = new Set(cfg.rules.map((x) => x.pattern));
    const add = sites
      .filter((p) => !taken.has(p))
      .map((pattern) => ({
        pattern,
        egress: rule.egress,
        fail_closed: rule.fail_closed,
        clients: rule.clients ?? [],
      }));
    if (add.length === 0) return;
    try {
      await api.putProxy({ ...cfg, rules: [...cfg.rules, ...add] });
      toast(
        t("tunnels.companions_added", {
          count: add.length,
          defaultValue: "Added to the tunnel: {{count}}",
        }),
      );
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await api.putProxy(cfg);
      toast(t("tunnels.saved", { defaultValue: "Saved" }));
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

  const dirty = savedJson !== JSON.stringify(cfg);

  const egressName = useCallback(
    (id: string) => cfg.egresses.find((e) => e.id === id)?.name || id,
    [cfg.egresses],
  );

  // Health is meaningful only for enabled egresses; counting disabled ones as
  // "down" would raise a false alarm in the overview tile.
  const enabledEgresses = cfg.egresses.filter((e) => e.enabled);
  const egressUp = enabledEgresses.filter((e) => health[e.id] === "up").length;

  // Overview traffic figures, summed across every egress.
  const traffic = useMemo(() => {
    const all = Object.values(stats?.egresses ?? {});
    const rate = Object.values(rates);
    return {
      total: all.reduce((n, s) => n + s.bytes_up + s.bytes_down, 0),
      active: all.reduce((n, s) => n + s.active, 0),
      up: rate.reduce((n, r) => n + r.up, 0),
      down: rate.reduce((n, r) => n + r.down, 0),
    };
  }, [stats, rates]);

  const egressTone = useCallback(
    (id: string) => {
      const idx = cfg.egresses.findIndex((e) => e.id === id);
      return idx < 0 ? "border-bdr text-muted" : EGRESS_TONES[idx % EGRESS_TONES.length];
    },
    [cfg.egresses],
  );

  const hitsHint = t("tunnels.col_hits_hint", {
    defaultValue: "Connections routed by this rule since ferrite started.",
  });

  // Rule hit counters keyed the same way the server reports them.
  const ruleHits = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of stats?.rules ?? []) m.set(`${r.pattern}\u0001${r.egress}`, r.hits);
    return m;
  }, [stats]);

  const filteredRules = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return cfg.rules
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !egressFilter || r.egress === egressFilter)
      .filter(
        ({ r }) =>
          !q ||
          r.pattern.toLowerCase().includes(q) ||
          (r.service != null &&
            (serviceById.get(r.service)?.name ?? r.service).toLowerCase().includes(q)) ||
          egressName(r.egress).toLowerCase().includes(q),
      );
  }, [cfg.rules, filter, egressFilter, egressName, serviceById]);

  return (
    <PageContainer>
      <PageHeader
        title={t("tunnels.title", { defaultValue: "Tunnels" })}
        subtitle={t("tunnels.subtitle", {
          defaultValue:
            "Route chosen domains through a tunnel or proxy. Matching domains resolve to ferrite, which forwards them through the selected egress.",
        })}
        action={
          <Btn variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {t("common.refresh", { defaultValue: "Refresh" })}
          </Btn>
        }
      />
      {err && <Err msg={err} />}

      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {/* ── Overview ── */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatusTile
              icon={Waypoints}
              label={t("tunnels.tile_routing", { defaultValue: "Routing" })}
              value={
                cfg.enabled
                  ? t("common.enabled", { defaultValue: "Enabled" })
                  : t("common.disabled", { defaultValue: "Disabled" })
              }
              sub={t("tunnels.tile_routing_sub", { defaultValue: "selective routing" })}
              tone={cfg.enabled ? "ember" : "muted"}
            />
            <StatusTile
              icon={Cable}
              label={t("tunnels.egresses", { defaultValue: "Egresses" })}
              value={`${egressUp}/${enabledEgresses.length}`}
              sub={t("tunnels.tile_egresses_sub", { defaultValue: "enabled · healthy" })}
              tone="upstream"
            />
            <StatusTile
              icon={ListFilter}
              label={t("tunnels.rules", { defaultValue: "Rules" })}
              value={cfg.rules.length}
              sub={t("tunnels.tile_rules_sub", { defaultValue: "domains and services" })}
            />
            <StatusTile
              icon={ArrowDownUp}
              label={t("tunnels.tile_traffic", { defaultValue: "Traffic" })}
              value={formatBytes(traffic.total)}
              sub={`↓ ${fmtRate(traffic.down)} · ↑ ${fmtRate(traffic.up)} · ${traffic.active} ${t(
                "tunnels.stats_active",
                { defaultValue: "active" },
              )}`}
              tone="muted"
            />
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="general">
                {t("tunnels.general", { defaultValue: "General" })}
              </TabsTrigger>
              <TabsTrigger value="egresses">
                {t("tunnels.egresses", { defaultValue: "Egresses" })} · {cfg.egresses.length}
              </TabsTrigger>
              <TabsTrigger value="rules">
                {t("tunnels.rules", { defaultValue: "Rules" })} · {cfg.rules.length}
              </TabsTrigger>
            </TabsList>

            {/* ── General ── */}
            <TabsContent value="general" className="space-y-4 pt-4">
              <SettingsPanel
                title={t("tunnels.general", { defaultValue: "General" })}
                sub={t("tunnels.general_sub", {
                  defaultValue: "Master switch and how ferrite advertises itself to matching clients.",
                })}
                icon={SlidersHorizontal}
                badge={
                  <StatusBadge
                    set={cfg.enabled}
                    labelSet={t("common.enabled", { defaultValue: "Enabled" })}
                    labelUnset={t("common.disabled", { defaultValue: "Disabled" })}
                  />
                }
              >
                <SettingRow
                  label={t("tunnels.enabled", { defaultValue: "Enable selective routing" })}
                  sub={t("tunnels.enabled_sub", {
                    defaultValue:
                      "Route matching domains through a tunnel; everything else resolves normally.",
                  })}
                >
                  <Switch checked={cfg.enabled} onCheckedChange={(v) => setField("enabled", v)} />
                </SettingRow>
                <SettingRow
                  label={t("tunnels.advertise_ipv4", { defaultValue: "Advertise IPv4" })}
                  sub={t("tunnels.advertise_ipv4_sub", {
                    defaultValue:
                      "IPv4 that matching domains resolve to. Blank auto-detects this box's address.",
                  })}
                >
                  <Input
                    value={cfg.advertise_ipv4 ?? ""}
                    onChange={(e) => setField("advertise_ipv4", e.target.value || null)}
                    placeholder={t("tunnels.auto", { defaultValue: "auto-detect" })}
                    className="w-full font-mono"
                  />
                </SettingRow>
                <SettingRow
                  label={t("tunnels.advertise_ipv6", { defaultValue: "Advertise IPv6" })}
                  sub={t("tunnels.advertise_ipv6_sub", {
                    defaultValue: "IPv6 to advertise alongside IPv4. Optional.",
                  })}
                >
                  <Input
                    value={cfg.advertise_ipv6 ?? ""}
                    onChange={(e) => setField("advertise_ipv6", e.target.value || null)}
                    placeholder={t("tunnels.optional", { defaultValue: "optional" })}
                    className="w-full font-mono"
                  />
                </SettingRow>
                <SettingRow
                  label={t("tunnels.route_away", { defaultValue: "Away from home too" })}
                  sub={t("tunnels.route_away_sub", {
                    defaultValue:
                      "Devices using encrypted DNS are routed outside home as well: they're sent to this box's public address, where the internet's port 443 must reach it. Only your devices get in, and only for routed names. Off: away from home they go direct.",
                  })}
                >
                  <Switch
                    checked={cfg.route_away ?? false}
                    onCheckedChange={(v) => setField("route_away", v)}
                  />
                </SettingRow>
                {cfg.route_away && (
                  <SettingRow
                    label={t("tunnels.away_address", { defaultValue: "Public address" })}
                    sub={
                      awayFound
                        ? t("tunnels.away_found", {
                            found: awayFound,
                            defaultValue:
                              "Now {{found}}, from the encrypted DNS name's own record, looked up every few minutes. Set one to use it instead.",
                          })
                        : t("tunnels.away_unknown", {
                            defaultValue:
                              "Taken from the encrypted DNS name's own record, looked up every few minutes; none found yet. Set one to use it instead.",
                          })
                    }
                  >
                    <Input
                      value={cfg.away_ipv4 ?? ""}
                      onChange={(e) => setField("away_ipv4", e.target.value || null)}
                      placeholder={t("tunnels.auto", { defaultValue: "auto-detect" })}
                      className="w-full font-mono"
                    />
                  </SettingRow>
                )}
                <SettingRow
                  label={t("tunnels.max_connections", { defaultValue: "Max connections" })}
                  sub={t("tunnels.max_connections_sub", {
                    defaultValue: "Upper bound on simultaneously tunneled connections.",
                  })}
                >
                  <Input
                    type="number"
                    value={cfg.max_connections}
                    onChange={(e) => setField("max_connections", Number(e.target.value))}
                    className="w-full text-right font-mono tabular-nums"
                  />
                </SettingRow>
                <SettingRow
                  label={t("tunnels.alert_webhook", { defaultValue: "Alert webhook" })}
                  sub={t("tunnels.alert_webhook_moved", {
                    defaultValue:
                      "Tunnel-down alerts go to the webhook set under Settings → Notifications, alongside the other notifications.",
                  })}
                >
                  <Link to="/settings?tab=notifications" className="text-ember text-xs hover:underline">
                    {t("notifications.title", { defaultValue: "Notifications" })} →
                  </Link>
                </SettingRow>
                <SettingRow
                  label={t("tunnels.probe_target", { defaultValue: "Probe target" })}
                  sub={t("tunnels.probe_target_sub", {
                    defaultValue:
                      "host:port the health probe connects to through each egress to measure latency. Must be reachable through every tunnel (it gates fail-closed). Blank = 1.1.1.1:443.",
                  })}
                >
                  <Input
                    value={cfg.probe_target ?? ""}
                    onChange={(e) => setField("probe_target", e.target.value || null)}
                    placeholder="1.1.1.1:443"
                    className="w-full font-mono"
                  />
                </SettingRow>
              </SettingsPanel>
            </TabsContent>

            {/* ── Egresses ── */}
            <TabsContent value="egresses" className="space-y-4 pt-4">
              <SettingsPanel
                title={t("tunnels.egresses", { defaultValue: "Egresses" })}
                sub={t("tunnels.egresses_sub", {
                  defaultValue: "The tunnels and proxies traffic can be routed through.",
                })}
                icon={Cable}
                footer={
                  <div className="flex justify-end">
                    <Btn variant="ghost" onClick={addEgress}>
                      <Plus size={12} /> {t("tunnels.add_egress", { defaultValue: "Add egress" })}
                    </Btn>
                  </div>
                }
              >
                <div className="py-4">
                  {cfg.egresses.length === 0 ? (
                    <p className="text-muted text-xs">
                      {t("tunnels.no_egresses", {
                        defaultValue:
                          "No egresses yet. Add a Direct or SOCKS5 egress to route through.",
                      })}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {cfg.egresses.map((e, i) => (
                        <div
                          key={egressKeys.keyAt(i)}
                          className="border-bdr/70 rounded-xs grid grid-cols-1 items-end gap-3 border p-3 md:grid-cols-[1fr_auto_auto_auto_auto_auto]"
                        >
                          <Field
                            label={
                              <>
                                {t("tunnels.egress_name", { defaultValue: "Name" })}
                                {e.id && (
                                  <span className="ml-1.5 font-mono text-[10px] opacity-60">
                                    {e.id}
                                  </span>
                                )}
                              </>
                            }
                          >
                            <Input
                              value={e.name}
                              onChange={(ev) => renameEgress(i, ev.target.value)}
                              placeholder="nl-proton"
                              className="w-full"
                            />
                          </Field>
                          {e.kind === "wireguard" ? (
                            <Field label={t("tunnels.buffer", { defaultValue: "Buffer (KB)" })}>
                              <Input
                                type="number"
                                value={e.buffer_kb ?? ""}
                                onChange={(ev) =>
                                  updateEgress(i, { buffer_kb: numOrNull(ev.target.value) })
                                }
                                placeholder="256"
                                className="w-full text-right font-mono tabular-nums md:w-28"
                              />
                            </Field>
                          ) : (
                            <div />
                          )}
                          <Field label={t("tunnels.egress_kind", { defaultValue: "Kind" })}>
                            <Select
                              value={e.kind}
                              onChange={(ev) =>
                                updateEgress(i, { kind: ev.target.value as EgressKind })
                              }
                            >
                              {KINDS.map((k) => (
                                <option key={k} value={k}>
                                  {k}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label={t("tunnels.health", { defaultValue: "Health" })}>
                            <div className="flex h-9 items-center">
                              <HealthBadge status={health[e.id]} />
                            </div>
                          </Field>
                          <Field label={t("tunnels.on", { defaultValue: "On" })}>
                            <div className="flex h-9 items-center">
                              <Switch
                                checked={e.enabled}
                                onCheckedChange={(v) => updateEgress(i, { enabled: v })}
                              />
                            </div>
                          </Field>
                          <div className="flex h-9 items-center justify-end">
                            <IconBtn danger onClick={() => removeEgress(i)}>
                              <Trash2 size={13} />
                            </IconBtn>
                          </div>

                          <EgressStatsRow stats={stats?.egresses[e.id]} rate={rates[e.id]} />

                          {e.kind === "socks5" && (
                            <div className="grid grid-cols-1 gap-3 md:col-span-6 md:grid-cols-4">
                              <Field
                                label={t("tunnels.socks_address", { defaultValue: "Proxy host" })}
                              >
                                <Input
                                  value={e.address ?? ""}
                                  onChange={(ev) => updateEgress(i, { address: ev.target.value })}
                                  placeholder="10.0.0.1"
                                  className="w-full font-mono"
                                />
                              </Field>
                              <Field
                                label={t("tunnels.socks_port", { defaultValue: "Proxy port" })}
                              >
                                <Input
                                  type="number"
                                  value={e.port ?? ""}
                                  onChange={(ev) =>
                                    updateEgress(i, { port: numOrNull(ev.target.value) })
                                  }
                                  placeholder="1080"
                                  className="w-full text-right font-mono tabular-nums"
                                />
                              </Field>
                              <Field
                                label={t("tunnels.socks_user", { defaultValue: "Username" })}
                              >
                                <Input
                                  value={e.username ?? ""}
                                  onChange={(ev) => updateEgress(i, { username: ev.target.value })}
                                  placeholder={t("tunnels.optional", { defaultValue: "optional" })}
                                  className="w-full"
                                />
                              </Field>
                              <Field
                                label={t("tunnels.socks_pass", { defaultValue: "Password" })}
                              >
                                <Input
                                  type="password"
                                  value={e.password ?? ""}
                                  onChange={(ev) => updateEgress(i, { password: ev.target.value })}
                                  placeholder={t("tunnels.keep_blank", {
                                    defaultValue: "leave blank to keep",
                                  })}
                                  className="w-full"
                                />
                              </Field>
                            </div>
                          )}

                          {e.kind === "wireguard" && (
                            <div className="space-y-3 md:col-span-6">
                              <details className="group">
                                <summary className="text-body flex cursor-pointer select-none list-none items-center gap-1.5 text-xs">
                                  <ChevronRight
                                    size={12}
                                    className="transition-transform group-open:rotate-90"
                                  />
                                  {t("tunnels.wg_config", {
                                    defaultValue: "WireGuard config (.conf)",
                                  })}
                                </summary>
                                <textarea
                                  value={e.config ?? ""}
                                  onChange={(ev) => updateEgress(i, { config: ev.target.value })}
                                  rows={10}
                                  spellCheck={false}
                                  placeholder={
                                    "[Interface]\nPrivateKey = …\nAddress = 10.0.0.2/32\nDNS = 10.0.0.1\n\n[Peer]\nPublicKey = …\nEndpoint = vpn.example.com:51820\nAllowedIPs = 0.0.0.0/0"
                                  }
                                  className="border-bdr/90 bg-sidebar/90 text-body placeholder:text-muted/60 hover:border-ember/35 focus:border-ember focus:ring-ember/15 rounded-xs mt-2 w-full border p-2.5 font-mono text-xs leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors focus:outline-none focus:ring-2"
                                />
                                <p className="text-muted mt-1 text-xs">
                                  {t("tunnels.wg_hidden_hint", {
                                    defaultValue:
                                      "The PrivateKey is shown masked (********). Leave it as-is to keep the stored key, or paste a fresh .conf to replace it.",
                                  })}
                                </p>
                              </details>
                              {/* Buffer input lives in the header row (next to Name). The
                                  size→speed physics below only applies to the userspace
                                  backend (static smoltcp window, shared UDP socket); on the
                                  kernel backend the OS autotunes all of it, so the readouts
                                  would be misinformation — swap them for a one-line note.
                                  Null backend (disabled egress / older server) keeps the
                                  userspace readouts, the only safe assumption. */}
                              {stats?.egresses[e.id]?.backend === "kernel" ? (
                                <p className="text-muted text-xs leading-relaxed">
                                  {t("tunnels.kernel_backend_hint", {
                                    defaultValue:
                                      "Kernel WireGuard — the OS handles buffering, congestion control and crypto (TCP autotuning, multi-core). The Buffer setting is ignored unless the tunnel falls back to the userspace backend.",
                                  })}
                                </p>
                              ) : (
                                <>
                                  <p className="text-muted text-xs leading-relaxed">
                                    {t("tunnels.buffer_hint", {
                                      defaultValue:
                                        "Max/conn ≈ {{a}} Mbit @20ms · {{b}} @50ms · {{c}} @100ms RTT · ~{{ram}} MB RAM/conn",
                                      a: mbit(e.buffer_kb ?? 256, 20),
                                      b: mbit(e.buffer_kb ?? 256, 50),
                                      c: mbit(e.buffer_kb ?? 256, 100),
                                      ram: (((e.buffer_kb ?? 256) * 2) / 1024).toFixed(1),
                                    })}
                                  </p>
                                  {maxBuf != null && (
                                    <p className="text-muted text-[11px]">
                                      {t("tunnels.kernel_buffer", {
                                        defaultValue:
                                          "Kernel UDP buffer ≈ {{max}} KB (raise net.core.rmem_max for more)",
                                        max: maxBuf,
                                      })}
                                    </p>
                                  )}
                                  {maxBuf != null &&
                                    maxBuf < wantBytes(e.buffer_kb ?? 256) / 1024 && (
                                      <div className="border-warn/40 bg-warn/10 text-warn rounded-xs border px-2 py-1.5 text-xs">
                                        {t("tunnels.buffer_over", {
                                          defaultValue:
                                            "{{buf}} KB across parallel downloads can exceed the egress's shared kernel UDP buffer (~{{max}} KB) — media may stall mid-load. Raise it: sudo sysctl -w net.core.rmem_max={{rec}} (or use a smaller buffer).",
                                          buf: e.buffer_kb ?? 256,
                                          max: maxBuf,
                                          rec: wantBytes(e.buffer_kb ?? 256),
                                        })}
                                      </div>
                                    )}
                                </>
                              )}
                            </div>
                          )}

                          {e.kind === "evasion" && (
                            <div className="md:col-span-6">
                              <Field
                                label={t("tunnels.seg_position", {
                                  defaultValue: "Split position",
                                })}
                              >
                                <Input
                                  type="number"
                                  value={e.seg_position ?? ""}
                                  onChange={(ev) =>
                                    updateEgress(i, { seg_position: numOrNull(ev.target.value) })
                                  }
                                  placeholder={t("tunnels.auto", { defaultValue: "auto-detect" })}
                                  className="w-full text-right font-mono tabular-nums md:w-48"
                                />
                              </Field>
                              <p className="text-muted mt-1 text-xs">
                                {t("tunnels.evasion_help", {
                                  defaultValue:
                                    "Splits the TLS ClientHello across TCP segments so SNI-based DPI can't read the host name. Leave blank to split automatically inside the SNI.",
                                })}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </SettingsPanel>
            </TabsContent>

            {/* ── Rules ── */}
            <TabsContent value="rules" className="space-y-4 pt-4">
              <SettingsPanel
                title={t("tunnels.rules", { defaultValue: "Rules" })}
                sub={t("tunnels.rules_sub", {
                  defaultValue: "Which domains route through which egress, and for which devices.",
                })}
                icon={ListFilter}
              >
                <div className="space-y-3 py-4">
                  {/* Toolbar: filter by domain/egress + add */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <SearchInput
                      icon={Search}
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder={t("tunnels.filter_placeholder", {
                        defaultValue: "Filter by domain or egress…",
                      })}
                      className="flex-1"
                      inputClass="font-mono"
                    />
                    <Select
                      value={egressFilter}
                      onChange={(e) => setEgressFilter(e.target.value)}
                      className="w-full sm:w-44"
                    >
                      <option value="">
                        {t("tunnels.all_egresses", { defaultValue: "All egresses" })}
                      </option>
                      {cfg.egresses.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name || e.id}
                        </option>
                      ))}
                    </Select>
                    <Btn
                      variant="ghost"
                      onClick={addRule}
                      disabled={cfg.egresses.length === 0}
                      className="shrink-0"
                    >
                      <Plus size={12} /> {t("tunnels.add_rule", { defaultValue: "Add rule" })}
                    </Btn>
                  </div>

                  {cfg.rules.length === 0 ? (
                    <p className="text-muted text-xs">
                      {t("tunnels.no_rules", {
                        defaultValue:
                          "No rules. A plain domain (example.com) routes it and all its subdomains; *.example.com routes subdomains only.",
                      })}
                    </p>
                  ) : filteredRules.length === 0 ? (
                    <p className="text-muted py-2 text-xs">
                      {t("tunnels.no_match", { defaultValue: "No rules match your filter." })}
                    </p>
                  ) : (
                    <div>
                      {/* Column headers — the phone layout labels its own fields. */}
                      <div
                        className={cn(
                          "text-muted hidden items-center gap-2 px-3 pb-1.5 text-xs sm:grid",
                          RULE_COLS,
                        )}
                      >
                        <span>{t("tunnels.col_target", { defaultValue: "Domain or service" })}</span>
                        <span>{t("tunnels.rule_egress", { defaultValue: "Egress" })}</span>
                        <span>{t("tunnels.col_devices", { defaultValue: "Devices" })}</span>
                        <span>{t("tunnels.fail_closed", { defaultValue: "Fail-closed" })}</span>
                        <span className="text-right" title={hitsHint}>
                          {t("tunnels.col_hits", { defaultValue: "Hits" })}
                        </span>
                        <span />
                      </div>

                      <div className="border-bdr/70 divide-bdr/55 rounded-xs divide-y border">
                        {filteredRules.map(({ r, i }) => {
                          const scoped = (r.clients ?? []).map((x) => x.toLowerCase());
                          const rowKey = ruleKeys.keyAt(i);
                          const isOpen = openRule === rowKey;
                          const toggleOpen = () => setOpenRule(isOpen ? null : rowKey);
                          const selectedCount = knownClients.filter((c) =>
                            deviceTokens(c).some((tok) => scoped.includes(tok.toLowerCase())),
                          ).length;
                          const hits = ruleHits.get(`${ruleKey(r)}\u0001${r.egress}`) ?? 0;
                          const isService = r.service != null;
                          const svc = isService ? serviceById.get(r.service ?? "") : undefined;

                          const pattern = (
                            <button
                              type="button"
                              onClick={toggleOpen}
                              className="hover:text-ember flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-xs transition-colors"
                            >
                              {isService ? (
                                r.service ? (
                                  <>
                                    <ServiceIcon
                                      service={svc ?? { id: r.service, name: r.service }}
                                      size={12}
                                      className="text-body"
                                    />
                                    <span className="text-heading truncate">{svc?.name ?? r.service}</span>
                                    <Tag>{t("tunnels.rule_service_tag", { defaultValue: "service" })}</Tag>
                                  </>
                                ) : (
                                  <span className="text-warn italic">
                                    {t("tunnels.rule_no_service", { defaultValue: "no service yet" })}
                                  </span>
                                )
                              ) : r.pattern.trim() ? (
                                <span className="text-heading truncate font-mono">{r.pattern}</span>
                              ) : (
                                <span className="text-warn font-mono italic">
                                  {t("tunnels.rule_no_pattern", { defaultValue: "no domain yet" })}
                                </span>
                              )}
                            </button>
                          );
                          const egress = (
                            <EgressChip
                              name={egressName(r.egress)}
                              health={health[r.egress]}
                              tone={egressTone(r.egress)}
                            />
                          );
                          const devices = (
                            <button
                              type="button"
                              onClick={toggleOpen}
                              className={cn(
                                "flex min-w-0 items-center gap-1 text-left text-xs transition-colors",
                                isOpen ? "text-ember" : "text-muted hover:text-ember",
                              )}
                            >
                              <Users size={11} className="shrink-0" />
                              <span className="truncate">
                                {scoped.length === 0
                                  ? t("tunnels.rule_all_devices", { defaultValue: "All devices" })
                                  : t("tunnels.rule_n_devices", {
                                      count: selectedCount,
                                      defaultValue: "{{count}} devices",
                                    })}
                              </span>
                            </button>
                          );
                          const failClosed = (
                            <span
                              className="flex items-center"
                              title={t("tunnels.fail_closed_hint", {
                                defaultValue: "Drop traffic when the egress is down.",
                              })}
                            >
                              <Switch
                                checked={r.fail_closed}
                                onCheckedChange={(v) => updateRule(i, { fail_closed: v })}
                              />
                            </span>
                          );
                          const actions = (
                            <span className="flex items-center justify-end gap-1">
                              <IconBtn
                                onClick={toggleOpen}
                                title={t("tunnels.edit_rule", { defaultValue: "Edit rule" })}
                                className={cn("p-1", isOpen && "text-ember")}
                              >
                                {isOpen ? <Check size={13} /> : <Pencil size={13} />}
                              </IconBtn>
                              <IconBtn danger onClick={() => removeRule(i)} className="p-1">
                                <Trash2 size={13} />
                              </IconBtn>
                            </span>
                          );

                          return (
                            <div
                              key={rowKey}
                              className={cn("px-3 py-2 transition-colors", isOpen && "bg-ember/3")}
                            >
                              {/* Wide screens: one aligned row. */}
                              <div className={cn("hidden items-center gap-2 sm:grid", RULE_COLS)}>
                                {pattern}
                                <span className="min-w-0">{egress}</span>
                                {devices}
                                {failClosed}
                                <span
                                  className="text-muted text-right font-mono text-[11px] tabular-nums"
                                  title={hitsHint}
                                >
                                  {fmt(hits)}
                                </span>
                                {actions}
                              </div>

                              {/* Phones: the domain on its own line, the rest beneath. */}
                              {/* Every row the same two lines: name · hits · actions, then
                                  egress · devices · fail-closed — nothing wraps on its own. */}
                              <div className="space-y-1.5 sm:hidden">
                                <div className="flex items-center gap-2">
                                  {pattern}
                                  <span
                                    className="text-muted shrink-0 font-mono text-[11px] tabular-nums"
                                    title={hitsHint}
                                  >
                                    {fmt(hits)}
                                  </span>
                                  {actions}
                                </div>
                                <div className="flex items-center gap-3">
                                  {egress}
                                  {devices}
                                  <span className="text-muted ml-auto flex shrink-0 items-center gap-1.5 text-[11px]">
                                    {failClosed}
                                    {t("tunnels.fail_closed", { defaultValue: "Fail-closed" })}
                                  </span>
                                </div>
                              </div>

                              {/* Editor: the rule's fields and its device scope. */}
                              {isOpen && (
                                <div className="border-bdr/50 mt-2.5 space-y-3 border-t pt-3">
                                  {/* What the rule routes: one domain pattern, or a whole catalog service. */}
                                  <Segmented
                                    value={isService ? "service" : "domain"}
                                    onChange={(mode) =>
                                      updateRule(
                                        i,
                                        mode === "service"
                                          ? { service: "", pattern: "" }
                                          : { service: undefined, pattern: "" },
                                      )
                                    }
                                    options={[
                                      {
                                        value: "domain",
                                        label: t("tunnels.rule_mode_domain", { defaultValue: "Domain" }),
                                      },
                                      {
                                        value: "service",
                                        label: t("tunnels.rule_mode_service", { defaultValue: "Service" }),
                                      },
                                    ]}
                                  />
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
                                    {isService ? (
                                      <label className="space-y-1">
                                        <span className="text-muted text-xs">
                                          {t("tunnels.rule_mode_service", { defaultValue: "Service" })}
                                        </span>
                                        <Select
                                          value={r.service ?? ""}
                                          onChange={(ev) => updateRule(i, { service: ev.target.value })}
                                          className="w-full"
                                        >
                                          <option value="" disabled>
                                            {t("tunnels.rule_pick_service", { defaultValue: "Choose a service…" })}
                                          </option>
                                          {(catalog?.categories ?? []).map((cat) => {
                                            const items = (catalog?.services ?? []).filter(
                                              (s) => s.category === cat && s.routable,
                                            );
                                            if (items.length === 0) return null;
                                            return (
                                              <optgroup
                                                key={cat}
                                                label={t(`services.category.${cat}`, { defaultValue: cat })}
                                              >
                                                {items.map((s) => (
                                                  <option key={s.id} value={s.id}>
                                                    {s.name}
                                                  </option>
                                                ))}
                                              </optgroup>
                                            );
                                          })}
                                        </Select>
                                      </label>
                                    ) : (
                                      <label className="space-y-1">
                                        <span className="text-muted text-xs">
                                          {t("tunnels.col_domain", { defaultValue: "Domain" })}
                                        </span>
                                        <Input
                                          value={r.pattern}
                                          onChange={(ev) => updateRule(i, { pattern: ev.target.value })}
                                          placeholder="example.com"
                                          className="w-full font-mono"
                                          autoFocus={!r.pattern}
                                        />
                                      </label>
                                    )}
                                    <label className="space-y-1">
                                      <span className="text-muted text-xs">
                                        {t("tunnels.rule_egress", { defaultValue: "Egress" })}
                                      </span>
                                      <Select
                                        value={r.egress}
                                        onChange={(ev) => updateRule(i, { egress: ev.target.value })}
                                        className="w-full"
                                      >
                                        {cfg.egresses.map((e) => (
                                          <option key={e.id} value={e.id}>
                                            {e.name || e.id}
                                          </option>
                                        ))}
                                      </Select>
                                    </label>
                                  </div>
                                  {isService && (
                                    <p className="text-muted/80 text-[11px] leading-relaxed">
                                      {svc
                                        ? t("tunnels.rule_service_help", {
                                            count: svc.domains.length,
                                            defaultValue:
                                              "Routes all {{count}} domains of the service. Messengers, game launchers and Spotify also use their own protocols, which a tunnel can't carry, so they aren't listed.",
                                          })
                                        : t("tunnels.rule_service_help_empty", {
                                            defaultValue:
                                              "Messengers, game launchers and Spotify also use their own protocols, which a tunnel can't carry, so they aren't listed.",
                                          })}
                                    </p>
                                  )}

                                  <div className="space-y-1.5">
                                    <span className="text-muted text-xs">
                                      {t("tunnels.col_devices", { defaultValue: "Devices" })}
                                    </span>
                                    {knownClients.length === 0 ? (
                                      <p className="text-muted text-xs">
                                        {t("tunnels.no_known_devices", {
                                          defaultValue:
                                            "No devices seen yet — they appear once they query.",
                                        })}
                                      </p>
                                    ) : (
                                      <DevicePicker
                                        clients={knownClients}
                                        scoped={scoped}
                                        onToggle={(c) => toggleDevice(i, c)}
                                      />
                                    )}
                                    <p className="text-muted/80 text-[11px]">
                                      {t("tunnels.rule_devices_hint", {
                                        defaultValue: "None selected — the rule applies to every device.",
                                      })}
                                    </p>
                                  </div>
                                  <RuleCompanions
                                    ruleKey={ruleKey(r)}
                                    egressName={egressName(r.egress)}
                                    saved={!dirty && ruleKey(r) !== "" && ruleKey(r) !== "service:"}
                                    existing={new Set(cfg.rules.map((x) => x.pattern))}
                                    onAdd={(sites) => addCompanions(r, sites)}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {cfg.rules.length > 0 && (
                    <div className="flex flex-col gap-1.5 pt-0.5">
                      <p className="text-muted text-[11px] tabular-nums">
                        {filter || egressFilter
                          ? t("tunnels.rules_count_filtered", {
                              shown: filteredRules.length,
                              total: cfg.rules.length,
                              defaultValue: "{{shown}} of {{total}} rules",
                            })
                          : t("tunnels.rules_count", {
                              count: cfg.rules.length,
                              defaultValue: "{{count}} rules",
                            })}
                      </p>
                      <p className="text-muted/80 text-[11px] leading-relaxed">
                        {t("tunnels.pattern_help", {
                          defaultValue:
                            "A plain domain matches it and all subdomains; *.example.com matches subdomains only. Fail-closed drops traffic when the egress is down.",
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </SettingsPanel>
            </TabsContent>
          </Tabs>

          {dirty && (
            <div className="control-surface border-bdr/85 rounded-xs animate-fade-up sticky bottom-4 z-10 flex flex-col gap-3 border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5 text-xs">
                <span className="bg-warn h-1.5 w-1.5 animate-pulse" />
                <span className="text-heading font-medium">
                  {t("tunnels.unsaved_changes", { defaultValue: "Unsaved changes" })}
                </span>
              </div>
              <div className="flex gap-2">
                <Btn type="button" variant="ghost" onClick={reset} disabled={saving}>
                  {t("common.reset", { defaultValue: "Reset" })}
                </Btn>
                <Btn type="button" onClick={save} disabled={saving}>
                  <Save size={13} /> {t("tunnels.save", { defaultValue: "Save changes" })}
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}

/** Live per-egress traffic line + the recent routed domains, under the egress's
 *  config row. Counters are cumulative since server start; rates come from poll
 *  deltas (so they appear from the second poll onward). */
function EgressStatsRow({
  stats,
  rate,
}: {
  stats?: EgressStats;
  rate?: { up: number; down: number };
}) {
  const { t } = useTranslation();
  if (!stats) return null;
  const quiet = stats.total_conns === 0 && stats.connect_fails === 0 && stats.fail_closed_drops === 0;
  return (
    <div className="space-y-2 md:col-span-6">
      <div className="text-muted flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums">
        {/* Which WireGuard implementation carries the tunnel. Kernel is the
            fast path, so it gets the "good" accent; userspace stays muted. */}
        {stats.backend && (
          <span className={cn(stats.backend === "kernel" && "text-cached")}>
            {stats.backend === "kernel"
              ? t("tunnels.backend_kernel", { defaultValue: "kernel WG" })
              : t("tunnels.backend_userspace", { defaultValue: "userspace WG" })}
          </span>
        )}
        {quiet ? (
          <span>{t("tunnels.no_traffic", { defaultValue: "no traffic yet" })}</span>
        ) : (
          <>
            <span className={cn(stats.active > 0 && "text-ember")}>
              {fmt(stats.active)} {t("tunnels.stats_active", { defaultValue: "active" })}
            </span>
            <span>
              {fmt(stats.total_conns)} {t("tunnels.stats_conns", { defaultValue: "conns" })}
            </span>
            <span>
              ↓ {formatBytes(stats.bytes_down)}
              {rate && rate.down > 0 && ` (${fmtRate(rate.down)})`}
            </span>
            <span>
              ↑ {formatBytes(stats.bytes_up)}
              {rate && rate.up > 0 && ` (${fmtRate(rate.up)})`}
            </span>
            {stats.connect_fails > 0 && (
              <span className="text-warn">
                {fmt(stats.connect_fails)}{" "}
                {t("tunnels.stats_fails", { defaultValue: "connect fails" })}
              </span>
            )}
            {stats.fail_closed_drops > 0 && (
              <span className="text-warn">
                {fmt(stats.fail_closed_drops)}{" "}
                {t("tunnels.stats_drops", { defaultValue: "fail-closed drops" })}
              </span>
            )}
            {stats.handshake_age_secs != null && (
              <span>
                {t("tunnels.handshake", { defaultValue: "handshake" })}{" "}
                {fmtAge(stats.handshake_age_secs)}
              </span>
            )}
          </>
        )}
        {stats.down_since_secs != null && (
          <span className="text-warn">
            {t("tunnels.down_for", { defaultValue: "down" })} {fmtAge(stats.down_since_secs)}
          </span>
        )}
        {stats.probe && <ProbeChip probe={stats.probe} />}
      </div>

      {stats.domains.length > 0 && (
        <details className="group">
          <summary className="text-muted hover:text-ember flex cursor-pointer select-none list-none items-center gap-1.5 text-xs transition-colors">
            <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
            {t("tunnels.domains", { defaultValue: "Routed domains" })} · {stats.domains.length}
          </summary>
          <div className="mt-2 space-y-0.5">
            {stats.domains.map((d) => (
              <div
                key={d.host}
                className="text-muted grid grid-cols-[minmax(0,1fr)_4.5rem_6rem_6rem_4rem] items-center gap-2 font-mono text-[11px] tabular-nums"
              >
                <span className="text-body truncate">{d.host}</span>
                <span className="text-right">
                  {fmt(d.conns)} {t("tunnels.stats_conns", { defaultValue: "conns" })}
                </span>
                <span className="text-right">↓ {formatBytes(d.bytes_down)}</span>
                <span className="text-right">↑ {formatBytes(d.bytes_up)}</span>
                <span className="text-right opacity-70">{fmtAge(d.last_seen_secs_ago)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** RTT above this reads as "degraded" (works, but slow) — amber, not red. */
const DEGRADED_RTT_MS = 300;

/** Active-probe latency chip: green RTT when healthy, amber when slow, red when
 *  the last probe failed. Shows even for an idle egress (the probe runs anyway). */
function ProbeChip({ probe }: { probe: EgressProbe }) {
  const { t } = useTranslation();
  if (!probe.ok || probe.rtt_ms == null) {
    return (
      <span className="text-warn">
        {t("tunnels.probe_failed", { defaultValue: "probe failed" })}
      </span>
    );
  }
  const degraded = probe.rtt_ms >= DEGRADED_RTT_MS;
  return (
    <span className={cn(degraded ? "text-warn" : "text-cached")}>
      {probe.rtt_ms} ms{degraded && ` · ${t("tunnels.probe_slow", { defaultValue: "slow" })}`}
    </span>
  );
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted truncate text-xs">{label}</span>
      {children}
    </div>
  );
}

/** An egress as a chip: its own colour, so rules group by tunnel at a glance,
 *  and a dot for its health. */
function EgressChip({
  name,
  health,
  tone,
}: {
  name: string;
  health?: "up" | "down";
  tone: string;
}) {
  return (
    <span
      className={cn(
        "rounded-xs inline-flex max-w-full items-center gap-1.5 border px-2 py-0.5 text-[11px] font-medium",
        tone,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          health === "up" ? "bg-cached" : health === "down" ? "bg-blocked" : "bg-muted/50",
        )}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}

function HealthBadge({ status }: { status?: "up" | "down" }) {
  const { t } = useTranslation();
  // Same colours as the dot on a rule's egress chip: green up, red down, grey
  // while the first probe hasn't answered yet (or the egress is off).
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[11px]",
        status === "up" ? "text-cached" : status === "down" ? "text-blocked" : "text-muted",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "up" ? "bg-cached" : status === "down" ? "bg-blocked" : "bg-muted/50",
        )}
      />
      {status === "up"
        ? t("tunnels.up", { defaultValue: "up" })
        : status === "down"
          ? t("tunnels.down", { defaultValue: "down" })
          : "—"}
    </span>
  );
}
