import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Save, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/layout/Card";
import { Spinner } from "@/components/feedback/Spinner";
import { Err } from "@/components/feedback/Err";
import { Input, Select, Switch, Btn, IconBtn, SectionLabel } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import type { EgressKind, ProxyConfig, ProxyEgress, ProxyRule } from "@/api/types";

const KINDS: EgressKind[] = ["direct", "socks5", "wireguard"];

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
  const [restartPending, setRestartPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    return api
      .getProxy()
      .then((d) => {
        setCfg(d.proxy);
        setHealth(d.egress_health ?? {});
        setRestartPending(d.restart_pending);
        setErr("");
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Mutators (edit a local draft; Save persists the whole config) ──
  const setField = <K extends keyof ProxyConfig>(key: K, value: ProxyConfig[K]) =>
    setCfg((c) => ({ ...c, [key]: value }));

  const updateEgress = (i: number, patch: Partial<ProxyEgress>) =>
    setCfg((c) => ({
      ...c,
      egresses: c.egresses.map((e, idx) => (idx === i ? { ...e, ...patch } : e)),
    }));

  const addEgress = () =>
    setCfg((c) => ({
      ...c,
      egresses: [...c.egresses, { id: "", name: "", enabled: true, kind: "direct" }],
    }));

  const removeEgress = (i: number) =>
    setCfg((c) => ({ ...c, egresses: c.egresses.filter((_, idx) => idx !== i) }));

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
        { pattern: "", egress: c.egresses[0]?.id ?? "", fail_closed: true },
      ],
    }));

  const removeRule = (i: number) =>
    setCfg((c) => ({ ...c, rules: c.rules.filter((_, idx) => idx !== i) }));

  async function save() {
    setSaving(true);
    try {
      const res = await api.putProxy(cfg);
      toast(
        res.restart_required
          ? t("tunnels.saved_restart", {
              defaultValue: "Saved. Restart ferrite for the change to take effect.",
            })
          : t("tunnels.saved", { defaultValue: "Saved" }),
      );
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
          {restartPending && (
            <div className="border-warn/40 bg-warn/10 text-warn rounded-xs mb-4 border px-3 py-2 text-xs">
              {t("tunnels.restart_pending", {
                defaultValue:
                  "Listener settings (enabled / ports / max connections) differ from the running server — restart to apply.",
              })}
            </div>
          )}

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
              <Field label={t("tunnels.http_port", { defaultValue: "HTTP port" })}>
                <Input
                  type="number"
                  value={cfg.http_port}
                  onChange={(e) => setField("http_port", Number(e.target.value))}
                  className="w-full text-right font-mono tabular-nums"
                />
              </Field>
              <Field label={t("tunnels.https_port", { defaultValue: "HTTPS port" })}>
                <Input
                  type="number"
                  value={cfg.https_port}
                  onChange={(e) => setField("https_port", Number(e.target.value))}
                  className="w-full text-right font-mono tabular-nums"
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
                    className="border-bdr/70 rounded-xs grid grid-cols-1 gap-3 border p-3 md:grid-cols-[1fr_1fr_auto_auto_auto]"
                  >
                    <Field label={t("tunnels.egress_id", { defaultValue: "ID" })}>
                      <Input
                        value={e.id}
                        onChange={(ev) => updateEgress(i, { id: ev.target.value })}
                        placeholder="work-vpn"
                        className="w-full font-mono"
                      />
                    </Field>
                    <Field label={t("tunnels.egress_name", { defaultValue: "Name" })}>
                      <Input
                        value={e.name}
                        onChange={(ev) => updateEgress(i, { name: ev.target.value })}
                        placeholder={t("tunnels.optional", { defaultValue: "optional" })}
                        className="w-full"
                      />
                    </Field>
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
                      <HealthBadge status={health[e.id]} />
                    </Field>
                    <div className="flex items-end justify-end gap-2">
                      <label className="flex flex-col items-center gap-1">
                        <span className="text-muted text-[10px]">
                          {t("tunnels.on", { defaultValue: "On" })}
                        </span>
                        <Switch
                          checked={e.enabled}
                          onCheckedChange={(v) => updateEgress(i, { enabled: v })}
                        />
                      </label>
                      <IconBtn danger onClick={() => removeEgress(i)}>
                        <Trash2 size={13} />
                      </IconBtn>
                    </div>

                    {e.kind === "socks5" && (
                      <div className="grid grid-cols-1 gap-3 md:col-span-5 md:grid-cols-4">
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
                      <div className="md:col-span-5">
                        <Field
                          label={t("tunnels.wg_config", { defaultValue: "WireGuard config (.conf)" })}
                        >
                          <textarea
                            value={e.config ?? ""}
                            onChange={(ev) => updateEgress(i, { config: ev.target.value })}
                            rows={9}
                            spellCheck={false}
                            placeholder={
                              "[Interface]\nPrivateKey = …\nAddress = 10.0.0.2/32\nDNS = 10.0.0.1\n\n[Peer]\nPublicKey = …\nEndpoint = vpn.example.com:51820\nAllowedIPs = 0.0.0.0/0"
                            }
                            className="border-bdr bg-panel/50 text-body rounded-xs w-full border p-2 font-mono text-xs"
                          />
                        </Field>
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
                  defaultValue: "No rules. A rule maps a domain (or *.domain) to an egress.",
                })}
              </p>
            ) : (
              <div className="space-y-2">
                {cfg.rules.map((r, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-1 items-end gap-3 md:grid-cols-[2fr_1.4fr_auto_auto]"
                  >
                    <Field label={t("tunnels.rule_pattern", { defaultValue: "Domain pattern" })}>
                      <Input
                        value={r.pattern}
                        onChange={(ev) => updateRule(i, { pattern: ev.target.value })}
                        placeholder="*.google.com"
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
                    <label className="flex flex-col items-center gap-1">
                      <span className="text-muted text-[10px]">
                        {t("tunnels.fail_closed", { defaultValue: "Fail-closed" })}
                      </span>
                      <Switch
                        checked={r.fail_closed}
                        onCheckedChange={(v) => updateRule(i, { fail_closed: v })}
                      />
                    </label>
                    <div className="flex items-end justify-end">
                      <IconBtn danger onClick={() => removeRule(i)}>
                        <Trash2 size={13} />
                      </IconBtn>
                    </div>
                  </div>
                ))}
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted text-xs">{label}</span>
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
