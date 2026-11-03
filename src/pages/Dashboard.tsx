import { useEffect, useCallback, useState, useRef, useMemo, memo } from "react";
import type { ComponentType, ReactNode } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { AreaTrend } from "@/components/charts/AreaTrend";
import type { TrendSeries } from "@/components/charts/AreaTrend";
import {
  ArrowRight,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  ChevronDown,
} from "lucide-react";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/layout/Card";
import { Err } from "@/components/feedback/Err";
import { Notice } from "@/components/feedback/Notice";
import { Bar, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui";
import { usePageVisible } from "@/hooks/use-page-visible";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSettings } from "@/stores/settings";
import { QTYPE, RCODE_LABEL } from "@/lib/dns";
import { fmt, pct, formatBytes, formatUptime } from "@/lib/format";
import { DEVICE_ICON, deviceKind } from "@/lib/device-kind";
import { QuickRuleBtn } from "@/components/QuickRuleBtn";
import { RightNow } from "@/components/RightNow";
import { openDomainPanel } from "@/stores/domain-panel";
import { openDevicePanel } from "@/stores/device-panel";
import type { QuickRuleKind } from "@/hooks/use-quick-rule";
import type {
  SystemStats,
  QueryStatus,
  QueryEntry,
  StatsSummary,
  TimeseriesBucket,
  TopClientEntry,
} from "@/api/types";

const SUMMARY_REFRESH = 1_000;
const SYS_REFRESH = 5_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(ts: number) {
  const d = new Date(ts * 1000);
  return (
    d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0")
  );
}

const BUCKET_SIZE = 600;
const NUM_BUCKETS = 144;

type ChartPoint = ReturnType<typeof buildChartData>[number];

function buildChartData(buckets: TimeseriesBucket[]) {
  const map = new Map(buckets.map((b) => [b.bucket, b]));
  const now = Math.floor(Date.now() / 1000);
  const latest = Math.floor(now / BUCKET_SIZE) * BUCKET_SIZE;
  const first = latest - (NUM_BUCKETS - 1) * BUCKET_SIZE;
  return Array.from({ length: NUM_BUCKETS }, (_, i) => {
    const ts = first + i * BUCKET_SIZE;
    const b = map.get(ts);
    return {
      t: fmtTime(ts),
      Queries: b?.total ?? 0,
      Blocked: b?.blocked ?? 0,
      Cached: b?.cached ?? 0,
      Upstream: b?.upstream ?? 0,
    };
  });
}

type TopHours = 0 | 24 | 168;

interface HistoricalTop {
  domains: [string, number][];
  blocked: [string, number][];
  clients: TopClientEntry[];
}

// ── Totals ────────────────────────────────────────────────────────────────────

function Figure({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted text-[13px]">{label}</p>
      <p
        className={cn(
          "mt-1 text-[30px] font-semibold leading-tight tracking-[-0.02em] tabular-nums sm:text-[34px]",
          className ?? "text-heading",
        )}
      >
        {value}
      </p>
      <p className="text-muted mt-1 text-xs">{sub}</p>
    </div>
  );
}

/**
 * Where every query went, in one card: the four totals, then a single bar
 * splitting them — blocked, answered from cache, asked upstream — so the
 * proportions read at a glance instead of from five separate charts.
 */
function TotalsCard({ stats }: { stats: StatsSummary }) {
  const { t } = useTranslation();
  const total = stats.total_queries;
  const parts = [
    {
      key: "blocked",
      value: stats.blocked_queries,
      cls: "bg-blocked",
      label: t("dashboard.blocked"),
    },
    { key: "cached", value: stats.cached_queries, cls: "bg-cached", label: t("dashboard.cached") },
    {
      key: "upstream",
      value: stats.upstream_queries,
      cls: "bg-muted/50",
      label: t("dashboard.upstream"),
    },
  ];
  const rest = Math.max(0, total - parts.reduce((n, p) => n + p.value, 0));
  return (
    <Card className="mb-4 p-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 xl:grid-cols-4">
        <Figure
          label={t("dashboard.total_queries")}
          value={fmt(total)}
          sub={t("dashboard.since_last_start")}
        />
        <Figure
          label={t("dashboard.blocked")}
          value={fmt(stats.blocked_queries)}
          sub={`${pct(stats.blocked_queries, total)} ${t("dashboard.of_traffic")}`}
          className="text-blocked"
        />
        <Figure
          label={t("dashboard.cached")}
          value={fmt(stats.cached_queries)}
          sub={`${pct(stats.cached_queries, total)} ${t("dashboard.cache_rate")}`}
          className="text-cached"
        />
        <Figure
          label={t("dashboard.upstream")}
          value={fmt(stats.upstream_queries)}
          sub={`${pct(stats.upstream_queries, total)} ${t("dashboard.forwarded")}`}
        />
      </div>
      <div
        className="bg-bdr/50 mt-6 flex h-2 gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={parts.map((p) => `${p.label} ${pct(p.value, total)}`).join(", ")}
      >
        {total > 0 &&
          parts.map(
            (p) =>
              p.value > 0 && <div key={p.key} className={p.cls} style={{ flexGrow: p.value }} />,
          )}
        {total > 0 && rest > 0 && <div className="bg-raised" style={{ flexGrow: rest }} />}
      </div>
      <div className="text-muted mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
        {parts.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-sm", p.cls)} />
            {p.label}
          </span>
        ))}
        <span className="sm:ml-auto">
          {t("dashboard.blocklist_size", {
            n: fmt(stats.total_domains_blocked),
            defaultValue: "{{n}} domains on the blocklist",
          })}
        </span>
      </div>
    </Card>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────

