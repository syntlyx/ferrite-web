import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Save, Waypoints, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/layout/Card";
import { Spinner } from "@/components/feedback/Spinner";
import { Err } from "@/components/feedback/Err";
import { Input, Select, Switch, Btn, IconBtn, SectionLabel } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { usePageVisible } from "@/hooks/use-page-visible";
import { deviceTokens } from "@/api/clients";
import type { ClientEntry, EgressKind, ProxyConfig, ProxyEgress, ProxyRule } from "@/api/types";

const KINDS: EgressKind[] = ["direct", "socks5", "wireguard", "evasion"];

/** Rounded Mbit/s a TCP window of `kb` KiB sustains over `rttMs` round-trip
 *  (throughput ≈ window / RTT). Drives the buffer-size speed calculator. */
const mbit = (kb: number, rttMs: number) =>
  Math.round((kb * 1024 * 8) / (rttMs / 1000) / 1_000_000);

/** Rough concurrent-download count the egress's SINGLE shared UDP buffer must
 *  hold at once. Used to flag a per-conn buffer whose aggregate (buffer × this)
 *  exceeds the kernel limit — the real cause of media stalling on big buffers. */
const PARALLEL_CONNS = 8;

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
  const [health, setHealth] = useState<Record<string, "up" | "down">>({});
  const [maxBuf, setMaxBuf] = useState<number | null>(null);
  const [knownClients, setKnownClients] = useState<ClientEntry[]>([]);
  const [openRule, setOpenRule] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    return api
      .getProxy()
      .then((d) => {
        setCfg(d.proxy);
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

  const addRule = () =>
    setCfg((c) => ({
      ...c,
      rules: [
        ...c.rules,
        { pattern: "", egress: c.egresses[0]?.id ?? "", fail_closed: true, clients: [] },
      ],
    }));

  const removeRule = (i: number) =>
    setCfg((c) => ({ ...c, rules: c.rules.filter((_, idx) => idx !== i) }));

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

  return (
    <div className="p-6">
      <PageHeader
        title={t("tunnels.title", { defaultValue: "Tunnels" })}
        subtitle={t("tunnels.subtitle", {
          defaultValue:
            "Route chosen domains through a tunnel or proxy. Matching domains resolve to ferrite, which forwards them through the selected egress.",
        })}
      />
      {err && <Err msg={err} />}

      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* ── General ── */}
          <Card className="mb-4">
            <SectionLabel>{t("tunnels.general", { defaultValue: "General" })}</SectionLabel>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between gap-3">
                <span className="text-body text-xs">
                  {t("tunnels.enabled", { defaultValue: "Enable selective routing" })}
                </span>
                <Switch
                  checked={cfg.enabled}
                  onCheckedChange={(v) => setField("enabled", v)}
                />
              </label>
              <Field label={t("tunnels.advertise_ipv4", { defaultValue: "Advertise IPv4" })}>
                <Input
                  value={cfg.advertise_ipv4 ?? ""}
                  onChange={(e) => setField("advertise_ipv4", e.target.value || null)}
                  placeholder={t("tunnels.auto", { defaultValue: "auto-detect" })}
                  className="w-full font-mono"
                />
              </Field>
              <Field label={t("tunnels.advertise_ipv6", { defaultValue: "Advertise IPv6" })}>
                <Input
                  value={cfg.advertise_ipv6 ?? ""}
                  onChange={(e) => setField("advertise_ipv6", e.target.value || null)}
                  placeholder={t("tunnels.optional", { defaultValue: "optional" })}
                  className="w-full font-mono"
                />
              </Field>
              <Field
                label={t("tunnels.max_connections", { defaultValue: "Max connections" })}
              >
                <Input
                  type="number"
                  value={cfg.max_connections}
                  onChange={(e) => setField("max_connections", Number(e.target.value))}
                  className="w-full text-right font-mono tabular-nums"
                />
              </Field>
            </div>
          </Card>

          {/* ── Egresses ── */}
          <Card className="mb-4">
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>{t("tunnels.egresses", { defaultValue: "Egresses" })}</SectionLabel>
              <Btn variant="ghost" onClick={addEgress} className="h-7">
                <Plus size={12} /> {t("tunnels.add_egress", { defaultValue: "Add egress" })}
              </Btn>
            </div>
            {cfg.egresses.length === 0 ? (
              <p className="text-muted text-xs">
                {t("tunnels.no_egresses", {
                  defaultValue: "No egresses yet. Add a Direct or SOCKS5 egress to route through.",
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
                            <span className="ml-1.5 font-mono text-[10px] opacity-60">{e.id}</span>
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
                          onChange={(ev) => updateEgress(i, { buffer_kb: numOrNull(ev.target.value) })}
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
                      <div className="flex h-8 items-center">
                        <HealthBadge status={health[e.id]} />
                      </div>
                    </Field>
                    <Field label={t("tunnels.on", { defaultValue: "On" })}>
                      <div className="flex h-8 items-center">
                        <Switch
                          checked={e.enabled}
                          onCheckedChange={(v) => updateEgress(i, { enabled: v })}
                        />
                      </div>
                    </Field>
                    <div className="flex h-8 items-center justify-end">
                      <IconBtn danger onClick={() => removeEgress(i)}>
                        <Trash2 size={13} />
                      </IconBtn>
                    </div>

                    {e.kind === "socks5" && (
                      <div className="grid grid-cols-1 gap-3 md:col-span-6 md:grid-cols-4">
                        <Field label={t("tunnels.socks_address", { defaultValue: "Proxy host" })}>
                          <Input
                            value={e.address ?? ""}
                            onChange={(ev) => updateEgress(i, { address: ev.target.value })}
                            placeholder="10.0.0.1"
                            className="w-full font-mono"
                          />
                        </Field>
                        <Field label={t("tunnels.socks_port", { defaultValue: "Proxy port" })}>
                          <Input
                            type="number"
                            value={e.port ?? ""}
                            onChange={(ev) => updateEgress(i, { port: numOrNull(ev.target.value) })}
                            placeholder="1080"
                            className="w-full text-right font-mono tabular-nums"
                          />
                        </Field>
                        <Field label={t("tunnels.socks_user", { defaultValue: "Username" })}>
                          <Input
                            value={e.username ?? ""}
                            onChange={(ev) => updateEgress(i, { username: ev.target.value })}
                            placeholder={t("tunnels.optional", { defaultValue: "optional" })}
                            className="w-full"
                          />
                        </Field>
                        <Field label={t("tunnels.socks_pass", { defaultValue: "Password" })}>
                          <Input
                            type="password"
                            value={e.password ?? ""}
                            onChange={(ev) => updateEgress(i, { password: ev.target.value })}
                            placeholder={t("tunnels.keep_blank", { defaultValue: "leave blank to keep" })}
                            className="w-full"
                          />
                        </Field>
                      </div>
                    )}

                    {e.kind === "wireguard" && (
                      <div className="space-y-3 md:col-span-6">
                        <details className="group">
                          <summary className="text-body flex cursor-pointer list-none items-center gap-1.5 text-xs select-none">
                            <ChevronRight
                              size={12}
                              className="transition-transform group-open:rotate-90"
                            />
                            {t("tunnels.wg_config", { defaultValue: "WireGuard config (.conf)" })}
                          </summary>
                          <textarea
                            value={e.config ?? ""}
                            onChange={(ev) => updateEgress(i, { config: ev.target.value })}
                            rows={10}
                            spellCheck={false}
                            placeholder={
                              "[Interface]\nPrivateKey = …\nAddress = 10.0.0.2/32\nDNS = 10.0.0.1\n\n[Peer]\nPublicKey = …\nEndpoint = vpn.example.com:51820\nAllowedIPs = 0.0.0.0/0"
                            }
                            className="border-bdr bg-panel/50 text-body rounded-xs mt-2 w-full border p-2 font-mono text-xs"
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
                              defaultValue: "Kernel UDP buffer ≈ {{max}} KB (raise net.core.rmem_max for more)",
                              max: maxBuf,
                            })}
                          </p>
                        )}
                        {maxBuf != null && (e.buffer_kb ?? 256) * PARALLEL_CONNS >= maxBuf && (
                          <div className="border-warn/40 bg-warn/10 text-warn rounded-xs border px-2 py-1.5 text-xs">
                            {t("tunnels.buffer_over", {
                              defaultValue:
                                "{{buf}} KB across parallel downloads can exceed the egress's shared kernel UDP buffer (~{{max}} KB) — media may stall mid-load. Raise it: sudo sysctl -w net.core.rmem_max={{rec}} (or use a smaller buffer).",
                              buf: e.buffer_kb ?? 256,
                              max: maxBuf,
                              rec: (e.buffer_kb ?? 256) * 1024 * PARALLEL_CONNS,
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {e.kind === "evasion" && (
                      <div className="md:col-span-6">
                        <Field
                          label={t("tunnels.seg_position", { defaultValue: "Split position" })}
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
          </Card>

          {/* ── Rules ── */}
          <Card className="mb-4">
            <div className="mb-3 flex items-center justify-between">
              <SectionLabel>{t("tunnels.rules", { defaultValue: "Rules" })}</SectionLabel>
              <Btn
                variant="ghost"
                onClick={addRule}
                disabled={cfg.egresses.length === 0}
                className="h-7"
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
            ) : (
              <div className="space-y-2">
                {cfg.rules.map((r, i) => {
                  const scoped = (r.clients ?? []).map((x) => x.toLowerCase());
                  const isOpen = openRule === i;
                  const selectedCount = knownClients.filter((c) =>
                    deviceTokens(c).some((tok) => scoped.includes(tok.toLowerCase())),
                  ).length;
                  return (
                    <div key={i} className="border-bdr/70 rounded-xs space-y-2 border p-3">
                      <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[2fr_1.4fr_auto_auto]">
                        <Field
                          label={t("tunnels.rule_pattern", { defaultValue: "Domain pattern" })}
                        >
                          <Input
                            value={r.pattern}
                            onChange={(ev) => updateRule(i, { pattern: ev.target.value })}
                            placeholder="example.com"
                            className="w-full font-mono"
                          />
                        </Field>
                        <Field label={t("tunnels.rule_egress", { defaultValue: "Egress" })}>
                          <Select
                            value={r.egress}
                            onChange={(ev) => updateRule(i, { egress: ev.target.value })}
                          >
                            {cfg.egresses.map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.name || e.id}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label={t("tunnels.fail_closed", { defaultValue: "Fail-closed" })}>
                          <div className="flex h-8 items-center">
                            <Switch
                              checked={r.fail_closed}
                              onCheckedChange={(v) => updateRule(i, { fail_closed: v })}
                            />
                          </div>
                        </Field>
                        <div className="flex h-8 items-center justify-end">
                          <IconBtn danger onClick={() => removeRule(i)}>
                            <Trash2 size={13} />
                          </IconBtn>
                        </div>
                      </div>

                      {/* Device scope: empty = all clients. Collapsed by default. */}
                      <button
                        type="button"
                        onClick={() => setOpenRule(isOpen ? null : i)}
                        className="text-muted hover:text-ember flex items-center gap-1 text-xs"
                      >
                        <ChevronRight
                          size={12}
                          className={cn("transition-transform", isOpen && "rotate-90")}
                        />
                        {scoped.length === 0
                          ? t("tunnels.rule_all_devices", { defaultValue: "All devices" })
                          : t("tunnels.rule_n_devices", {
                              count: selectedCount,
                              defaultValue: "{{count}} device(s)",
                            })}
                      </button>
                      {isOpen &&
                        (knownClients.length === 0 ? (
                          <p className="text-muted text-xs">
                            {t("tunnels.no_known_devices", {
                              defaultValue: "No devices seen yet — they appear once they query.",
                            })}
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
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
            )}
          </Card>

          <div className="flex justify-end">
            <Btn onClick={save} disabled={saving} className="h-9">
              <Save size={13} /> {t("tunnels.save", { defaultValue: "Save changes" })}
            </Btn>
          </div>
        </>
      )}
    </div>
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
      {down
        ? t("tunnels.down", { defaultValue: "down" })
        : t("tunnels.up", { defaultValue: "up" })}
    </span>
  );
}
