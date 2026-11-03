import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { deviceTokens } from "@/api/clients";
import type { BlocklistProfile, ClientEntry, ServiceCatalog } from "@/api/types";
import { cn } from "@/lib/utils";
import { fmt, fmtRelTime } from "@/lib/format";
import { DEVICE_ICON, deviceKind } from "@/lib/device-kind";
import { openDevicePanel } from "@/stores/device-panel";
import { describeWindow, useWeekdayNames } from "@/components/ScheduleEditor";

/** One tint per profile, in the order the profiles are listed. */
const TONES = [
  "bg-cached/12 text-cached",
  "bg-upstream/12 text-upstream",
  "bg-warn/12 text-warn",
  "bg-routed/12 text-routed",
  "bg-ember/12 text-ember",
];

export const profileTone = (i: number) => TONES[i % TONES.length];

export interface ProfileIndex {
  profiles: BlocklistProfile[];
  catalog: ServiceCatalog | null;
  /** The index of the profile a device is in, or null for the network-wide rules. */
  of: (c: ClientEntry) => number | null;
}

/** The saved profiles and which device each one holds. */
export function useProfileIndex(): ProfileIndex | null {
  const [profiles, setProfiles] = useState<BlocklistProfile[] | null>(null);
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getProfiles()
      .then((r) => alive && setProfiles(r.profiles))
      .catch(() => alive && setProfiles([]));
    api
      .serviceCatalog()
      .then((c) => alive && setCatalog(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    if (!profiles) return null;
    const byToken = new Map<string, number>();
    profiles.forEach((p, i) => {
      for (const tok of p.clients) {
        const k = tok.toLowerCase();
        if (!byToken.has(k)) byToken.set(k, i);
      }
    });
    const of = (c: ClientEntry) =>
      deviceTokens(c)
        .map((tok) => byToken.get(tok.toLowerCase()))
        .find((i) => i != null) ?? null;
    return { profiles, catalog, of };
  }, [profiles, catalog]);
}

export function ProfileChip({ index, name }: { index: number; name: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-xs font-medium",
        profileTone(index),
      )}
    >
      {name}
    </span>
  );
}

/** What a profile does, in one line. */
function useDescribe() {
  const { t } = useTranslation();
  const dayNames = useWeekdayNames();
  const everyDay = t("profiles.schedule_every_day", { defaultValue: "every day" });
  return (p: BlocklistProfile, catalog: ServiceCatalog | null): string => {
    const parts: string[] = [];
    if (p.default_deny) {
      parts.push(
        t("groups.allowlist_only", {
          defaultValue: "only what it allows gets through",
        }),
      );
    }
    const services = (catalog?.services ?? [])
      .filter((s) => p.services.includes(s.id))
      .map((s) => s.name);
    if (services.length > 0) {
      const shown =
        services.length > 4
          ? `${services.slice(0, 4).join(", ")} +${services.length - 4}`
          : services.join(", ");
      parts.push(t("groups.blocks", { list: shown, defaultValue: "blocks {{list}}" }));
    }
    if (p.schedule.length > 0) {
      parts.push(p.schedule.map((w) => describeWindow(w, dayNames, everyDay)).join("; "));
    }
    if (p.safe_search) parts.push("SafeSearch");
    if (p.youtube_restricted !== "off") {
      parts.push(
        t("groups.youtube", {
          level: t(`groups.youtube_${p.youtube_restricted}`, {
            defaultValue: p.youtube_restricted,
          }),
          defaultValue: "YouTube {{level}}",
        }),
      );
    }
    if (p.lists.length > 0) {
      parts.push(
        t("profiles.lists_n", { count: p.lists.length, defaultValue: "lists: {{count}}" }),
      );
    }
    if (p.block.length + p.allow.length > 0) {
      parts.push(
        t("profiles.own_rules_n", {
          count: p.block.length + p.allow.length,
          defaultValue: "own rules: {{count}}",
        }),
      );
    }
    return parts.join(" · ");
  };
}