const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; color: string; value: number }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="border-bdr bg-sidebar rounded-xs space-y-1 border px-3 py-2.5 text-xs shadow-xl">
      <p className="text-muted mb-1.5 tabular-nums">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.color }} />
          <span className="text-body">{p.name}</span>
          <span className="text-heading ml-auto font-semibold tabular-nums">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ── Domain rows ───────────────────────────────────────────────────────────────

function DomainRows({
  rows,
  barColor,
  textColor,
  onRowClick,
  quickRule,
}: {
  rows: [string, number][];
  barColor: string;
  textColor: string;
  onRowClick: (label: string) => void;
  /** The one-click rule each row offers: block a queried domain, allow a blocked one. */
  quickRule: QuickRuleKind;
}) {
  const { t } = useTranslation();
  const max = rows[0]?.[1] ?? 1;
  if (rows.length === 0) return <p className="text-muted py-2 text-xs">{t("dashboard.no_data")}</p>;
  return (
    <div className="space-y-1">
      {rows.slice(0, 10).map(([label, count], i) => (
        // A div, not a button: the row holds the quick-rule button of its own.
        <div
          key={label}
          role="button"
          tabIndex={0}
          onClick={() => onRowClick(label)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRowClick(label);
            }
          }}
          className="hover:bg-white/4 group w-full cursor-pointer rounded-lg px-2 py-1.5 text-left transition-colors"
        >
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <span className="mono text-muted w-4 shrink-0 text-right text-[10px] tabular-nums">
                {i + 1}
              </span>
              <span
                className={cn(
                  "mono group-hover:text-ember truncate text-[13px] transition-colors",
                  textColor,
                )}
              >
                {label}
              </span>
              <QuickRuleBtn domain={label} kind={quickRule} />
            </div>
            <span className="mono text-muted ml-3 shrink-0 tabular-nums">{fmt(count)}</span>
          </div>
          <Bar value={(count / max) * 100} color={barColor} className="h-1" />
        </div>
      ))}
    </div>
  );
}

// ── Range buttons ─────────────────────────────────────────────────────────────

const RANGES: { label: string; value: TopHours }[] = [
  { label: "Live", value: 0 },
  { label: "24h", value: 24 },
  { label: "7d", value: 168 },
];

