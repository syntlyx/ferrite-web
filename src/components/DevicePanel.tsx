import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Check, ListFilter, Pause, Pencil, Play, Route, ShieldOff, X } from "lucide-react";
import { api } from "@/api";
import { deviceTokens } from "@/api/clients";
import type {
  BlocklistProfile,
  ClientEntry,
  DeviceDomain,
  DeviceStats,
  ProfilesResponse,
  ProxyConfig,
} from "@/api/types";
import { cn } from "@/lib/utils";
import { fmt, relTime } from "@/lib/format";
import { DEVICE_ICON, deviceKind } from "@/lib/device-kind";
import { Btn, IconBtn, Input, Select, Skeleton } from "@/components/ui";
import { ServiceIcon } from "@/components/ServicePicker";
import { useToast } from "@/hooks/use-toast";
import { closeDevicePanel, useDevicePanel, type DevicePanelTarget } from "@/stores/device-panel";
import { openDomainPanel } from "@/stores/domain-panel";
import { fmtCountdown, PAUSE_OPTIONS, usePause } from "@/stores/pause";
import { Tag } from "@/components/feedback/Badge";

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs text-muted">{children}</p>;
}

/** The device a target names: the first client sharing a MAC, an IP or the name. */
function findClient(list: ClientEntry[], t: DevicePanelTarget): ClientEntry | null {
  const macs = new Set((t.macs ?? []).map((m) => m.toLowerCase()));
  const ips = new Set(t.ips ?? []);
  return (
    list.find((c) => c.macs.some((m) => macs.has(m.toLowerCase()))) ??
    list.find((c) => c.ips.some((ip) => ips.has(ip))) ??
    (t.name ? list.find((c) => c.name === t.name) : undefined) ??
    null
  );
}

/** Every token a device can appear under in a profile or rule, lower-cased. */
function allTokens(c: ClientEntry): string[] {
  return [...c.macs, ...c.ips].map((x) => x.toLowerCase());
}

/** 24 hours of 10-minute buckets as bars: total, with the blocked share on top. */
function ActivityBars({ stats }: { stats: DeviceStats }) {
  const BUCKET = 600;
  const n = Math.round((stats.hours * 3600) / BUCKET);
  const end = Math.floor(Date.now() / 1000 / BUCKET) * BUCKET;
  const start = end - (n - 1) * BUCKET;
  const byBucket = new Map(stats.activity.map((a) => [a.bucket, a]));
  const bars = Array.from({ length: n }, (_, i) => byBucket.get(start + i * BUCKET));
  const max = Math.max(1, ...bars.map((b) => b?.total ?? 0));
  const w = 100 / n;
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-12 w-full" aria-hidden>
      {bars.map((b, i) =>
        b ? (
          <g key={i}>
            <rect
              x={i * w}
              width={Math.max(w - 0.15, 0.1)}
              y={32 - (b.total / max) * 32}
              height={(b.total / max) * 32}
              className="fill-upstream/45"
            />
            {b.blocked > 0 && (
              <rect
                x={i * w}
                width={Math.max(w - 0.15, 0.1)}
                y={32 - (b.blocked / max) * 32}
                height={(b.blocked / max) * 32}
                className="fill-blocked/70"
              />
            )}
          </g>
        ) : null,
      )}
    </svg>
  );
}

