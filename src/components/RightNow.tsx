import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowUpCircle,
  ChevronRight,
  Moon,
  Pause,
  RefreshCw,
  UserCog,
  UserPlus,
  Users,
  Waypoints,
} from "lucide-react";
import { api } from "@/api";
import type {
  ClientEntry,
  ProfilesResponse,
  ProxyStatsResponse,
  SyncView,
  UpdateCheckResponse,
} from "@/api/types";
import { cn } from "@/lib/utils";
import { relTime } from "@/lib/format";
import { Card } from "@/components/layout/Card";
import { Skeleton } from "@/components/ui";
import { usePageVisible } from "@/hooks/use-page-visible";
import { usePause, fmtCountdown } from "@/stores/pause";

const REFRESH_MS = 60_000;
/** A device counts as new for a day after the box first sees it. */
const NEW_FOR = 86_400;
/** Seen within this long counts as active. */
const ACTIVE_FOR = 600;

type Tone = "ember" | "cached" | "warn" | "blocked" | "upstream" | "muted";

const TONE: Record<Tone, string> = {
  ember: "bg-ember/12 text-ember",
  cached: "bg-cached/12 text-cached",
  warn: "bg-warn/12 text-warn",
  blocked: "bg-blocked/12 text-blocked",
  upstream: "bg-upstream/12 text-upstream",
  muted: "bg-white/5 text-muted",
};

interface Row {
  key: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  tone: Tone;
  title: string;
  sub?: string;
  to: string;
}

interface Snapshot {
  clients: ClientEntry[] | null;
  profiles: ProfilesResponse | null;
  proxy: ProxyStatsResponse | null;
  sync: SyncView | null;
  update: UpdateCheckResponse | null;
}

function value<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === "fulfilled" ? r.value : null;
}

/** Names of the devices a profile holds, as the clients list knows them. */
function deviceNames(tokens: string[], clients: ClientEntry[]): string[] {
  const want = new Set(tokens.map((t) => t.toLowerCase()));
  return clients
    .filter(
      (c) =>
        c.ips.some((ip) => want.has(ip.toLowerCase())) ||
        c.macs.some((m) => want.has(m.toLowerCase())),
    )
    .map((c) => c.name);
}

function list(names: string[], max = 3): string {
  return names.length > max
    ? `${names.slice(0, max).join(", ")} +${names.length - max}`
    : names.join(", ");
}

/**
 * The state of the network in a few lines: new devices, profiles whose
 * schedule is on, tunnels, a sync to another box, paused devices and an
 * update waiting. Each line opens the page it is about.
 */