function ipRank(ip: string): number {
  if (!ip.includes(":")) return 0;
  return ip.toLowerCase().startsWith("fe80:") ? 2 : 1;
}

function DeviceTile({ c }: { c: ClientEntry }) {
  const { t } = useTranslation();
  const Icon = DEVICE_ICON[deviceKind(c.name)];
  const ip = [...c.ips].sort((a, b) => ipRank(a) - ipRank(b))[0];
  const share = c.total > 0 ? (c.blocked / c.total) * 100 : 0;
  const live = Date.now() / 1000 - c.last_seen < 300;
  return (
    <button
      type="button"
      onClick={() => openDevicePanel({ macs: c.macs, ips: c.ips, name: c.name })}
      className="group flex flex-col gap-3 rounded-xl border border-bdr bg-card p-4 text-left transition-colors hover:border-ember/35"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-raised text-body">
          <Icon size={17} />
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-cached" : "bg-muted/40")} />
          {fmtRelTime(c.last_seen)}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold text-heading transition-colors group-hover:text-ember">
          {c.name}
        </span>
        {ip && <span className="block truncate font-mono text-[11px] text-muted">{ip}</span>}
      </span>
      <span className="space-y-1.5">
        <span className="block h-1.5 overflow-hidden rounded-full bg-bdr/70">
          <span
            className="block h-full rounded-full bg-blocked"
            style={{ width: `${Math.max(share, 1.5)}%` }}
          />
        </span>
        <span className="flex justify-between text-xs text-muted">
          <span>
            <span className="font-semibold text-heading tabular-nums">{share.toFixed(0)}%</span>{" "}
            {t("groups.blocked", { defaultValue: "blocked" })}
          </span>
          <span className="tabular-nums">
            {t("groups.queries", { n: fmt(c.total), defaultValue: "{{n}} queries" })}
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * Devices sorted into the profiles that hold them, each group saying what its
 * profile does — so who gets which rules reads off the page — then everyone
 * left on the network-wide rules.
 */
export function ProfileGroups({ clients, index }: { clients: ClientEntry[]; index: ProfileIndex }) {
  const { t } = useTranslation();
  const describe = useDescribe();
  const groups = index.profiles.map((p, i) => ({
    key: p.id,
    tone: i as number | null,
    name: p.name,
    does: describe(p, index.catalog),
    devices: clients.filter((c) => index.of(c) === i),
  }));
  const rest = clients.filter((c) => index.of(c) == null);
  groups.push({
    key: "__rest",
    tone: null,
    name: t("groups.everyone_else", { defaultValue: "Everyone else" }),
    does: t("groups.everyone_else_does", {
      defaultValue: "the network-wide blocklist and your own rules",
    }),
    devices: rest,
  });

  return (
    <div className="mb-4 space-y-7">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.name}>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {g.tone != null ? (
              <ProfileChip index={g.tone} name={g.name} />
            ) : (
              <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-medium text-body">
                {g.name}
              </span>
            )}
            <span className="text-xs text-muted tabular-nums">
              {t("groups.devices", { count: g.devices.length, defaultValue: "{{count}} devices" })}
            </span>
            {g.does && <span className="min-w-0 flex-1 text-[13px] text-body">{g.does}</span>}
            {g.tone != null && (
              <Link
                to="/profiles"
                className="text-xs text-muted transition-colors hover:text-ember"
              >
                {t("groups.edit", { defaultValue: "Edit profile" })}
              </Link>
            )}
          </div>
          {g.devices.length === 0 ? (
            <p className="rounded-xl border border-dashed border-bdr px-4 py-5 text-center text-xs text-muted">
              {t("groups.empty", { defaultValue: "No device seen lately is in this profile." })}
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
              {g.devices.map((c) => (
                <DeviceTile key={c.name} c={c} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
