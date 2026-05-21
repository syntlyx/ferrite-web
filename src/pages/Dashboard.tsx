import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Activity,
  Zap,
  Globe,
  Database,
  ArrowRight,
  Shield,
  ServerCog,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
} from "lucide-react";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/layout/Card";
import { Err } from "@/components/feedback/Err";
import { Bar, Skeleton, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui";
import { QTYPE, RCODE_LABEL } from "@/lib/dns";
import { fmt, pct, formatBytes, formatUptime } from "@/lib/format";
import type {
  SystemStats,
  QueryStatus,
  QueryEntry,
  StatsSummary,
  TimeseriesBucket,
  TopClientEntry,
} from "@/api/types";

const SUMMARY_REFRESH_ACTIVE = 1_000;
const SUMMARY_REFRESH_BACKGROUND = 5_000;
const SYS_REFRESH = 5_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(ts: number) {
  const d = new Date(ts * 1000);
  return (
    d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0")
  );
}

const isIpv4 = (s: string) => /^\d+\.\d+\.\d+\.\d+$/.test(s);

function summaryRefreshDelay() {
  return document.visibilityState === "hidden"
    ? SUMMARY_REFRESH_BACKGROUND
    : SUMMARY_REFRESH_ACTIVE;
}

const BUCKET_SIZE = 600;
const NUM_BUCKETS = 144;

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

function sparkPath(values: number[], width: number, height: number) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function MiniSparkline({ values, color, id }: { values?: number[]; color: string; id: string }) {
  if (!values || values.length < 2) return null;
  const width = 320;
  const height = 30;
  const path = sparkPath(values.slice(-48), width, height);
  if (!path) return null;

  return (
    <svg
      className="h-8 w-full overflow-visible"
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${width} ${height + 2} L 0 ${height + 2} Z`} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  textColor,
  lineColor,
  bgColor,
  sparkColor,
  sparkValues,
  sparkId,
  icon: Icon,
  right,
  delay,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  textColor: string;
  lineColor: string;
  bgColor: string;
  sparkColor: string;
  sparkValues?: number[];
  sparkId: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  delay?: number;
  right?: ReactNode;
}) {
  return (
    <div
      className="control-surface min-h-32 animate-fade-up border-bdr/85 group relative overflow-hidden rounded-lg border p-4 transition-transform duration-200 hover:-translate-y-0.5"
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      <div
        className={`bg-linear-to-r absolute inset-x-0 top-0 h-px from-transparent ${lineColor} to-transparent`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted mb-1.5 text-[10px] font-semibold uppercase tracking-wider">
            {label}
          </p>
          <p className={cn("text-2xl font-semibold tabular-nums", textColor)}>{value}</p>
          {sub && <p className="text-muted mt-1 text-[11px]">{sub}</p>}
        </div>
        {right ??
          (Icon && (
            <div className={cn("border-current/10 shrink-0 rounded-full border p-2.5", bgColor)}>
              <Icon size={16} className={textColor} />
            </div>
          ))}
      </div>
      <div className="relative -mx-4 mt-2">
        <MiniSparkline values={sparkValues} color={sparkColor} id={sparkId} />
      </div>
    </div>
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
    <div className="border-bdr bg-sidebar space-y-1 rounded-lg border px-3 py-2.5 text-xs shadow-xl">
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
}: {
  rows: [string, number][];
  barColor: string;
  textColor: string;
  onRowClick: (label: string) => void;
}) {
  const { t } = useTranslation();
  const max = rows[0]?.[1] ?? 1;
  if (rows.length === 0) return <p className="text-muted py-2 text-xs">{t("dashboard.no_data")}</p>;
  return (
    <div className="space-y-1">
      {rows.slice(0, 10).map(([label, count], i) => (
        <button
          key={label}
          onClick={() => onRowClick(label)}
          className="hover:bg-white/4 group w-full cursor-pointer rounded-md px-2 py-1.5 text-left transition-colors"
        >
          <div className="mb-1 flex items-center justify-between text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <span className="mono text-muted w-4 shrink-0 text-right text-[10px] tabular-nums">
                {i + 1}
              </span>
              <span
                className={cn("mono group-hover:text-teal truncate transition-colors", textColor)}
              >
                {label}
              </span>
            </div>
            <span className="mono text-muted ml-3 shrink-0 tabular-nums">{fmt(count)}</span>
          </div>
          <Bar value={(count / max) * 100} color={barColor} className="h-1" />
        </button>
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
            "rounded px-2 py-0.5 text-[10px] transition-colors disabled:opacity-40",
            value === r.value ? "bg-teal/15 text-teal" : "text-muted hover:text-heading",
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
  navigate,
  topHours,
  topLoading,
  onRangeChange,
}: {
  topQueried: [string, number][];
  topBlocked: [string, number][];
  navigate: (to: string) => void;
  topHours: TopHours;
  topLoading: boolean;
  onRangeChange: (h: TopHours) => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className={cn("h-full", topLoading && "pointer-events-none opacity-60")}>
      <Tabs defaultValue="queried" className="w-full">
        <div className="mb-3 flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="queried">{t("dashboard.top_queried")}</TabsTrigger>
            <TabsTrigger value="blocked">{t("dashboard.top_blocked")}</TabsTrigger>
          </TabsList>
          <RangeButtons value={topHours} loading={topLoading} onChange={onRangeChange} />
        </div>
        <TabsContent value="queried">
          <DomainRows
            rows={topQueried}
            barColor="bg-teal"
            textColor="text-body"
            onRowClick={(d) => navigate(`/queries?domain=${encodeURIComponent(d)}`)}
          />
        </TabsContent>
        <TabsContent value="blocked">
          <DomainRows
            rows={topBlocked}
            barColor="bg-blocked"
            textColor="text-blocked"
            onRowClick={(d) => navigate(`/queries?domain=${encodeURIComponent(d)}&status=blocked`)}
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

// ── Top clients card ──────────────────────────────────────────────────────────

function TopClients({
  rows,
  navigate,
  topLoading,
}: {
  rows: { name: string; total: number; ips: string[] }[];
  navigate: (to: string) => void;
  topLoading: boolean;
}) {
  const { t } = useTranslation();
  const max = rows[0]?.total ?? 1;
  return (
    <Card className={cn("h-full", topLoading && "pointer-events-none opacity-60")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-muted text-[10px] font-semibold uppercase tracking-wider">
          {t("dashboard.top_clients")}
        </p>
        <p className="text-muted/60 text-[10px] italic">{t("dashboard.click_to_filter")}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted py-2 text-xs">{t("dashboard.no_data")}</p>
      ) : (
        <div className="space-y-1">
          {rows.slice(0, 10).map((c, i) => (
            <button
              key={c.name}
              onClick={() => {
                const ips = c.ips.length > 0 ? c.ips : isIpv4(c.name) ? [c.name] : [];
                if (ips.length > 0) {
                  navigate(`/queries?client_ip=${encodeURIComponent(ips.join(","))}`);
                } else {
                  navigate("/clients");
                }
              }}
              className="hover:bg-white/4 group w-full cursor-pointer rounded-md px-2 py-1.5 text-left transition-colors"
            >
              <div className="mb-1 flex items-center justify-between text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="mono text-muted w-4 shrink-0 text-right text-[10px] tabular-nums">
                    {i + 1}
                  </span>
                  <span className="mono text-body group-hover:text-teal truncate transition-colors">
                    {c.name}
                  </span>
                </div>
                <span className="mono text-muted ml-3 shrink-0 tabular-nums">{fmt(c.total)}</span>
              </div>
              <Bar value={(c.total / max) * 100} color="bg-upstream" className="h-1" />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Live feed ─────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<QueryStatus, string> = {
  allowed: "bg-teal",
  blocked: "bg-blocked",
  cached: "bg-cached",
  upstream: "bg-upstream",
};

const STATUS_LABEL: Record<QueryStatus, string> = {
  allowed: "text-teal/70",
  blocked: "text-blocked/80",
  cached: "text-cached/70",
  upstream: "text-upstream/70",
};

function FeedRows({ rows, navigate }: { rows: QueryEntry[]; navigate: (to: string) => void }) {
  const { t } = useTranslation();
  if (rows.length === 0)
    return <p className="text-muted py-2 text-xs">{t("dashboard.no_queries")}</p>;
  return (
    <div className="space-y-1">
      {rows.slice(0, 18).map((r) => {
        const showRcode = r.rcode !== 0 && !(r.status === "blocked" && r.rcode === 3);
        const isCname = r.upstream?.startsWith("cname:") ?? false;
        const resolver =
          !isCname && r.status === "upstream" && r.upstream
            ? r.upstream.replace(/:\d+$/, "")
            : null;
        const cnameTarget = isCname ? r.upstream!.slice(6) : null;

        return (
          <button
            key={r.id}
            onClick={() => navigate(`/queries?domain=${encodeURIComponent(r.domain)}`)}
            className="hover:bg-white/4 group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors"
          >
            <span
              className={cn("h-1.5 w-1.5 shrink-0 self-center rounded-full", STATUS_DOT[r.status])}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="mono text-body group-hover:text-teal block truncate text-xs transition-colors">
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
    <Card className="min-h-107.5 flex flex-col">
      <Tabs defaultValue="all" className="flex flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="all">{t("dashboard.all")}</TabsTrigger>
            <TabsTrigger value="blocked">{t("dashboard.blocked")}</TabsTrigger>
          </TabsList>
          <span className="text-teal flex items-center gap-1.5 text-[10px]">
            <span className="bg-teal h-1.5 w-1.5 animate-pulse rounded-full" />
            {t("dashboard.live")}
          </span>
        </div>
        <TabsContent value="all">
          <FeedRows rows={rows} navigate={navigate} />
        </TabsContent>
        <TabsContent value="blocked">
          <FeedRows rows={recentBlocked} navigate={navigate} />
        </TabsContent>
      </Tabs>

      <button
        onClick={() => navigate("/queries")}
        className="border-bdr/70 text-muted hover:text-teal mt-4 flex items-center gap-1 border-t pt-4 text-xs transition-colors"
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
    <div className="border-bdr/55 bg-void/18 min-h-30 flex flex-col justify-between rounded-md border p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
            <Icon size={12} className="text-teal/80 shrink-0" />
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

function SystemBar({ sys }: { sys: SystemStats }) {
  const { t } = useTranslation();
  const cpuColor =
    sys.cpu_usage_percent > 85
      ? "bg-blocked/70"
      : sys.cpu_usage_percent > 60
        ? "bg-warn/60"
        : "bg-teal/60";

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
        : "bg-teal/45";

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
    <Card className="mb-4 overflow-hidden p-0">
      <div className="border-bdr/60 flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="border-teal/20 bg-teal/12 text-teal rounded-full border p-2.5">
            <ServerCog size={18} />
          </span>
          <div>
            <p className="text-muted text-[10px] font-semibold uppercase tracking-wider">
              {t("dashboard.system")}
            </p>
            <p className="text-muted mt-0.5 text-xs">
              {t("dashboard.uptime")} {formatUptime(sys.uptime_seconds)}
            </p>
          </div>
        </div>
        <div className="text-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
          <span>
            {t("dashboard.load")}{" "}
            <span className="text-heading font-medium tabular-nums">
              {sys.load_avg.one.toFixed(2)}
            </span>
            <span className="text-muted/50">
              {" · "}
              {sys.load_avg.five.toFixed(2)}
              {" · "}
              {sys.load_avg.fifteen.toFixed(2)}
            </span>
          </span>
          <span className="text-teal flex items-center gap-1.5">
            <span className="bg-teal h-1.5 w-1.5 rounded-full" />
            {t("dashboard.live")}
          </span>
        </div>
      </div>

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
        <div className="border-bdr/55 bg-void/18 min-h-30 flex flex-col justify-between rounded-md border p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-muted flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
                <Network size={12} className="text-teal/80 shrink-0" />
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
              <SystemTrack percent={sys.network.rx_utilization_percent} color="bg-teal/55" />
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
            <span className="text-muted flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
              <span className="bg-teal/70 h-1.5 w-1.5 rounded-full" />
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
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
        <Skeleton className="h-44 w-full rounded-lg" />
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <Skeleton className="mb-4 h-5 w-40 rounded-lg" />
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

export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [sysStats, setSysStats] = useState<SystemStats | null>(null);
  const [err, setErr] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

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

  const fetchSys = useCallback(async () => {
    try {
      setSysStats(await api.statsSystem());
    } catch {
      /* optional — ignore if unavailable */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let timer: number | undefined;

    const schedule = (delay = summaryRefreshDelay()) => {
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

  useEffect(() => {
    fetchSys();
    const sysRefresh = window.setInterval(fetchSys, SYS_REFRESH);
    return () => {
      clearInterval(sysRefresh);
    };
  }, [fetchSys]);

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
  const querySpark = useMemo(() => chartData.map((p) => p.Queries), [chartData]);
  const blockedSpark = useMemo(() => chartData.map((p) => p.Blocked), [chartData]);
  const cachedSpark = useMemo(() => chartData.map((p) => p.Cached), [chartData]);
  const upstreamSpark = useMemo(() => chartData.map((p) => p.Upstream), [chartData]);
  const total = stats?.total_queries ?? 0;

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
    <div className="max-w-385 mx-auto p-4 sm:p-5 lg:p-6">
      <PageHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        action={
          <span className="text-muted flex items-center gap-1.5 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="bg-teal absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
              <span className="bg-teal relative inline-flex h-2 w-2 rounded-full" />
            </span>
            {t("dashboard.live")} ·{" "}
            {updatedAt ? updatedAt.toLocaleTimeString() : t("dashboard.live_interval")}
          </span>
        }
      />

      {err && <Err msg={err} />}
      {!stats && !err && <DashboardSkeleton />}

      {stats && (
        <>
          {/* ── Stat cards ─────────────────────────────────────────────────── */}
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label={t("dashboard.total_queries")}
              value={fmt(total)}
              sub={t("dashboard.since_last_start")}
              textColor="text-heading"
              lineColor="via-slate-300/35"
              bgColor="bg-white/6"
              sparkColor="#cbd5e1"
              sparkValues={querySpark}
              sparkId="spark-total"
              icon={Activity}
              delay={0}
            />
            <StatCard
              label={t("dashboard.blocked")}
              value={fmt(stats.blocked_queries)}
              sub={`${pct(stats.blocked_queries, total)} ${t("dashboard.of_traffic")}`}
              textColor="text-blocked"
              lineColor="via-blocked/50"
              bgColor="bg-blocked/10"
              sparkColor="#ef4444"
              sparkValues={blockedSpark}
              sparkId="spark-blocked"
              // right={<BlockRing pct={bp} />}
              icon={Shield}
              delay={60}
            />
            <StatCard
              label={t("dashboard.cached")}
              value={fmt(stats.cached_queries)}
              sub={`${pct(stats.cached_queries, total)} ${t("dashboard.cache_rate")}`}
              textColor="text-cached"
              lineColor="via-cached/40"
              bgColor="bg-cached/10"
              sparkColor="#22c55e"
              sparkValues={cachedSpark}
              sparkId="spark-cached"
              icon={Zap}
              delay={120}
            />
            <StatCard
              label={t("dashboard.upstream")}
              value={fmt(stats.upstream_queries)}
              sub={`${pct(stats.upstream_queries, total)} ${t("dashboard.forwarded")}`}
              textColor="text-upstream"
              lineColor="via-upstream/40"
              bgColor="bg-upstream/10"
              sparkColor="#3b82f6"
              sparkValues={upstreamSpark}
              sparkId="spark-upstream"
              icon={Globe}
              delay={180}
            />
            <StatCard
              label={t("dashboard.blocklist")}
              value={fmt(stats.total_domains_blocked)}
              sub={t("dashboard.domains_protected")}
              textColor="text-teal"
              lineColor="via-teal/40"
              bgColor="bg-teal/10"
              sparkColor="#35dc9a"
              sparkValues={blockedSpark}
              sparkId="spark-blocklist"
              icon={Database}
              delay={240}
            />
          </div>

          {/* ── System stats ───────────────────────────────────────────────── */}
          {sysStats && <SystemBar sys={sysStats} />}

          {/* ── Full-width chart ───────────────────────────────────────────── */}
          <Card className="mb-4 overflow-hidden p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted text-[10px] font-semibold uppercase tracking-wider">
                {t("dashboard.traffic_chart")}
              </p>
              <div className="text-muted flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  {t("dashboard.total_queries")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="bg-blocked h-1.5 w-1.5 rounded-full" />
                  {t("dashboard.blocked")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="bg-cached h-1.5 w-1.5 rounded-full" />
                  {t("dashboard.cached")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="bg-upstream h-1.5 w-1.5 rounded-full" />
                  {t("dashboard.upstream")}
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
                <defs>
                  <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#cbd5e1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#cbd5e1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gU" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bdr)" vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 10, fill: "var(--color-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  interval={17}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-muted)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="Queries"
                  stroke="#cbd5e1"
                  strokeWidth={2}
                  fill="url(#gT)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="Blocked"
                  stroke="#ef4444"
                  strokeWidth={1.8}
                  fill="url(#gB)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="Cached"
                  stroke="#22c55e"
                  strokeWidth={1.6}
                  fill="url(#gC)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="Upstream"
                  stroke="#3b82f6"
                  strokeWidth={1.6}
                  fill="url(#gU)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* ── Bottom row ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(460px,1.05fr)]">
            <div className="flex flex-col gap-3">
              <TopDomains
                topQueried={effectiveDomains}
                topBlocked={effectiveBlocked}
                navigate={navigate}
                topHours={topHours}
                topLoading={topLoading}
                onRangeChange={setTopHours}
              />
              <TopClients rows={effectiveClients} navigate={navigate} topLoading={topLoading} />
            </div>
            <LiveFeed
              rows={stats.recent_domains}
              recentBlocked={stats.recent_blocked}
              navigate={navigate}
            />
          </div>
        </>
      )}
    </div>
  );
}