export function RightNow() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const visible = usePageVisible();
  const pause = usePause();
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const load = () =>
      Promise.allSettled([
        api.clients(200),
        api.getProfiles(),
        api.proxyStats(),
        api.getSync(),
        api.checkUpdate(),
      ]).then(([c, p, x, s, u]) => {
        if (!alive) return;
        setSnap({
          clients: value(c)?.clients ?? null,
          profiles: value(p),
          proxy: value(x),
          sync: value(s),
          update: value(u),
        });
      });
    void load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [visible]);

  const rows: Row[] = [];
  if (snap) {
    const now = Date.now() / 1000;
    const clients = snap.clients ?? [];

    if (snap.update && (snap.update.server.update_available || snap.update.web.update_available)) {
      const v = snap.update.server.update_available
        ? snap.update.server.latest
        : snap.update.web.latest;
      rows.push({
        key: "update",
        icon: ArrowUpCircle,
        tone: "ember",
        title: t("now.update", { version: v, defaultValue: "Version {{version}} is out" }),
        sub: t("now.update_sub", { defaultValue: "Install it from Settings" }),
        to: "/settings",
      });
    }

    for (const [name, e] of Object.entries(snap.proxy?.egresses ?? {})) {
      if (!e.alerting) continue;
      rows.push({
        key: `down-${name}`,
        icon: Waypoints,
        tone: "blocked",
        title: t("now.tunnel_down", { name, defaultValue: "{{name}} is down" }),
        sub: t("now.tunnel_down_sub", {
          defaultValue: "Traffic routed through it is failing",
        }),
        to: "/tunnels",
      });
    }

    if (pause.clientLeft.size > 0) {
      const soonest = Math.min(...pause.clientLeft.values());
      rows.push({
        key: "paused",
        icon: Pause,
        tone: "warn",
        title: t("now.devices_paused", {
          count: pause.clientLeft.size,
          defaultValue: "{{count}} devices unfiltered for now",
        }),
        sub: t("now.next_back", {
          time: fmtCountdown(soonest),
          defaultValue: "the first is back in {{time}}",
        }),
        to: "/clients",
      });
    }

    const fresh = clients.filter((c) => c.first_seen != null && now - c.first_seen < NEW_FOR);
    if (fresh.length > 0) {
      rows.push({
        key: "new",
        icon: UserPlus,
        tone: "upstream",
        title: t("now.new_devices", {
          count: fresh.length,
          defaultValue: "{{count}} new devices today",
        }),
        sub: list(fresh.map((c) => c.name)),
        to: "/clients",
      });
    } else if (snap.clients) {
      const active = clients.filter((c) => now - c.last_seen < ACTIVE_FOR).length;
      rows.push({
        key: "devices",
        icon: Users,
        tone: "muted",
        title: t("now.devices", { count: clients.length, defaultValue: "{{count}} devices" }),
        sub: t("now.devices_active", {
          count: active,
          defaultValue: "{{count}} active in the last 10 minutes",
        }),
        to: "/clients",
      });
    }

    const profiles = snap.profiles?.profiles ?? [];
    const on = profiles.filter((p) => p.schedule.length > 0 && snap.profiles?.active?.[p.id]);
    for (const p of on.slice(0, 2)) {
      const names = deviceNames(p.clients, clients);
      rows.push({
        key: `sched-${p.id}`,
        icon: Moon,
        tone: "warn",
        title: t("now.schedule_on", { name: p.name, defaultValue: "{{name}} is on" }),
        sub:
          names.length > 0
            ? list(names)
            : t("now.schedule_on_sub", { defaultValue: "its schedule applies now" }),
        to: "/profiles",
      });
    }
    if (on.length === 0 && profiles.length > 0) {
      rows.push({
        key: "profiles",
        icon: UserCog,
        tone: "muted",
        title: t("now.profiles", { count: profiles.length, defaultValue: "{{count}} profiles" }),
        sub: list(profiles.map((p) => p.name)),
        to: "/profiles",
      });
    }

    const egresses = Object.entries(snap.proxy?.egresses ?? {});
    if (egresses.length > 0 && egresses.every(([, e]) => !e.alerting)) {
      rows.push({
        key: "tunnels",
        icon: Waypoints,
        tone: "cached",
        title: t("now.tunnels_up", {
          count: egresses.length,
          defaultValue: "{{count}} tunnels up",
        }),
        sub: list(egresses.map(([name]) => name)),
        to: "/tunnels",
      });
    }

    const sync = snap.sync;
    if (sync && sync.primary) {
      const host = sync.primary.replace(/^https?:\/\//, "");
      rows.push(
        sync.status.error
          ? {
              key: "sync",
              icon: RefreshCw,
              tone: "warn",
              title: t("now.sync_failed", { defaultValue: "Sync with the primary failed" }),
              sub: sync.status.error,
              to: "/settings?tab=system",
            }
          : {
              key: "sync",
              icon: RefreshCw,
              tone: "muted",
              title: t("now.following", { host, defaultValue: "Following {{host}}" }),
              sub: sync.status.last_ok
                ? t("now.checked", {
                    when: relTime(sync.status.last_ok, i18n.language),
                    defaultValue: "checked {{when}}",
                  })
                : undefined,
              to: "/settings?tab=system",
            },
      );
    }
  }

  return (
    <Card className="flex h-full flex-col p-0">
      <h2 className="px-5 pt-5 pb-2 text-[15px] font-semibold text-heading">
        {t("now.title", { defaultValue: "Right now" })}
      </h2>
      {!snap ? (
        <div className="space-y-3 px-5 pt-2 pb-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-44" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] text-muted">
          {t("now.quiet", { defaultValue: "All quiet — nothing needs you." })}
        </p>
      ) : (
        <ul className="pb-2">
          {rows.map(({ key, icon: Icon, tone, title, sub, to }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => navigate(to)}
                className="group flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-white/3"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    TONE[tone],
                  )}
                >
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-heading">
                    {title}
                  </span>
                  {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
                </span>
                <ChevronRight
                  size={14}
                  className="shrink-0 text-muted/60 transition-colors group-hover:text-ember"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