function RangeButtons({
  value,
  loading,
  onChange,
}: {
  value: TopHours;
  loading: boolean;
  onChange: (h: TopHours) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {RANGES.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          disabled={loading && r.value !== value}
          className={cn(
            "rounded-md px-2 py-1 text-xs transition-colors disabled:opacity-40",
            value === r.value ? "bg-raised text-heading" : "text-muted hover:text-heading",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

// ── Top domains card ──────────────────────────────────────────────────────────

function TopDomains({
  topQueried,
  topBlocked,
  topHours,
  topLoading,
  onRangeChange,
}: {
  topQueried: [string, number][];
  topBlocked: [string, number][];
  topHours: TopHours;
  topLoading: boolean;
  onRangeChange: (h: TopHours) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className={cn("h-full", topLoading && "pointer-events-none opacity-60")}>
      <Tabs defaultValue="queried" className="w-full">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-heading text-[15px] font-semibold">
            {t("dashboard.top_domains", { defaultValue: "Top domains" })}
          </h2>
          <RangeButtons value={topHours} loading={topLoading} onChange={onRangeChange} />
        </div>
        <TabsList className="mb-3">
          <TabsTrigger value="queried">{t("dashboard.top_queried")}</TabsTrigger>
          <TabsTrigger value="blocked">{t("dashboard.top_blocked")}</TabsTrigger>
        </TabsList>
        <TabsContent value="queried">
          <DomainRows
            rows={topQueried}
            barColor="bg-muted/55"
            textColor="text-body"
            onRowClick={(d) => openDomainPanel(d)}
            quickRule="block"
          />
        </TabsContent>
        <TabsContent value="blocked">
          <DomainRows
            rows={topBlocked}
            barColor="bg-blocked"
            textColor="text-body"
            onRowClick={(d) => openDomainPanel(d)}
            quickRule="allow"
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

// ── Top clients card ──────────────────────────────────────────────────────────

/** A whole-number share; "<1%" rather than a misleading 0% for a few. */
function share(part: number, total: number): string {
  const v = (part / total) * 100;
  return v > 0 && v < 1 ? "<1%" : `${Math.round(v)}%`;
}

function TopClients({
  rows,
  topLoading,
  navigate,
}: {
  rows: TopClientEntry[];
  topLoading: boolean;
  navigate: (to: string) => void;
}) {
  const { t } = useTranslation();
  const max = rows[0]?.total ?? 1;
  return (
    <Card className={cn("h-full", topLoading && "pointer-events-none opacity-60")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-heading text-[15px] font-semibold">{t("dashboard.top_clients")}</h2>
        <button
          type="button"
          onClick={() => navigate("/clients")}
          className="text-muted hover:text-ember flex items-center gap-1 text-xs transition-colors"
        >
          {t("dashboard.all_clients", { defaultValue: "All clients" })} <ArrowRight size={11} />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted py-2 text-xs">{t("dashboard.no_data")}</p>
      ) : (
        <div className="space-y-1">
          {rows.slice(0, 10).map((c, i) => {
            const DeviceIcon = DEVICE_ICON[deviceKind(c.name)];
            const blocked = c.blocked ?? null;
            return (
              <button
                key={c.name}
                onClick={() => openDevicePanel({ macs: c.macs, ips: c.ips, name: c.name })}
                className="hover:bg-white/4 group w-full cursor-pointer rounded-lg px-2 py-1.5 text-left transition-colors"
              >
                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="mono text-muted w-4 shrink-0 text-right text-[10px] tabular-nums">
                      {i + 1}
                    </span>
                    <DeviceIcon size={13} className="text-muted shrink-0" />
                    <span className="text-body group-hover:text-ember truncate text-[13px] transition-colors">
                      {c.name}
                    </span>
                  </div>
                  <span className="flex shrink-0 items-baseline gap-3">
                    {blocked != null && c.total > 0 && (
                      <span
                        className="text-blocked/90 mono text-[11px] tabular-nums"
                        title={t("dashboard.share_blocked", { defaultValue: "share blocked" })}
                      >
                        {share(blocked, c.total)}
                      </span>
                    )}
                    <span className="mono text-muted w-12 text-right tabular-nums">
                      {fmt(c.total)}
                    </span>
                  </span>
                </div>
                <div className="bg-bdr/70 relative h-1 overflow-hidden rounded-full">
                  <div
                    className="bg-muted/45 absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${(c.total / max) * 100}%` }}
                  />
                  {blocked != null && (
                    <div
                      className="bg-blocked absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${(blocked / max) * 100}%` }}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Live feed ─────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<QueryStatus, string> = {
  allowed: "bg-ember",
  blocked: "bg-blocked",
  cached: "bg-cached",
  upstream: "bg-upstream",
  routed: "bg-routed",
};

const STATUS_LABEL: Record<QueryStatus, string> = {
  allowed: "text-ember/70",
  blocked: "text-blocked/80",
  cached: "text-cached/70",
  upstream: "text-upstream/70",
  routed: "text-routed/70",
};

function FeedRows({ rows }: { rows: QueryEntry[] }) {
  const { t } = useTranslation();
  if (rows.length === 0)
    return <p className="text-muted py-2 text-xs">{t("dashboard.no_queries")}</p>;
  return (
    <div className="space-y-1">
      {rows.slice(0, 11).map((r) => {
        // A blocked row says why already; its RCODE is whatever block_response chose.
        const showRcode = r.rcode !== 0 && r.status !== "blocked";
        const isCname = r.upstream?.startsWith("cname:") ?? false;
        const resolver =
          !isCname && r.status === "upstream" && r.upstream
            ? r.upstream.replace(/:\d+$/, "")
            : null;
        const cnameTarget = isCname ? r.upstream!.slice(6) : null;

        return (
          <button
            key={r.id}
            onClick={() => openDomainPanel(r.domain, r.client_ip)}
            className="hover:bg-white/4 group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors"
          >
            <span
              className={cn("h-1.5 w-1.5 shrink-0 self-center rounded-full", STATUS_DOT[r.status])}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="mono text-body group-hover:text-ember block truncate text-[13px] transition-colors">
                  {r.domain}
                </span>
                {QTYPE[r.query_type] && (
                  <span className="text-muted/50 shrink-0 text-[9px]">{QTYPE[r.query_type]}</span>
                )}
              </span>
              <span className="text-muted/60 flex items-baseline gap-2 text-[10px]">
                <span className="truncate">{r.client_name ?? r.client_ip}</span>
                {resolver && <span className="text-muted/40 tabular-nums">{resolver}</span>}
                {cnameTarget && (
                  <span className="max-w-28 text-blocked/50 truncate">{cnameTarget}</span>
                )}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5">
              <span className={cn("text-[10px] font-medium", STATUS_LABEL[r.status])}>
                {r.status}
              </span>
              <span className="text-[10px] tabular-nums">
                {showRcode ? (
                  <span className="text-warn/70">{RCODE_LABEL[r.rcode] ?? `rcode ${r.rcode}`}</span>
                ) : r.status === "upstream" && r.latency_ms > 0 ? (
                  <span className="text-muted">{r.latency_ms}ms</span>
                ) : (
                  <span className="text-muted">
                    {fmtTime(Math.floor(new Date(r.timestamp).getTime() / 1000))}
                  </span>
                )}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LiveFeed({
  rows,
  recentBlocked,
  navigate,
}: {
  rows: QueryEntry[];
  recentBlocked: QueryEntry[];
  navigate: (to: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="flex h-full flex-col">
      <Tabs defaultValue="all" className="flex flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-heading text-[15px] font-semibold">
            {t("dashboard.just_now", { defaultValue: "Just now" })}
          </h2>
          <span className="text-ember flex items-center gap-1.5 text-xs">
            <span className="bg-ember h-1.5 w-1.5 animate-pulse rounded-full" />
            {t("dashboard.live")}
          </span>
        </div>
        <TabsList className="mb-3">
          <TabsTrigger value="all">{t("dashboard.all")}</TabsTrigger>
          <TabsTrigger value="blocked">{t("dashboard.blocked")}</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <FeedRows rows={rows} />
        </TabsContent>
        <TabsContent value="blocked">
          <FeedRows rows={recentBlocked} />
        </TabsContent>
      </Tabs>

      <button
        onClick={() => navigate("/queries")}
        className="border-bdr/70 text-muted hover:text-ember mt-auto flex items-center gap-1 border-t pt-4 text-xs transition-colors"
      >
        {t("dashboard.view_all_queries")} <ArrowRight size={11} />
      </button>
    </Card>
  );
}

// ── System stats ──────────────────────────────────────────────────────────────

function boundedPercent(percent: number | null | undefined) {
  if (percent == null || !Number.isFinite(percent)) return null;
  return Math.min(Math.max(percent, 0), 100);
}

function SystemTrack({ percent, color }: { percent: number | null | undefined; color: string }) {
  const width = boundedPercent(percent);

  return (
    <div className="bg-bdr/70 relative h-1.5 w-full overflow-hidden rounded-full">
      {width == null ? (
        <div className="absolute inset-y-0 left-0 w-8 rounded-full bg-white/10" />
      ) : (
        <div
          className={`absolute h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${width}%` }}
        />
      )}
    </div>
  );
}

function SystemMetric({
  label,
  value,
  percent,
  color,
  detail,
  icon: Icon,
  showPercentBadge = true,
}: {
  label: string;
  value: ReactNode;
  percent: number | null | undefined;
  color: string;
  detail?: ReactNode;
  icon: ComponentType<{ size?: number; className?: string }>;
  showPercentBadge?: boolean;
}) {
  const shownPercent = boundedPercent(percent);

  return (
    <div className="border-bdr/55 bg-void/18 min-h-30 rounded-xs flex flex-col justify-between border p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted flex items-center gap-1.5 text-xs font-semibold">
            <Icon size={12} className="text-ember/80 shrink-0" />
            <span className="truncate">{label}</span>
          </p>
          <div className="text-heading mt-2 min-w-0 text-base font-semibold tabular-nums sm:text-lg">
            {value}
          </div>
        </div>
        {showPercentBadge && shownPercent != null && (
          <span className="text-muted/70 shrink-0 text-[10px] tabular-nums">
            {shownPercent.toFixed(1)}%
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <div className="text-muted/70 min-h-4 text-[10px] tabular-nums">{detail ?? ""}</div>
        <SystemTrack percent={percent} color={color} />
      </div>
    </div>
  );
}

/** One figure in the collapsed system strip: label, value, a thin gauge. */
function StripMetric({
  label,
  value,
  percent,
  color,
}: {
  label: string;
  value: ReactNode;
  percent?: number | null;
  color?: string;
}) {
  const width = boundedPercent(percent);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="text-muted text-[13px]">{label}</span>
      <span className="text-heading mono text-[13px] tabular-nums">{value}</span>
      {width != null && color && (
        <span className="bg-bdr/70 relative hidden h-1 w-12 overflow-hidden rounded-full sm:block">
          <span
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${color}`}
            style={{ width: `${width}%` }}
          />
        </span>
      )}
    </span>
  );
}

/**
 * The box's health. A DNS box is almost always idle, so by default it is one
 * strip of figures; "Details" opens the full gauges, and the choice is kept.
 */
function SystemBar({ sys }: { sys: SystemStats }) {
  const { t } = useTranslation();
  const [expandedPref, setExpandedPref] = useLocalStorage("ferrite.dashboard.system", "0");
  const expanded = expandedPref === "1";
  const cpuColor =
    sys.cpu_usage_percent > 85
      ? "bg-blocked/70"
      : sys.cpu_usage_percent > 60
        ? "bg-warn/60"
        : "bg-ember/60";

  const memColor =
    sys.memory.used_percent > 85
      ? "bg-blocked/70"
      : sys.memory.used_percent > 70
        ? "bg-warn/60"
        : "bg-upstream/60";

  const diskColor =
    sys.disk && sys.disk.used_percent > 85
      ? "bg-blocked/70"
      : sys.disk && sys.disk.used_percent > 70
        ? "bg-warn/60"
        : "bg-ember/45";

  const swapColor =
    sys.swap.used_percent > 75
      ? "text-blocked"
      : sys.swap.used_percent > 50
        ? "text-warn"
        : "text-upstream";

  const hasSwap = sys.swap.total_bytes > 0;
  const memoryDetail =
    sys.memory.available_bytes != null || sys.memory.reclaimable_bytes != null ? (
      <span className="flex flex-wrap gap-x-3 gap-y-0.5">
        {sys.memory.available_bytes != null && (
          <span>
            {t("dashboard.available")} {formatBytes(sys.memory.available_bytes)}
          </span>
        )}
        {sys.memory.reclaimable_bytes != null && (
          <span>
            {t("dashboard.reclaimable")} {formatBytes(sys.memory.reclaimable_bytes)}
          </span>
        )}
      </span>
    ) : null;

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1 py-1">
        <span className="text-muted text-[13px]">
          {t("dashboard.uptime")}{" "}
          <span className="text-heading mono">{formatUptime(sys.uptime_seconds)}</span>
        </span>
        <StripMetric
          label="CPU"
          value={`${sys.cpu_usage_percent.toFixed(1)}%`}
          percent={sys.cpu_usage_percent}
          color={cpuColor}
        />
        <StripMetric
          label="RAM"
          value={formatBytes(sys.memory.used_bytes)}
          percent={sys.memory.used_percent}
          color={memColor}
        />
        {sys.disk && (
          <StripMetric
            label="Disk"
            value={`${sys.disk.used_percent.toFixed(0)}%`}
            percent={sys.disk.used_percent}
            color={diskColor}
          />
        )}
        <StripMetric
          label="Net"
          value={`↓ ${formatBytes(sys.network.rx_bytes_per_sec)}/s ↑ ${formatBytes(sys.network.tx_bytes_per_sec)}/s`}
        />
        <span className="text-muted hidden text-[13px] lg:inline">
          {t("dashboard.load")}{" "}
          <span className="text-heading mono tabular-nums">
            {sys.load_avg.one.toFixed(2)}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setExpandedPref(expanded ? "0" : "1")}
          aria-expanded={expanded}
          className="text-muted hover:text-ember ml-auto flex items-center gap-1 text-xs transition-colors"
        >
          {expanded
            ? t("dashboard.system_less", { defaultValue: "Less" })
            : t("dashboard.system_more", { defaultValue: "Details" })}
          <ChevronDown size={12} className={cn("transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {expanded && (
        <Card className="mt-3 overflow-hidden p-0">
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-4">
        <SystemMetric
          label={t("dashboard.cpu").toUpperCase()}
          icon={Cpu}
          percent={sys.cpu_usage_percent}
          color={cpuColor}
          value={
            <span className="flex min-w-0 items-baseline gap-1.5">
              {sys.cpu_usage_percent.toFixed(1)}%
            </span>
          }
          detail={
            sys.cpu_temp_celsius != null
              ? `${sys.cpu_temp_celsius.toFixed(0)}°C`
              : t("dashboard.sensor_unavailable")
          }
          showPercentBadge={false}
        />
        <SystemMetric
          label="RAM"
          icon={MemoryStick}
          percent={sys.memory.used_percent}
          color={memColor}
          detail={memoryDetail}
          value={
            <span>
              {formatBytes(sys.memory.used_bytes)}
              <span className="text-muted font-normal">
                {" "}
                / {formatBytes(sys.memory.total_bytes)}
              </span>
            </span>
          }
        />
        <SystemMetric
          label={sys.disk ? `Disk ${sys.disk.mount}` : "Disk"}
          icon={HardDrive}
          percent={sys.disk?.used_percent}
          color={diskColor}
          detail={sys.disk ? null : t("common.no_data")}
          value={
            sys.disk ? (
              <span>
                {formatBytes(sys.disk.used_bytes)}
                <span className="text-muted font-normal">
                  {" "}
                  / {formatBytes(sys.disk.total_bytes)}
                </span>
              </span>
            ) : (
              "—"
            )
          }
        />
        <div className="border-bdr/55 bg-void/18 min-h-30 rounded-xs flex flex-col justify-between border p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-muted flex items-center gap-1.5 text-xs font-semibold">
                <Network size={12} className="text-ember/80 shrink-0" />
                NET
              </p>
              <div className="text-heading mt-2 text-base font-semibold tabular-nums sm:text-lg">
                {formatBytes(sys.network.rx_bytes_per_sec)}/s
              </div>
            </div>
            <span className="text-muted/70 shrink-0 text-[10px] tabular-nums">
              {formatBytes(sys.network.tx_bytes_per_sec)}/s
            </span>
          </div>

          <div className="mt-3 space-y-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-muted/70">Net ↓</span>
                <span className="text-heading tabular-nums">
                  {formatBytes(sys.network.rx_bytes_per_sec)}/s
                </span>
              </div>
              <SystemTrack percent={sys.network.rx_utilization_percent} color="bg-ember/55" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-[10px]">
                <span className="text-muted/70">Net ↑</span>
                <span className="text-heading tabular-nums">
                  {formatBytes(sys.network.tx_bytes_per_sec)}/s
                </span>
              </div>
              <SystemTrack percent={sys.network.tx_utilization_percent} color="bg-upstream/55" />
            </div>
          </div>
        </div>
      </div>

      <div className="border-bdr/50 flex flex-wrap items-center gap-x-5 gap-y-1 border-t px-4 py-3">
        {sys.process && (
          <>
            <span className="text-muted flex items-center gap-1.5 text-xs font-semibold">
              <span className="bg-ember/70 h-1.5 w-1.5 rounded-full" />
              ferrite
            </span>
            <span className="text-xs">
              <span className="text-muted">{t("dashboard.mem")} </span>
              <span className="text-heading font-medium tabular-nums">
                {formatBytes(sys.process.memory_bytes)}
              </span>
            </span>
            <span className="text-xs">
              <span className="text-muted">{t("dashboard.cpu")} </span>
              <span className="text-heading font-medium tabular-nums">
                {sys.process.cpu_percent.toFixed(2)}%
              </span>
            </span>
            <span className="text-muted/50 text-[11px] tabular-nums">
              {sys.process.memory_percent.toFixed(2)}
              {t("dashboard.of_ram")}
            </span>
          </>
        )}
        <span className={cn("text-xs tabular-nums", hasSwap ? swapColor : "text-muted/55")}>
          <span className="text-muted">{hasSwap ? "swap " : ""}</span>
          {hasSwap ? (
            <>
              {formatBytes(sys.swap.used_bytes)}
              <span className="text-muted font-normal"> / {formatBytes(sys.swap.total_bytes)}</span>
            </>
          ) : (
            t("dashboard.swap_off")
          )}
        </span>
      </div>
        </Card>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <>
      <div
        className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 xl:[&>*:last-child:nth-child(odd)]:col-span-1"
      >
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <Skeleton className="mb-3 h-2.5 w-16" />
            <Skeleton className="mb-2 h-7 w-20" />
            <Skeleton className="h-2 w-12" />
          </Card>
        ))}
      </div>
      <Card className="mb-5">
        <Skeleton className="mb-5 h-2.5 w-40" />
        <Skeleton className="rounded-xs h-44 w-full" />
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <Skeleton className="rounded-xs mb-4 h-5 w-40" />
              {[...Array(5)].map((__, j) => (
                <div key={j} className="mb-3">
                  <div className="mb-1.5 flex justify-between">
                    <Skeleton className="h-3 w-36" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                  <Skeleton className="h-1 w-full" />
                </div>
              ))}
            </Card>
          ))}
        </div>
        <Card>
          <Skeleton className="mb-4 h-2.5 w-20" />
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 py-1.5">
              <Skeleton className="h-1.5 w-1.5 rounded-full" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="ml-auto h-3 w-12" />
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

/** The four lines the traffic chart draws, in the order they stack visually. */
const TRAFFIC_SERIES: TrendSeries<ChartPoint>[] = [
  { key: "Queries", label: "All queries", color: "#a89a8b", strokeWidth: 1.8, fillOpacity: 0.12 },
  { key: "Blocked", label: "Blocked", color: "#ff5c5c", strokeWidth: 1.8, fillOpacity: 0.2 },
];

/**
 * The 24-hour traffic chart, kept out of the page's render.
 *
 * The dashboard polls two things on their own five-second timers — the summary
 * and the system stats — and every tick of either used to re-render this card.
 * Recharts then rebuilt an SVG of 144 points across four series for a number in
 * the CPU gauge changing. `chartData` only changes when the summary does, so
 * memoising on it leaves the chart alone the rest of the time.
 */
const TrafficChart = memo(function TrafficChart({ data }: { data: ChartPoint[] }) {
  const { t } = useTranslation();
  return (
    <Card className="h-full overflow-hidden p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <h2 className="text-heading text-[15px] font-semibold">{t("dashboard.traffic_chart")}</h2>
          <span className="text-muted text-xs">
            {t("dashboard.traffic_sub", { defaultValue: "last 24 hours, per 10 minutes" })}
          </span>
        </div>
        <div className="text-muted flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full bg-[#a89a8b]" />
            {t("dashboard.all_queries", { defaultValue: "All queries" })}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-blocked h-0.5 w-3.5 rounded-full" />
            {t("dashboard.blocked")}
          </span>
        </div>
      </div>
      <AreaTrend
        data={data}
        labelKey="t"
        series={TRAFFIC_SERIES}
        tooltip={(point, values) => (
          <ChartTooltip active label={point.t} payload={values.map((v) => ({ ...v, name: v.label }))} />
        )}
      />
    </Card>
  );
});

export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [sysStats, setSysStats] = useState<SystemStats | null>(null);
  const [err, setErr] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // Statistics can be switched off in Settings -> Privacy: the counters below
  // keep working, the top lists and the graph deliberately stay empty. Read
  // from the shared store, so toggling the switch anywhere updates this banner
  // without a remount.
  const statsDisabled = useSettings()?.storage?.keep_stats === false;

  // Top domains / clients time range
  const [topHours, setTopHours] = useState<TopHours>(0);
  const [historicalTop, setHistoricalTop] = useState<HistoricalTop | null>(null);
  const [topLoading, setTopLoading] = useState(false);
  const topFetchId = useRef(0);

  const fetchAll = useCallback(async () => {
    try {
      setStats(await api.statsSummary());
      setUpdatedAt(new Date());
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  const sysFetchId = useRef(0);
  const fetchSys = useCallback(async () => {
    // setInterval doesn't wait for the async callback, so a slow request can
    // overlap the next tick. Guard with a sequence id so a late older response
    // can't overwrite a newer snapshot (matches the topFetchId pattern below).
    const id = ++sysFetchId.current;
    try {
      const data = await api.statsSystem();
      if (id === sysFetchId.current) setSysStats(data);
    } catch {
      /* optional — ignore if unavailable */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let timer: number | undefined;

    const schedule = (delay = SUMMARY_REFRESH) => {
      // Hidden tab: stop polling entirely; rescheduleForVisibility re-arms
      // the loop as soon as the tab becomes visible again.
      if (document.visibilityState === "hidden") return;
      timer = window.setTimeout(tick, delay);
    };

    const tick = async () => {
      if (running) return;
      running = true;
      await fetchAll();
      running = false;
      if (!cancelled) schedule();
    };

    const rescheduleForVisibility = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (!running && !cancelled) schedule(250);
    };

    tick();
    document.addEventListener("visibilitychange", rescheduleForVisibility);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", rescheduleForVisibility);
    };
  }, [fetchAll]);

  // System stats poll pauses in hidden tabs and catches up on return.
  const pageVisible = usePageVisible();
  useEffect(() => {
    if (!pageVisible) return;
    fetchSys();
    const sysRefresh = window.setInterval(fetchSys, SYS_REFRESH);
    return () => {
      clearInterval(sysRefresh);
    };
  }, [fetchSys, pageVisible]);

  useEffect(() => {
    if (topHours === 0) {
      setHistoricalTop(null);
      return;
    }
    const id = ++topFetchId.current;
    setTopLoading(true);
    Promise.all([
      api.statsTopDomains({ hours: topHours, limit: 10 }),
      api.statsTopBlocked({ hours: topHours, limit: 10 }),
      api.statsTopClients({ hours: topHours, limit: 10 }),
    ])
      .then(([d, b, c]) => {
        if (id !== topFetchId.current) return;
        setHistoricalTop({
          domains: d.domains.map((x) => [x.domain, x.count]),
          blocked: b.domains.map((x) => [x.domain, x.count]),
          clients: c.clients,
        });
      })
      .catch((e) => console.error("Failed to fetch top stats:", e))
      .finally(() => {
        if (id === topFetchId.current) setTopLoading(false);
      });
  }, [topHours]);

  const chartData = useMemo(() => (stats ? buildChartData(stats.timeseries) : []), [stats]);

  const effectiveDomains = useMemo(
    () => (topHours === 0 ? (stats?.top_domains ?? []) : (historicalTop?.domains ?? [])),
    [topHours, stats, historicalTop],
  );
  const effectiveBlocked = useMemo(
    () => (topHours === 0 ? (stats?.top_blocked ?? []) : (historicalTop?.blocked ?? [])),
    [topHours, stats, historicalTop],
  );
  const effectiveClients = useMemo(
    () => (topHours === 0 ? (stats?.top_clients ?? []) : (historicalTop?.clients ?? [])),
    [topHours, stats, historicalTop],
  );

  return (
    <PageContainer>
      <PageHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        action={
          <span className="text-muted flex items-center gap-1.5 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="bg-ember absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
              <span className="bg-ember relative inline-flex h-2 w-2 rounded-full" />
            </span>
            {t("dashboard.live")} ·{" "}
            {updatedAt ? updatedAt.toLocaleTimeString() : t("dashboard.live_interval")}
          </span>
        }
      />

      {err && <Err msg={err} />}
      {statsDisabled && <Notice>{t("dashboard.stats_disabled")}</Notice>}
      {!stats && !err && <DashboardSkeleton />}

      {stats && stats.dropped_stats > 0 && (
        <div className="border-blocked/40 bg-blocked/5 text-blocked rounded-xs mb-4 border px-3 py-2 text-xs">
          {t("dashboard.dropped_stats_warning", {
            count: stats.dropped_stats,
            defaultValue:
              "{{count}} query stats were dropped under load — counters and the live feed may be undercounting.",
          })}
        </div>
      )}

      {stats && (
        <>
          <TotalsCard stats={stats} />

          {/* ── System stats ───────────────────────────────────────────────── */}
          {sysStats && <SystemBar sys={sysStats} />}

          {/* ── Traffic, and what needs a look ─────────────────────────────── */}
          <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <TrafficChart data={chartData} />
            </div>
            <RightNow />
          </div>

          {/* ── Top lists and the live feed ────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <TopDomains
              topQueried={effectiveDomains}
              topBlocked={effectiveBlocked}
              topHours={topHours}
              topLoading={topLoading}
              onRangeChange={setTopHours}
            />
            <TopClients rows={effectiveClients} topLoading={topLoading} navigate={navigate} />
            <LiveFeed
              rows={stats.recent_domains}
              recentBlocked={stats.recent_blocked}
              navigate={navigate}
            />
          </div>
        </>
      )}
    </PageContainer>
  );
}
