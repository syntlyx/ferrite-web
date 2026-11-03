import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Lock,
  Network,
  Plus,
  RadioTower,
  RefreshCw,
  Save,
  Server,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "@/api";
import type { DhcpLease, DhcpSettings, DhcpView, RaSettings } from "@/api/types";
import { relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import {
  FieldLabel,
  SettingRow,
  SettingsPanel,
  StatusTile,
} from "@/components/layout/SettingsPanel";
import { Spinner } from "@/components/feedback/Spinner";
import { Err } from "@/components/feedback/Err";
import { Tag } from "@/components/feedback/Badge";
import { Btn, IconBtn, Input, Select, Switch } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { usePageVisible } from "@/hooks/use-page-visible";
import { openDevicePanel } from "@/stores/device-panel";

/** How often leases and the status line refresh while the page is open. */
const POLL_MS = 10_000;

const LEASE_TIMES = [3600, 4 * 3600, 12 * 3600, 86400, 7 * 86400];

/** The page's editable copy of both sections, every field as typed. */
interface Form {
  enabled: boolean;
  server_ip: string;
  subnet_mask: string;
  pool_start: string;
  pool_end: string;
  gateway: string;
  dns: string;
  domain: string;
  lease_secs: number;
  reservations: { mac: string; ip: string; name: string }[];
  ra_enabled: boolean;
  ra_interface: string;
  ra_rdnss: string;
  ra_lifetime: number;
  ra_interval: number;
}

function toForm({ dhcp, ra }: DhcpView): Form {
  return {
    enabled: dhcp.enabled,
    server_ip: dhcp.server_ip ?? "",
    subnet_mask: dhcp.subnet_mask,
    pool_start: dhcp.pool_start ?? "",
    pool_end: dhcp.pool_end ?? "",
    gateway: dhcp.gateway ?? "",
    dns: (dhcp.dns ?? []).join(", "),
    domain: dhcp.domain ?? "",
    lease_secs: dhcp.lease_secs,
    reservations: (dhcp.reservations ?? []).map((r) => ({
      mac: r.mac,
      ip: r.ip,
      name: r.name ?? "",
    })),
    ra_enabled: ra.enabled,
    ra_interface: ra.interface ?? "",
    ra_rdnss: (ra.rdnss ?? []).join(", "),
    ra_lifetime: ra.rdnss_lifetime,
    ra_interval: ra.interval_secs,
  };
}

const blank = (s: string) => s.trim() || null;
const list = (s: string) =>
  s
    .split(/[\s,]+/)
    .map((x) => x.trim())
    .filter(Boolean);

function toBody(f: Form): { dhcp: DhcpSettings; ra: RaSettings } {
  return {
    dhcp: {
      enabled: f.enabled,
      server_ip: blank(f.server_ip),
      subnet_mask: f.subnet_mask.trim(),
      pool_start: blank(f.pool_start),
      pool_end: blank(f.pool_end),
      gateway: blank(f.gateway),
      dns: list(f.dns),
      domain: blank(f.domain),
      lease_secs: f.lease_secs,
      reservations: f.reservations
        .filter((r) => r.mac.trim() || r.ip.trim())
        .map((r) => ({ mac: r.mac.trim(), ip: r.ip.trim(), name: blank(r.name) })),
    },
    ra: {
      enabled: f.ra_enabled,
      interface: blank(f.ra_interface),
      rdnss: list(f.ra_rdnss),
      rdnss_lifetime: f.ra_lifetime,
      interval_secs: f.ra_interval,
    },
  };
}

const ipNum = (ip: string): number | null => {
  const p = ip.trim().split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
};
const ipText = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");

/** A pool to start from: a hundred addresses from .100 of the box's subnet. */
function suggestPool(ip: string | null, mask: string): [string, string] | null {
  const a = ip ? ipNum(ip) : null;
  const m = ipNum(mask);
  if (a == null || m == null) return null;
  const net = (a & m) >>> 0;
  const hosts = ~m >>> 0;
  if (hosts < 8) return null;
  const first = net + Math.min(100, Math.floor(hosts / 2));
  const last = Math.min(first + 99, net + hosts - 1);
  return [ipText(first), ipText(last)];
}

/** "1 day", "4 hours" — the lease time as people say it. */
function useLeaseLabel() {
  const { t } = useTranslation();
  return (secs: number) =>
    secs % 86400 === 0
      ? t("dhcp.days", { count: secs / 86400, defaultValue: "{{count}} days" })
      : secs % 3600 === 0
        ? t("dhcp.hours", { count: secs / 3600, defaultValue: "{{count}} hours" })
        : t("dhcp.minutes", { count: Math.round(secs / 60), defaultValue: "{{count}} minutes" });
}

function Warning({ children, tone = "warn" }: { children: string; tone?: "warn" | "blocked" }) {
  return (
    <div
      className={cn(
        "my-4 flex items-start gap-2 rounded-xs border px-3 py-2.5 text-xs",
        tone === "warn"
          ? "border-warn/35 bg-warn/10 text-warn"
          : "border-blocked/40 bg-blocked/5 text-blocked",
      )}
    >
      <AlertTriangle size={13} className="mt-px shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export default function Dhcp() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const visible = usePageVisible();
  const leaseLabel = useLeaseLabel();
  const [view, setView] = useState<DhcpView | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState("");
  const [leases, setLeases] = useState<DhcpLease[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const adopt = useCallback((v: DhcpView) => {
    const f = toForm(v);
    setView(v);
    setForm(f);
    setSaved(JSON.stringify(f));
  }, []);

  const load = useCallback(async () => {
    try {
      adopt(await api.getDhcp());
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [adopt]);

  const loadLeases = useCallback(async () => {
    try {
      setLeases((await api.dhcpLeases()).leases);
    } catch {
      /* the next poll tries again */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadLeases();
  }, [load, loadLeases]);

  // Leases and the status line keep moving; the form the operator is
  // editing does not.
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      void loadLeases();
      api
        .getDhcp()
        .then((v) => setView((prev) => (prev ? { ...prev, status: v.status } : v)))
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [visible, loadLeases]);

  // Free = the pool minus the leases inside it; a reservation outside the
  // pool takes nothing from it.
  const pool = useMemo(() => {
    const a = view?.dhcp.pool_start ? ipNum(view.dhcp.pool_start) : null;
    const b = view?.dhcp.pool_end ? ipNum(view.dhcp.pool_end) : null;
    if (a == null || b == null || b < a) return null;
    const used = leases.filter((l) => {
      const n = ipNum(l.ip);
      return n != null && n >= a && n <= b;
    }).length;
    return { size: b - a + 1, free: Math.max(0, b - a + 1 - used) };
  }, [view, leases]);

  if (!view || !form) {
    return (
      <PageContainer>
        <PageHeader title={t("dhcp.title", { defaultValue: "DHCP" })} />
        {err ? <Err msg={err} /> : <Spinner />}
      </PageContainer>
    );
  }

  const dirty = JSON.stringify(form) !== saved;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const det = view.detected;
  const st = view.status;
  const on = view.dhcp.enabled;

  function toggleServer(next: boolean) {
    if (!form) return;
    // Switching on with no pool yet: start from a hundred addresses.
    if (next && !form.pool_start && !form.pool_end) {
      const pool = suggestPool(form.server_ip || det.server_ip, form.subnet_mask);
      if (pool) {
        setForm({ ...form, enabled: true, pool_start: pool[0], pool_end: pool[1] });
        return;
      }
    }
    set("enabled", next);
  }

  function reserve(l: DhcpLease) {
    if (!form) return;
    setForm({
      ...form,
      reservations: [...form.reservations, { mac: l.mac, ip: l.ip, name: l.hostname ?? "" }],
    });
  }

  function editReservation(i: number, patch: Partial<Form["reservations"][number]>) {
    if (!form) return;
    setForm({
      ...form,
      reservations: form.reservations.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const v = await api.putDhcp(toBody(form));
      adopt(v);
      void loadLeases();
      if (v.dhcp.enabled && v.status.error) toast(v.status.error, "error");
      else if (v.ra.enabled && v.status.ra_error) toast(v.status.ra_error, "error");
      else toast(t("dhcp.saved", { defaultValue: "Saved and applied" }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  const reservedMacs = new Set(form.reservations.map((r) => r.mac.toLowerCase()));
  const leaseOptions = LEASE_TIMES.includes(form.lease_secs)
    ? LEASE_TIMES
    : [...LEASE_TIMES, form.lease_secs].sort((a, b) => a - b);

  return (
    <PageContainer>
      <PageHeader
        title={t("dhcp.title", { defaultValue: "DHCP" })}
        subtitle={t("dhcp.subtitle", {
          defaultValue:
            "Hand out addresses on your network, with ferrite as every device's DNS — for routers that won't let you change it.",
        })}
        action={
          <Btn
            variant="ghost"
            onClick={() => {
              void load();
              void loadLeases();
            }}
          >
            <RefreshCw size={12} />
            {t("common.refresh", { defaultValue: "Refresh" })}
          </Btn>
        }
      />
      {err && <Err msg={err} />}

      <div className="space-y-4">
        {/* ── Overview ── */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatusTile
            icon={Server}
            label={t("dhcp.tile_server", { defaultValue: "Server" })}
            value={
              st.running
                ? t("dhcp.running", { defaultValue: "Running" })
                : on
                  ? t("dhcp.stopped", { defaultValue: "Not running" })
                  : t("common.disabled", { defaultValue: "Disabled" })
            }
            sub={st.running ? (st.server_ip ?? "") : on ? (st.error ?? "") : ""}
            tone={st.running ? "ember" : on ? "warn" : "muted"}
          />
          <StatusTile
            icon={Users}
            label={t("dhcp.tile_leases", { defaultValue: "Leases" })}
            value={leases.length}
            sub={
              view.dhcp.pool_start && view.dhcp.pool_end
                ? `${view.dhcp.pool_start} – ${view.dhcp.pool_end}`
                : ""
            }
            tone="upstream"
          />
          <StatusTile
            icon={Network}
            label={t("dhcp.tile_free", { defaultValue: "Free addresses" })}
            value={pool ? pool.free : "—"}
            sub={
              pool
                ? t("dhcp.tile_free_sub", {
                    count: pool.size,
                    defaultValue: "of {{count}} in the pool",
                  })
                : ""
            }
            tone="muted"
          />
          <StatusTile
            icon={RadioTower}
            label={t("dhcp.tile_ipv6", { defaultValue: "IPv6 DNS" })}
            value={
              st.ra_running
                ? t("dhcp.announcing", { defaultValue: "Announcing" })
                : view.ra.enabled
                  ? t("dhcp.stopped", { defaultValue: "Not running" })
                  : t("common.disabled", { defaultValue: "Disabled" })
            }
            sub={
              st.ra_running ? (st.ra_interface ?? "") : view.ra.enabled ? (st.ra_error ?? "") : ""
            }
            tone={st.ra_running ? "ember" : view.ra.enabled ? "warn" : "muted"}
          />
        </div>

        {/* ── Server ── */}
        <SettingsPanel
          title={t("dhcp.server", { defaultValue: "DHCP server" })}
          sub={t("dhcp.server_sub", {
            defaultValue:
              "Addresses, the router and the DNS every device is handed. Applies at once.",
          })}
          icon={Server}
        >
          {!on && (
            <Warning>
              {t("dhcp.one_server", {
                defaultValue:
                  "A network takes one DHCP server. Switch off the one in your router when you switch this on, or devices get answers from both.",
              })}
            </Warning>
          )}
          {on && st.error && <Warning tone="blocked">{st.error}</Warning>}
          <SettingRow
            label={t("dhcp.enabled", { defaultValue: "Hand out addresses" })}
            sub={t("dhcp.enabled_sub", {
              defaultValue:
                "Off by default. Devices pick it up as their lease renews, or on reconnect.",
            })}
          >
            <Switch checked={form.enabled} onCheckedChange={toggleServer} />
          </SettingRow>
          <SettingRow
            label={t("dhcp.pool", { defaultValue: "Address pool" })}
            sub={t("dhcp.pool_sub", {
              defaultValue:
                "The range devices get addresses from. This box and the router are left out of it.",
            })}
          >
            <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <Input
                value={form.pool_start}
                onChange={(e) => set("pool_start", e.target.value)}
                placeholder="192.168.1.100"
                className="w-full font-mono"
                spellCheck={false}
              />
              <span className="text-muted">–</span>
              <Input
                value={form.pool_end}
                onChange={(e) => set("pool_end", e.target.value)}
                placeholder="192.168.1.199"
                className="w-full font-mono"
                spellCheck={false}
              />
            </div>
          </SettingRow>
          <SettingRow
            label={t("dhcp.gateway", { defaultValue: "Router" })}
            sub={t("dhcp.gateway_sub", {
              defaultValue:
                "Where devices send traffic for the internet — your router. Blank: the one this box uses.",
            })}
          >
            <Input
              value={form.gateway}
              onChange={(e) => set("gateway", e.target.value)}
              placeholder={det.gateway ?? "192.168.1.1"}
              className="w-full font-mono"
              spellCheck={false}
            />
          </SettingRow>
          <SettingRow
            label={t("dhcp.dns", { defaultValue: "DNS servers" })}
            sub={t("dhcp.dns_sub", {
              defaultValue:
                "Blank: this box, so every device is filtered. Several: separate with commas.",
            })}
          >
            <Input
              value={form.dns}
              onChange={(e) => set("dns", e.target.value)}
              placeholder={st.server_ip ?? det.server_ip ?? ""}
              className="w-full font-mono"
              spellCheck={false}
            />
          </SettingRow>
          <SettingRow
            label={t("dhcp.server_ip", { defaultValue: "This box's address" })}
            sub={t("dhcp.server_ip_sub", {
              defaultValue: "The address devices know the server by. Blank: detected.",
            })}
          >
            <Input
              value={form.server_ip}
              onChange={(e) => set("server_ip", e.target.value)}
              placeholder={det.server_ip ?? ""}
              className="w-full font-mono"
              spellCheck={false}
            />
          </SettingRow>
          <SettingRow
            label={t("dhcp.mask", { defaultValue: "Subnet mask" })}
            sub={
              det.subnet_mask && det.subnet_mask !== form.subnet_mask
                ? t("dhcp.mask_detected", {
                    mask: det.subnet_mask,
                    defaultValue: "This box's network uses {{mask}}.",
                  })
                : undefined
            }
          >
            <Input
              value={form.subnet_mask}
              onChange={(e) => set("subnet_mask", e.target.value)}
              className="w-full font-mono"
              spellCheck={false}
            />
          </SettingRow>
          <SettingRow
            label={t("dhcp.domain", { defaultValue: "Local domain" })}
            sub={t("dhcp.domain_sub", {
              defaultValue:
                "Devices answer by name on it: a laptop that calls itself “laptop” is laptop.lan.",
            })}
          >
            <Input
              value={form.domain}
              onChange={(e) => set("domain", e.target.value)}
              placeholder="lan"
              className="w-full font-mono"
              spellCheck={false}
            />
          </SettingRow>
          <SettingRow
            label={t("dhcp.lease_time", { defaultValue: "Lease time" })}
            sub={t("dhcp.lease_time_sub", {
              defaultValue: "How long a device keeps its address before it asks again.",
            })}
          >
            <Select
              value={String(form.lease_secs)}
              onChange={(e) => set("lease_secs", Number(e.target.value))}
              className="w-full"
            >
              {leaseOptions.map((s) => (
                <option key={s} value={s}>
                  {leaseLabel(s)}
                </option>
              ))}
            </Select>
          </SettingRow>
        </SettingsPanel>

        {/* ── Leases ── */}
        <SettingsPanel
          title={t("dhcp.leases", { defaultValue: "Leases" })}
          sub={t("dhcp.leases_sub", {
            defaultValue:
              "Who holds which address now. The name a device gives becomes its name everywhere in ferrite.",
          })}
          icon={Users}
        >
          {leases.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">
              {on
                ? t("dhcp.no_leases", { defaultValue: "No device has asked for an address yet." })
                : t("dhcp.no_leases_off", {
                    defaultValue: "The server is off — leases appear here once it hands some out.",
                  })}
            </p>
          ) : (
            leases.map((l) => {
              const isReserved = l.reserved || reservedMacs.has(l.mac.toLowerCase());
              return (
                <div key={l.mac} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() =>
                        openDevicePanel({
                          macs: [l.mac],
                          ips: [l.ip],
                          name: l.hostname ?? undefined,
                        })
                      }
                      className="block max-w-full truncate text-left text-[13px] font-medium text-heading transition-colors hover:text-ember"
                    >
                      {l.hostname || t("dhcp.unnamed", { defaultValue: "No name given" })}
                    </button>
                    <p className="truncate font-mono text-[11px] text-muted">
                      {l.ip} · {l.mac}
                    </p>
                  </div>
                  <span className="hidden shrink-0 text-[11px] text-muted sm:inline">
                    {t("dhcp.expires", {
                      when: relTime(l.expires_at, i18n.language),
                      defaultValue: "expires {{when}}",
                    })}
                  </span>
                  {isReserved ? (
                    <Tag tone="ember">{t("dhcp.reserved", { defaultValue: "reserved" })}</Tag>
                  ) : (
                    <Btn type="button" variant="ghost" size="sm" onClick={() => reserve(l)}>
                      <Lock size={11} /> {t("dhcp.reserve", { defaultValue: "Reserve" })}
                    </Btn>
                  )}
                </div>
              );
            })
          )}
        </SettingsPanel>

        {/* ── Reservations ── */}
        <SettingsPanel
          title={t("dhcp.reservations", { defaultValue: "Reservations" })}
          sub={t("dhcp.reservations_sub", {
            defaultValue:
              "These devices always get the same address. A name here answers in DNS too.",
          })}
          icon={Lock}
          footer={
            <Btn
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                set("reservations", [...form.reservations, { mac: "", ip: "", name: "" }])
              }
            >
              <Plus size={12} /> {t("dhcp.add_reservation", { defaultValue: "Add reservation" })}
            </Btn>
          }
        >
          {form.reservations.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">
              {t("dhcp.no_reservations", {
                defaultValue: "None yet — reserve a device from the leases above, or add one.",
              })}
            </p>
          ) : (
            <div className="py-3">
              <div className="mb-1.5 hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 sm:grid">
                <FieldLabel>{t("dhcp.mac", { defaultValue: "MAC address" })}</FieldLabel>
                <FieldLabel>{t("dhcp.ip", { defaultValue: "Address" })}</FieldLabel>
                <FieldLabel>{t("dhcp.name", { defaultValue: "Name" })}</FieldLabel>
                <span className="w-7" />
              </div>
              <div className="space-y-3 sm:space-y-2">
                {form.reservations.map((r, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 border-b border-bdr/40 pb-3 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:border-0 sm:pb-0"
                  >
                    <Input
                      value={r.mac}
                      onChange={(e) => editReservation(i, { mac: e.target.value })}
                      placeholder="aa:bb:cc:dd:ee:ff"
                      className="order-1 col-span-2 w-full font-mono sm:col-span-1"
                      spellCheck={false}
                    />
                    <IconBtn
                      danger
                      onClick={() =>
                        set(
                          "reservations",
                          form.reservations.filter((_, j) => j !== i),
                        )
                      }
                      title={t("common.delete", { defaultValue: "Delete" })}
                      className="order-2 self-center sm:order-4"
                    >
                      <Trash2 size={12} />
                    </IconBtn>
                    <Input
                      value={r.ip}
                      onChange={(e) => editReservation(i, { ip: e.target.value })}
                      placeholder="192.168.1.20"
                      className="order-3 w-full font-mono sm:order-2"
                      spellCheck={false}
                    />
                    <Input
                      value={r.name}
                      onChange={(e) => editReservation(i, { name: e.target.value })}
                      placeholder={t("dhcp.name_placeholder", { defaultValue: "nas" })}
                      className="order-4 w-full sm:order-3"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </SettingsPanel>

        {/* ── IPv6 ── */}
        <SettingsPanel
          title={t("dhcp.ra", { defaultValue: "IPv6 DNS announcements" })}
          sub={t("dhcp.ra_sub", {
            defaultValue:
              "Tell IPv6 devices to use this box for DNS, so they don't slip past it over the router's IPv6. DNS only — ferrite never claims to be the router.",
          })}
          icon={RadioTower}
        >
          {view.ra.enabled && st.ra_error && <Warning tone="blocked">{st.ra_error}</Warning>}
          <SettingRow
            label={t("dhcp.ra_enabled", { defaultValue: "Announce this box as DNS" })}
            sub={t("dhcp.ra_enabled_sub", {
              defaultValue: "Works with or without the DHCP server. Needs CAP_NET_RAW.",
            })}
          >
            <Switch checked={form.ra_enabled} onCheckedChange={(v) => set("ra_enabled", v)} />
          </SettingRow>
          <SettingRow
            label={t("dhcp.ra_interface", { defaultValue: "Interface" })}
            sub={t("dhcp.ra_interface_sub", {
              defaultValue: "Blank: the one with the default route.",
            })}
          >
            <Input
              value={form.ra_interface}
              onChange={(e) => set("ra_interface", e.target.value)}
              placeholder={det.interface ?? "eth0"}
              className="w-full font-mono"
              spellCheck={false}
            />
          </SettingRow>
          <SettingRow
            label={t("dhcp.ra_addresses", { defaultValue: "Addresses to announce" })}
            sub={t("dhcp.ra_addresses_sub", {
              defaultValue:
                "This box's IPv6 addresses. Blank: its stable ones, unique-local first.",
            })}
          >
            <Input
              value={form.ra_rdnss}
              onChange={(e) => set("ra_rdnss", e.target.value)}
              placeholder={det.ipv6.join(", ") || "fd00::10"}
              className="w-full font-mono"
              spellCheck={false}
            />
          </SettingRow>
        </SettingsPanel>

        {dirty && (
          <div className="control-surface sticky bottom-4 z-10 flex animate-fade-up flex-col gap-3 rounded-xs border border-bdr/85 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5 text-xs">
              <span className="h-1.5 w-1.5 animate-pulse bg-warn" />
              <span className="font-medium text-heading">
                {t("tunnels.unsaved_changes", { defaultValue: "Unsaved changes" })}
              </span>
            </div>
            <div className="flex gap-2">
              <Btn
                type="button"
                variant="ghost"
                onClick={() => setForm(JSON.parse(saved) as Form)}
                disabled={saving}
              >
                {t("common.reset", { defaultValue: "Reset" })}
              </Btn>
              <Btn type="button" onClick={() => void save()} disabled={saving}>
                <Save size={13} /> {t("dhcp.save", { defaultValue: "Save and apply" })}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
