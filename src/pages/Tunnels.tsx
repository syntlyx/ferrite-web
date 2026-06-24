import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Trash2,
  Save,
  Waypoints,
  ChevronRight,
  RefreshCw,
  Search,
  Cable,
  ListFilter,
  Gauge,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
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
import type { ClientEntry, EgressKind, ProxyConfig, ProxyEgress, ProxyRule } from "@/api/types";

const KINDS: EgressKind[] = ["direct", "socks5", "wireguard", "evasion"];

/** Shared grid template so the rules header and every rule row line up. */
const RULE_COLS = "grid-cols-[minmax(0,1fr)_11rem_10rem_5.5rem_2rem]";

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
  egresses: [],
  rules: [],
};

export default function Tunnels() {
  const { t } = useTranslation();
  const toast = useToast();

  const [cfg, setCfg] = useState<ProxyConfig>(EMPTY);
  // Snapshot of the last loaded config; the sticky save bar shows only when the
  // draft drifts from it, and Reset restores it without a round-trip.
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(EMPTY));
  const [health, setHealth] = useState<Record<string, "up" | "down">>({});
  const [maxBuf, setMaxBuf] = useState<number | null>(null);
  const [knownClients, setKnownClients] = useState<ClientEntry[]>([]);
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
        setSavedJson(JSON.stringify(d.proxy));
        setHealth(d.egress_health ?? {});
        setMaxBuf(d.max_buffer_kb ?? null);
        setErr("");
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

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
  }, []);

  // Refresh egress health on a timer WITHOUT clobbering the user's unsaved edits:
  // update only `health`, never `cfg`. A WireGuard egress flips to "up" a few
  // seconds after save once its handshake completes, so a one-shot reload would
  // otherwise show a stale "down" until a manual page refresh.
  const visible = usePageVisible();
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      api
        .getProxy()
        .then((d) => {
          setHealth(d.egress_health ?? {});
          setMaxBuf(d.max_buffer_kb ?? null);
        })
        .catch(() => {});
    }, 4000);
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

  const addEgress = () =>
    setCfg((c) => ({
      ...c,
      egresses: [...c.egresses, { id: "", name: "", enabled: true, kind: "direct" }],
    }));

  const removeEgress = (i: number) =>
    setCfg((c) => ({ ...c, egresses: c.egresses.filter((_, idx) => idx !== i) }));

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
    setCfg((c) => ({
      ...c,
      rules: [
        ...c.rules,
        { pattern: "", egress: c.egresses[0]?.id ?? "", fail_closed: true, clients: [] },
      ],
    }));
  };

  const removeRule = (i: number) =>
    setCfg((c) => ({ ...c, rules: c.rules.filter((_, idx) => idx !== i) }));

  function reset() {
    setCfg(JSON.parse(savedJson) as ProxyConfig);
    setOpenRule(null);
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

  const filteredRules = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return cfg.rules
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !egressFilter || r.egress === egressFilter)
      .filter(
        ({ r }) =>
          !q ||
          r.pattern.toLowerCase().includes(q) ||
          egressName(r.egress).toLowerCase().includes(q),
      );
  }, [cfg.rules, filter, egressFilter, egressName]);

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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              sub={t("tunnels.tile_rules_sub", { defaultValue: "domain patterns" })}
            />
            <StatusTile
              icon={Gauge}
              label={t("tunnels.max_connections", { defaultValue: "Max connections" })}
              value={cfg.max_connections}
              sub={t("tunnels.tile_conns_sub", { defaultValue: "concurrent" })}
              tone="muted"
            />
          </div>

          <Tabs defaultValue="rules">
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
                badge={
                  <span className="text-muted font-mono text-[11px] tabular-nums">
                    {cfg.egresses.length}
                  </span>
                }
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
                          key={i}
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
                              {/* Buffer input lives in the header row (next to Name); this is
                                  the live size→speed readout for the current value. */}
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
                              {maxBuf != null && maxBuf < wantBytes(e.buffer_kb ?? 256) / 1024 && (
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
                badge={
                  <span className="text-muted font-mono text-[11px] tabular-nums">
                    {cfg.rules.length}
                  </span>
                }
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
                    <div className="overflow-x-auto">
                      <div className="min-w-[760px]">
                        {/* Column headers */}
                        <div
                          className={cn(
                            "text-muted grid items-center gap-2 px-2 pb-1.5 font-mono text-[10px] uppercase tracking-[0.1em]",
                            RULE_COLS,
                          )}
                        >
                          <span>{t("tunnels.col_domain", { defaultValue: "Domain" })}</span>
                          <span>{t("tunnels.rule_egress", { defaultValue: "Egress" })}</span>
                          <span>{t("tunnels.col_devices", { defaultValue: "Devices" })}</span>
                          <span>{t("tunnels.fail_closed", { defaultValue: "Fail-closed" })}</span>
                          <span />
                        </div>

                        <div className="border-bdr/70 divide-bdr/55 rounded-xs divide-y border">
                          {filteredRules.map(({ r, i }) => {
                            const scoped = (r.clients ?? []).map((x) => x.toLowerCase());
                            const isOpen = openRule === i;
                            const selectedCount = knownClients.filter((c) =>
                              deviceTokens(c).some((tok) => scoped.includes(tok.toLowerCase())),
                            ).length;
                            return (
                              <div key={i} className="px-2 py-2">
                                <div className={cn("grid items-center gap-2", RULE_COLS)}>
                                  <Input
                                    value={r.pattern}
                                    onChange={(ev) => updateRule(i, { pattern: ev.target.value })}
                                    placeholder="example.com"
                                    className="w-full font-mono"
                                  />
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
                                  <button
                                    type="button"
                                    onClick={() => setOpenRule(isOpen ? null : i)}
                                    className={cn(
                                      "flex items-center gap-1 truncate text-left text-xs transition-colors",
                                      isOpen ? "text-ember" : "text-muted hover:text-ember",
                                    )}
                                  >
                                    <ChevronRight
                                      size={12}
                                      className={cn(
                                        "shrink-0 transition-transform",
                                        isOpen && "rotate-90",
                                      )}
                                    />
                                    <span className="truncate">
                                      {scoped.length === 0
                                        ? t("tunnels.rule_all_devices", {
                                            defaultValue: "All devices",
                                          })
                                        : t("tunnels.rule_n_devices", {
                                            count: selectedCount,
                                            defaultValue: "{{count}} device(s)",
                                          })}
                                    </span>
                                  </button>
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
                                  <IconBtn
                                    danger
                                    onClick={() => removeRule(i)}
                                    className="justify-self-center"
                                  >
                                    <Trash2 size={13} />
                                  </IconBtn>
                                </div>

                                {/* Device scope: empty = all clients. Collapsed by default. */}
                                {isOpen &&
                                  (knownClients.length === 0 ? (
                                    <p className="text-muted px-1 pt-2 text-xs">
                                      {t("tunnels.no_known_devices", {
                                        defaultValue:
                                          "No devices seen yet — they appear once they query.",
                                      })}
                                    </p>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5 px-1 pt-2.5">
                                      {knownClients.map((c) => {
                                        const tokens = deviceTokens(c).map((x) => x.toLowerCase());
                                        const on = tokens.some((tok) => scoped.includes(tok));
                                        return (
                                          <button
                                            key={c.name}
                                            type="button"
                                            onClick={() => toggleDevice(i, c)}
                                            title={c.ips.join(", ")}
                                            className={cn(
                                              "rounded-xs border px-2 py-1 font-mono text-[11px] transition-colors",
                                              on
                                                ? "border-ember/40 bg-ember/10 text-ember"
                                                : "border-bdr/70 text-muted hover:text-ember hover:border-ember/40",
                                            )}
                                          >
                                            {c.name}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ))}
                              </div>
                            );
                          })}
                        </div>
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
                              defaultValue: "{{count}} rule(s)",
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
            <div className="control-surface plate-ticks border-bdr/85 rounded-xs animate-fade-up sticky bottom-4 z-10 flex flex-col gap-3 border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted truncate text-xs">{label}</span>
      {children}
    </div>
  );
}

function HealthBadge({ status }: { status?: "up" | "down" }) {
  const { t } = useTranslation();
  const down = status === "down";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[11px]",
        down ? "text-warn" : "text-ember",
      )}
    >
      <Waypoints size={11} />
      {down ? t("tunnels.down", { defaultValue: "down" }) : t("tunnels.up", { defaultValue: "up" })}
    </span>
  );
}