function DomainList({
  rows,
  ip,
  blocked,
}: {
  rows: DeviceDomain[];
  ip?: string;
  blocked?: boolean;
}) {
  const max = rows[0] ? (blocked ? rows[0].blocked : rows[0].total) : 1;
  return (
    <ul className="space-y-0.5">
      {rows.map((d) => {
        const n = blocked ? d.blocked : d.total;
        return (
          <li key={d.domain}>
            <button
              type="button"
              onClick={() => openDomainPanel(d.domain, ip)}
              className="group relative flex w-full items-center gap-2 rounded-xs px-1.5 py-1 text-left text-xs transition-colors hover:bg-white/4"
            >
              <span
                className={cn(
                  "absolute inset-y-0.5 left-0 rounded-xs",
                  blocked ? "bg-blocked/8" : "bg-upstream/8",
                )}
                style={{ width: `${(n / max) * 100}%` }}
              />
              <span className="relative min-w-0 flex-1 truncate font-mono text-[11px] text-body transition-colors group-hover:text-ember">
                {d.domain}
              </span>
              <span
                className={cn(
                  "relative shrink-0 font-mono text-[10px] tabular-nums",
                  blocked ? "text-blocked" : "text-muted",
                )}
              >
                {fmt(n)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Everything about one device in one place: what it is, which profile governs
 * it and whether that profile is on right now, what it has been doing, the
 * services behind that, where its traffic is routed — and the actions that
 * follow: name it, pause it, give it a profile. Opened from anywhere through
 * `openDevicePanel`; mounted once by the shell.
 */
export function DevicePanel() {
  const target = useDevicePanel();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const pause = usePause();
  const [client, setClient] = useState<ClientEntry | null | undefined>(undefined);
  const [stats, setStats] = useState<DeviceStats | null | undefined>(undefined);
  const [profiles, setProfiles] = useState<ProfilesResponse | null>(null);
  const [proxy, setProxy] = useState<ProxyConfig | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback((tgt: DevicePanelTarget) => {
    let cancelled = false;
    setClient(undefined);
    setStats(undefined);
    setNaming(null);
    api
      .clients(500)
      .then((r) => {
        if (cancelled) return;
        const c = findClient(r.clients, tgt);
        setClient(c);
        // Every token the row merges, so a device whose MAC changed shows
        // its whole day, not the old MAC's.
        const tokens = c?.devices?.length
          ? c.devices
          : c
            ? deviceTokens(c).slice(0, 1)
            : [tgt.macs?.[0] ?? tgt.ips?.[0]].filter((x): x is string => !!x);
        if (tokens.length === 0) return setStats(null);
        api
          .deviceStats(tokens.join(","))
          .then((s) => !cancelled && setStats(s))
          .catch(() => !cancelled && setStats(null));
      })
      .catch(() => !cancelled && setClient(null));
    api
      .getProfiles()
      .then((p) => !cancelled && setProfiles(p))
      .catch(() => {});
    api
      .getProxy()
      .then((p) => !cancelled && setProxy(p.proxy))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    return load(target);
  }, [target, load]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDevicePanel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target]);

  const tokens = useMemo(() => (client ? allTokens(client) : []), [client]);
  const profile: BlocklistProfile | null = useMemo(
    () =>
      profiles?.profiles.find((p) => p.clients.some((x) => tokens.includes(x.toLowerCase()))) ??
      null,
    [profiles, tokens],
  );
  const rules = useMemo(
    () =>
      (proxy?.rules ?? []).filter((r) =>
        (r.clients ?? []).some((x) => tokens.includes(x.toLowerCase())),
      ),
    [proxy, tokens],
  );

  if (!target) return null;

  const name = client?.name ?? stats?.name ?? target.name ?? target.ips?.[0] ?? "—";
  const Icon = DEVICE_ICON[deviceKind(name)];
  const pauseKeys = client ? deviceTokens(client).map((x) => x.toLowerCase()) : [];
  const pausedLeft = pauseKeys.map((k) => pause.clientLeft.get(k)).find((v) => v != null) ?? null;
  const dayTotal = stats?.activity.reduce((n, a) => n + a.total, 0) ?? 0;
  const dayBlocked = stats?.activity.reduce((n, a) => n + a.blocked, 0) ?? 0;
  const ip = client?.ips[0] ?? target.ips?.[0];
  const profileActive = profile ? (profiles?.active?.[profile.id] ?? true) : false;

  async function run(work: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await work();
      if (done) toast(done);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function saveName() {
    if (!client || naming == null) return;
    const value = naming.trim();
    const mac = client.macs[0];
    const at = mac ? { mac } : { ip: client.ips[0] };
    if (!value || value === client.name) return setNaming(null);
    void run(
      async () => {
        await api.addAlias({ ...at, name: value });
        setClient({ ...client, name: value, is_alias: true });
        setNaming(null);
      },
      t("device.named", { name: value, defaultValue: "Named {{name}}" }),
    );
  }

  function assignProfile(id: string) {
    if (!profiles || !client) return;
    const next = profiles.profiles.map((p) => {
      const kept = p.clients.filter((x) => !tokens.includes(x.toLowerCase()));
      return p.id === id
        ? { ...p, clients: [...kept, ...deviceTokens(client)] }
        : { ...p, clients: kept };
    });
    const target = next.find((p) => p.id === id);
    void run(
      async () => {
        await api.putProfiles(next);
        setProfiles({ ...profiles, profiles: next });
      },
      target
        ? t("device.profile_set", {
            profile: target.name,
            defaultValue: "Profile {{profile}} now applies",
          })
        : t("device.profile_cleared", { defaultValue: "Network defaults now apply" }),
    );
  }

  const labelMinutes = (m: number) =>
    m >= 60
      ? t("pause.hours_short", { count: m / 60, defaultValue: "{{count}}h" })
      : t("pause.minutes_short", { count: m, defaultValue: "{{count}}m" });

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={name}>
      <button
        type="button"
        aria-label={t("common.close", { defaultValue: "Close" })}
        onClick={closeDevicePanel}
        className="absolute inset-0 bg-void/55 backdrop-blur-[2px]"
      />
      <aside className="control-surface absolute inset-y-0 right-0 flex w-full max-w-md animate-fade-up flex-col border-l border-bdr/85 shadow-[-18px_0_44px_rgba(0,0,0,0.3)]">
        {/* Identity */}
        <div className="flex items-start gap-3 border-b border-bdr/60 px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xs border border-ember/20 bg-ember/5 text-ember/85">
            <Icon size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">{t("device.title", { defaultValue: "Device" })}</p>
            {naming != null ? (
              <form
                className="mt-1 flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveName();
                }}
              >
                <Input
                  autoFocus
                  value={naming}
                  onChange={(e) => setNaming(e.target.value)}
                  className="h-7 text-sm"
                />
                <IconBtn
                  type="submit"
                  disabled={busy}
                  title={t("common.save", { defaultValue: "Save" })}
                >
                  <Check size={14} />
                </IconBtn>
                <IconBtn
                  type="button"
                  onClick={() => setNaming(null)}
                  title={t("common.cancel", { defaultValue: "Cancel" })}
                >
                  <X size={14} />
                </IconBtn>
              </form>
            ) : (
              <p className="group mt-1 flex items-center gap-1.5 text-sm break-all text-heading">
                {name}
                {client && (client.macs[0] || client.ips[0]) && (
                  <IconBtn
                    type="button"
                    onClick={() => setNaming(client.name)}
                    title={t("clients.name_device", { defaultValue: "Name this device" })}
                    className="opacity-60 group-hover:opacity-100"
                  >
                    <Pencil size={11} />
                  </IconBtn>
                )}
              </p>
            )}
            <p className="mt-1 font-mono text-[10px] break-all text-muted">
              {[...(client?.ips ?? target.ips ?? []), ...(client?.macs ?? [])].join(" · ")}
            </p>
          </div>
          <IconBtn
            type="button"
            onClick={closeDevicePanel}
            title={t("common.close", { defaultValue: "Close" })}
          >
            <X size={14} />
          </IconBtn>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {client === undefined ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              {/* Filtering: profile, pause, bypass */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {client?.blocking_bypassed ? (
                    <span className="flex items-center gap-1.5 rounded-xs border border-warn/30 bg-warn/10 px-2.5 py-1 text-[11px] text-warn">
                      <ShieldOff size={12} />
                      {t("device.bypassed", { defaultValue: "Filtering off for this device" })}
                    </span>
                  ) : pausedLeft != null ? (
                    <button
                      type="button"
                      onClick={() => void run(() => pause.resumeClients(pauseKeys))}
                      className="flex items-center gap-1.5 rounded-xs border border-warn/30 bg-warn/10 px-2.5 py-1 font-mono text-[11px] text-warn tabular-nums transition-colors hover:bg-warn/20"
                      title={t("pause.resume", { defaultValue: "Resume" })}
                    >
                      <Play size={11} />
                      {t("device.paused_for", {
                        time: fmtCountdown(pausedLeft),
                        defaultValue: "Paused · {{time}}",
                      })}
                    </button>
                  ) : (
                    client && (
                      <span className="flex items-center gap-1">
                        <span className="mr-1 flex items-center gap-1 text-[11px] text-muted">
                          <Pause size={11} />
                          {t("device.pause", { defaultValue: "Pause" })}
                        </span>
                        {PAUSE_OPTIONS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            disabled={busy}
                            onClick={() => void run(() => pause.pauseClients(pauseKeys, m))}
                            className="rounded-xs border border-bdr/70 px-1.5 py-0.5 font-mono text-[10px] text-muted tabular-nums transition-colors hover:border-warn/50 hover:text-warn"
                          >
                            {labelMinutes(m)}
                          </button>
                        ))}
                      </span>
                    )
                  )}
                  {stats?.first_seen && Date.now() / 1000 - stats.first_seen < 86400 && (
                    <Tag tone="cached">{t("clients.new_badge", { defaultValue: "new" })}</Tag>
                  )}
                </div>

                {client && profiles && (
                  <div>
                    <Heading>{t("device.profile", { defaultValue: "Profile" })}</Heading>
                    <div className="flex items-center gap-2">
                      <Select
                        value={profile?.id ?? ""}
                        disabled={busy}
                        onChange={(e) => assignProfile(e.target.value)}
                        className="min-w-0 flex-1"
                      >
                        <option value="">
                          {t("device.no_profile", { defaultValue: "Network defaults" })}
                        </option>
                        {profiles.profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {profile && (
                      <p
                        className={cn(
                          "mt-1.5 text-[11px]",
                          profileActive ? "text-cached" : "text-muted",
                        )}
                      >
                        {profileActive
                          ? t("device.profile_on", { defaultValue: "In effect now." })
                          : t("device.profile_off", {
                              defaultValue:
                                "Outside its schedule right now — network defaults apply until it starts.",
                            })}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Activity */}
              <div>
                <Heading>
                  {t("device.last_24h", { defaultValue: "Last 24 hours" })}
                  {stats && dayTotal > 0 && (
                    <span className="ml-2 tracking-normal normal-case">
                      {t("device.day_counts", {
                        total: fmt(dayTotal),
                        blocked: fmt(dayBlocked),
                        defaultValue: "{{total}} queries · {{blocked}} blocked",
                      })}
                    </span>
                  )}
                </Heading>
                {stats === undefined ? (
                  <Skeleton className="h-12 w-full" />
                ) : !stats || dayTotal === 0 ? (
                  <p className="text-xs text-muted">
                    {t("device.no_activity", {
                      defaultValue: "No queries from this device in the last day.",
                    })}
                  </p>
                ) : (
                  <ActivityBars stats={stats} />
                )}
                {stats && (
                  <p className="mt-1 text-[10px] text-muted">
                    {[
                      stats.last_seen
                        ? t("device.last_seen", {
                            when: relTime(stats.last_seen, i18n.language),
                            defaultValue: "last query {{when}}",
                          })
                        : null,
                      stats.first_seen
                        ? t("device.first_seen", {
                            when: relTime(stats.first_seen, i18n.language),
                            defaultValue: "first seen {{when}}",
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>

              {/* Services */}
              {stats && stats.services.length > 0 && (
                <div>
                  <Heading>{t("device.services", { defaultValue: "Services it used" })}</Heading>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.services.slice(0, 12).map((s) => {
                      const allBlocked = s.blocked > 0 && s.blocked === s.queries;
                      return (
                        <span
                          key={s.id}
                          className={cn(
                            "flex items-center gap-1.5 rounded-xs border px-2 py-1 text-[11px]",
                            allBlocked
                              ? "border-blocked/30 text-blocked"
                              : "border-bdr/70 text-body",
                          )}
                          title={t("device.service_counts", {
                            queries: s.queries,
                            blocked: s.blocked,
                            defaultValue: "{{queries}} queries, {{blocked}} blocked",
                          })}
                        >
                          <ServiceIcon service={s} size={12} />
                          {s.name}
                          <span className="font-mono text-[10px] text-muted tabular-nums">
                            {fmt(s.queries)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Domains */}
              {stats && stats.top_domains.length > 0 && (
                <div>
                  <Heading>{t("device.top_domains", { defaultValue: "Most asked" })}</Heading>
                  <DomainList rows={stats.top_domains} ip={ip} />
                </div>
              )}
              {stats && stats.top_blocked.length > 0 && (
                <div>
                  <Heading>{t("device.top_blocked", { defaultValue: "Most blocked" })}</Heading>
                  <DomainList rows={stats.top_blocked} ip={ip} blocked />
                </div>
              )}

              {/* Routing */}
              {proxy?.enabled && rules.length > 0 && (
                <div>
                  <Heading>
                    {t("device.routing", { defaultValue: "Routed for this device" })}
                  </Heading>
                  <ul className="space-y-1">
                    {rules.map((r, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <Route size={12} className="shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-body">
                          {r.service ?? r.pattern}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-muted">
                          → {proxy.egresses.find((e) => e.id === r.egress)?.name ?? r.egress}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {stats === null && client !== undefined && (
                <p className="text-xs text-muted">
                  {t("device.no_stats", {
                    defaultValue: "No history for this device — statistics may be off.",
                  })}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-bdr/60 px-5 py-3">
          {client && (
            <Btn
              variant="ghost"
              className="ml-auto"
              onClick={() => {
                closeDevicePanel();
                navigate(`/queries?device=${encodeURIComponent(deviceTokens(client).join(","))}`);
              }}
            >
              <ListFilter size={12} /> {t("domain.show_in_log", { defaultValue: "Query log" })}
            </Btn>
          )}
        </div>
      </aside>
    </div>
  );
}
