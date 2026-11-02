import { useEffect, useRef, useState, useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Search,
  RefreshCw,
  Download,
  Copy,
  Check,
  Trash2,
  ChevronDown,
  ChevronsLeft,
  Layers,
  Rows3,
  Users,
} from "lucide-react";
import { cn, copyToClipboard } from "@/lib/utils";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/layout/Card";
import { FilterBar } from "@/components/layout/FilterBar";
import { Badge } from "@/components/feedback/Badge";
import { Err } from "@/components/feedback/Err";
import { Notice } from "@/components/feedback/Notice";
import {
  SearchInput,
  Select,
  Btn,
  Th,
  Td,
  TableRow,
  EmptyRow,
  Skeleton,
  Tooltip,
} from "@/components/ui";
import { useDebounce } from "@/hooks/use-debounce";
import { useConfirm } from "@/hooks/use-confirm";
import { usePageVisible } from "@/hooks/use-page-visible";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useSettings } from "@/stores/settings";
import { RCODE_LABEL, RCODE_COLOR, qtypeName } from "@/lib/dns";
import { fmt } from "@/lib/format";
import { deviceTokens } from "@/api/clients";
import { QuickRuleBtn } from "@/components/QuickRuleBtn";
import { DomainInfoBtn } from "@/components/DomainInfoBtn";
import { DeviceInfoBtn } from "@/components/DeviceInfoBtn";
import type { QueryEntry, QueryFilters, QueryStatus, ClientEntry } from "@/api/types";

// ── DNS helpers ───────────────────────────────────────────────────────────────

function RCodeBadge({ code }: { code: number }) {
  const label = RCODE_LABEL[code];
  if (!label) return null;
  return <span className={`font-mono text-xs ${RCODE_COLOR[code] ?? "text-muted"}`}>{label}</span>;
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: ReactMouseEvent) {
    e.stopPropagation();
    copyToClipboard(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }
  return (
    <button
      onClick={handleCopy}
      className="text-muted hover:text-ember ml-1 inline-flex opacity-0 transition-all group-hover:opacity-100"
      title="Copy"
    >
      {copied ? <Check size={11} className="text-ember" /> : <Copy size={11} />}
    </button>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV(rows: QueryEntry[]) {
  const headers = [
    "Time",
    "Domain",
    "Type",
    "Client IP",
    "Client Name",
    "Status",
    "Latency ms",
    "RCode",
    "Upstream",
  ];
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      new Date(r.timestamp).toLocaleString(),
      r.domain,
      qtypeName(r.query_type),
      r.client_ip,
      r.client_name ?? "",
      r.status,
      r.latency_ms ?? "",
      r.rcode,
      r.upstream ?? "",
    ]
      .map(escape)
      .join(","),
  );
  const csv = [headers.join(","), ...lines].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `ferrite-queries-${Date.now()}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

// ── Client multi-select ───────────────────────────────────────────────────────

function ClientMultiSelect({
  clients,
  selected,
  onChange,
}: {
  clients: ClientEntry[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const label =
    selected.size === 0
      ? null
      : selected.size === 1
        ? [...selected][0]
        : t("queries.selected_clients", { count: selected.size });

  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  }

  return (
    <div ref={ref} className="relative w-full">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "bg-sidebar hover:border-ember/30 focus:border-ember rounded-xs flex h-9 w-full items-center gap-2 border px-3 text-xs transition-colors focus:outline-none",
          selected.size > 0 ? "border-ember/40 text-body" : "border-bdr text-muted",
        )}
      >
        <Users size={12} className={selected.size > 0 ? "text-ember" : "text-muted"} />
        <span className="min-w-0 flex-1 truncate text-left">
          {label ?? t("queries.all_clients")}
        </span>
        <ChevronDown size={11} className="text-muted shrink-0" />
      </button>

      {open && (
        <div className="min-w-52 animate-fade-down border-bdr bg-card rounded-xs absolute left-0 top-full z-30 mt-1 border shadow-2xl">
          {clients.length === 0 ? (
            <p className="text-muted px-3 py-3 text-xs">{t("queries.no_clients")}</p>
          ) : (
            <div className="max-h-60 overflow-y-auto py-1">
              {clients.map((c) => (
                <button
                  key={c.name}
                  onClick={() => toggle(c.name)}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/5"
                >
                  <span
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                      selected.has(c.name) ? "border-ember bg-ember" : "border-bdr bg-transparent",
                    )}
                  >
                    {selected.has(c.name) && (
                      <Check size={9} className="text-on-ember" strokeWidth={3} />
                    )}
                  </span>
                  <span className="text-body min-w-0 flex-1 truncate font-mono text-xs">
                    {c.name}
                  </span>
                  <span className="text-muted shrink-0 text-[10px] tabular-nums">
                    {fmt(c.total)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {selected.size > 0 && (
            <div className="border-bdr border-t px-3 py-1.5">
              <button
                onClick={() => {
                  onChange(new Set());
                  setOpen(false);
                }}
                className="text-muted hover:text-blocked text-[10px] transition-colors"
              >
                {t("queries.clear_selection")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES: (QueryStatus | "")[] = ["", "allowed", "blocked", "cached", "upstream", "routed"];
const AUTO_REFRESH = 15_000;

type QueryCursor = Pick<QueryFilters, "before_id" | "before_ts">;

function cursorFromRow(row: QueryEntry | undefined) {
  if (!row) return null;
  const timestampMs = new Date(row.timestamp).getTime();
  if (!Number.isFinite(timestampMs)) return null;
  return {
    before_id: row.id,
    before_ts: Math.floor(timestampMs / 1000),
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

/** A row's status as a colour on its leading edge, so a page of mostly-cached
 *  traffic shows its blocks at a glance. */
const STATUS_EDGE: Record<QueryStatus, string> = {
  blocked: "border-l-blocked",
  routed: "border-l-routed",
  upstream: "border-l-upstream/60",
  cached: "border-l-cached/40",
  allowed: "border-l-ember/40",
};

/** A run of identical queries — same name, type, device and outcome — shown as
 *  one row. Apps retry and re-ask in bursts; eight rows of the same name say
 *  less than one row that says "×8". */
interface QueryRun {
  row: QueryEntry;
  count: number;
  /** Timestamp of the oldest query in the run (rows arrive newest first). */
  since: string;
}

function groupRuns(rows: QueryEntry[]): QueryRun[] {
  const runs: QueryRun[] = [];
  for (const r of rows) {
    const last = runs[runs.length - 1];
    if (
      last &&
      last.row.domain === r.domain &&
      last.row.query_type === r.query_type &&
      last.row.device === r.device &&
      last.row.status === r.status
    ) {
      last.count += 1;
      last.since = r.timestamp;
    } else {
      runs.push({ row: r, count: 1, since: r.timestamp });
    }
  }
  return runs;
}

export default function Queries() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const [rows, setRows] = useState<QueryEntry[]>([]);
  const [groupPref, setGroupPref] = useLocalStorage("ferrite.queries.group", "1");
  const grouped = groupPref === "1";
  // Compact rows fit about twice the log on a screen; off by default.
  const [densityPref, setDensityPref] = useLocalStorage("ferrite.queries.compact", "0");
  const compact = densityPref === "1";
  const runs = grouped
    ? groupRuns(rows)
    : rows.map((r) => ({ row: r, count: 1, since: r.timestamp }));
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const { confirm, ConfirmDialog } = useConfirm();

  const initialClientIps = searchParams.get("client_ip") ?? "";
  const initialDevices = searchParams.get("device") ?? "";

  const [domainInput, setDomainInput] = useState(searchParams.get("domain") ?? "");
  const [filters, setFilters] = useState<QueryFilters>({
    domain: searchParams.get("domain") ?? "",
    client_ip: initialClientIps,
    device: initialDevices,
    status: (searchParams.get("status") as QueryStatus) ?? "",
    limit: 100,
  });
  const [pageIndex, setPageIndex] = useState(0);
  const [cursorStack, setCursorStack] = useState<QueryCursor[]>([]);

  // Client multi-select
  const [clientList, setClientList] = useState<ClientEntry[]>([]);
  // The query log can be switched off in Settings -> Privacy. An empty table
  // then means "nothing is being recorded", not "no traffic" — say which.
  const logDisabled = useSettings()?.storage?.log_queries === false;
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());

  const debouncedDomain = useDebounce(domainInput, 300);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Separate sequence for the delta refresh so it can't cancel load()'s
  // loading-flag commit (which would orphan the skeleton on the live page).
  const refreshSeq = useRef(0);

  // Monotonic request id: the auto-refresh tick, debounced domain changes and
  // pagination can all fire overlapping fetches. Only the most recent request
  // is allowed to commit its result, so a slow earlier response can't clobber a
  // newer one. The delta refresh uses a SEPARATE counter (below) so it can never
  // cancel a full load's loading-flag commit and orphan the skeleton.
  const loadSeq = useRef(0);

  const load = useCallback(async (f?: QueryFilters, { silent = false } = {}) => {
    const target = f ?? filtersRef.current;
    const seq = ++loadSeq.current;
    if (!silent) setLoading(true);
    setErr("");
    try {
      const data = await api.queries(target);
      if (seq !== loadSeq.current) return;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setErr((e as Error).message);
    } finally {
      // Always clear our own skeleton, even if a newer request superseded us —
      // otherwise a load that loses the race leaves `loading` stuck true.
      if (!silent) setLoading(false);
    }
  }, []);

  const resetPagination = useCallback(
    (nextFilters: QueryFilters) => {
      const firstPage = {
        ...nextFilters,
        before_id: undefined,
        before_ts: undefined,
        offset: undefined,
      };
      setPageIndex(0);
      setCursorStack([]);
      setFilters(firstPage);
      load(firstPage);
    },
    [load],
  );

  // Initial load + clients fetch
  useEffect(() => {
    load();
    api
      .clients(200)
      .then((r) => {
        setClientList(r.clients);
        // Pre-select clients matching URL params (by IP, MAC, or name token).
        if (initialClientIps || initialDevices) {
          const tokens = new Set(
            [...initialClientIps.split(","), ...initialDevices.split(",")].filter(Boolean),
          );
          const matched = new Set(
            r.clients
              .filter(
                (c) =>
                  c.ips.some((ip) => tokens.has(ip)) ||
                  c.macs.some((m) => tokens.has(m)) ||
                  tokens.has(c.name),
              )
              .map((c) => c.name),
          );
          if (matched.size > 0) setSelectedClients(matched);
        }
      })
      .catch((e) => console.warn("Failed to load clients:", e));
  }, [load, initialClientIps, initialDevices]);

  // Debounced domain filter
  const initializedDomain = useRef(false);
  useEffect(() => {
    if (!initializedDomain.current) {
      initializedDomain.current = true;
      return;
    }
    resetPagination({ ...filtersRef.current, domain: debouncedDomain });
  }, [debouncedDomain, resetPagination]);

  // Auto-refresh tick. Without active filters, polls the cheap `after_id`
  // delta and prepends new rows; the server ignores filters on the delta path,
  // so a filtered view falls back to a full silent reload.
  const refresh = useCallback(async () => {
    const f = filtersRef.current;
    const hasFilters = Boolean(f.domain || f.client_ip || f.device || f.status);
    const newestId = rowsRef.current[0]?.id;
    if (hasFilters || newestId === undefined) {
      return load(undefined, { silent: true });
    }

    const seq = ++refreshSeq.current;
    const limit = f.limit ?? 100;
    try {
      const delta = await api.queries({ after_id: newestId, limit });
      if (seq !== refreshSeq.current) return;
      if (!Array.isArray(delta) || delta.length === 0) return;
      if (delta.length >= limit) {
        // More new entries than one page — the delta window overflowed.
        return load(undefined, { silent: true });
      }
      // Guard against servers that don't know after_id yet and return the
      // full unfiltered list (would duplicate already-rendered rows).
      const fresh = delta.filter((e) => e.id > newestId);
      if (fresh.length === 0) return;
      setErr("");
      setRows((prev) => [...fresh, ...prev].slice(0, limit));
    } catch (e) {
      if (seq !== refreshSeq.current) return;
      setErr((e as Error).message);
    }
  }, [load]);

  // Auto-refresh: only on the live first page, only while the tab is visible,
  // and only while there is something to poll for. On return to a visible tab,
  // catch up immediately.
  const isLive = pageIndex === 0;
  const pageVisible = usePageVisible();
  const wasHidden = useRef(false);
  useEffect(() => {
    if (!isLive) return;
    // With the log off the server answers every shape of this request with an
    // empty list, and the rows stay empty — so the delta cursor never exists and
    // each tick would fire a *full* list request, four times a minute, forever.
    if (logDisabled) return;
    if (!pageVisible) {
      wasHidden.current = true;
      return;
    }
    if (wasHidden.current) {
      wasHidden.current = false;
      refresh();
    }
    const id = setInterval(refresh, AUTO_REFRESH);
    return () => clearInterval(id);
  }, [isLive, pageVisible, refresh, logDisabled]);

  function handleSelectFilter(key: keyof QueryFilters, val: QueryFilters[keyof QueryFilters]) {
    resetPagination({ ...filtersRef.current, [key]: val });
  }

  function handleClientChange(names: Set<string>) {
    setSelectedClients(names);
    // Filter by device token (MAC when known) so a client's history spans every
    // IP it used. Clear client_ip so the two identity filters don't both apply.
    const devices = clientList
      .filter((c) => names.has(c.name))
      .flatMap(deviceTokens)
      .join(",");
    resetPagination({ ...filtersRef.current, device: devices, client_ip: "" });
  }

  function paginate(delta: number) {
    if (delta > 0) {
      const cursor = cursorFromRow(rows[rows.length - 1]);
      if (!cursor) return;
      const nextStack = [...cursorStack, cursor];
      const next = {
        ...filtersRef.current,
        offset: undefined,
        ...cursor,
      };
      setCursorStack(nextStack);
      setPageIndex(nextStack.length);
      setFilters(next);
      load(next);
      return;
    }

    if (pageIndex === 0) return;
    const nextStack = cursorStack.slice(0, -1);
    const cursor = nextStack[nextStack.length - 1];
    const next = {
      ...filtersRef.current,
      before_id: cursor?.before_id,
      before_ts: cursor?.before_ts,
      offset: undefined,
    };
    setCursorStack(nextStack);
    setPageIndex(nextStack.length);
    setFilters(next);
    load(next);
  }

  async function handleClear() {
    if (!(await confirm(t("queries.clear_confirm")))) return;
    try {
      await api.purgeQueryLog();
      setRows([]);
      resetPagination(filtersRef.current);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  function filterByDomain(domain: string) {
    setDomainInput(domain);
  }

  // Follow `?domain=` while on the page — the domain panel and the command
  // palette link here with it, and the page is already mounted.
  const domainParam = searchParams.get("domain");
  useEffect(() => {
    if (domainParam !== null) setDomainInput(domainParam);
  }, [domainParam]);

  function filterByClient(row: QueryEntry) {
    const client = clientList.find(
      (c) =>
        c.ips.includes(row.client_ip) || c.name === row.client_ip || c.macs.includes(row.device),
    );
    if (client) {
      handleClientChange(new Set([client.name]));
    } else {
      // Unknown client — fall back to the row's own device token.
      resetPagination({
        ...filtersRef.current,
        device: row.device || row.client_ip,
        client_ip: "",
      });
    }
  }

  const currentLimit = filters.limit ?? 100;
  const pageStart = rows.length === 0 ? 0 : pageIndex * currentLimit + 1;
  const pageEnd = pageIndex * currentLimit + rows.length;

  return (
    <PageContainer>
      {ConfirmDialog}
      <PageHeader
        title={t("queries.title")}
        subtitle={t("queries.subtitle")}
        action={
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="text-muted flex items-center gap-1.5 text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="bg-ember absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
                  <span className="bg-ember relative inline-flex h-2 w-2 rounded-full" />
                </span>
                {t("queries.live")}
              </span>
            )}
            <Btn
              variant="ghost"
              onClick={() => setGroupPref(grouped ? "0" : "1")}
              aria-pressed={grouped}
              title={t("queries.group_repeats_hint", {
                defaultValue: "Fold identical queries in a row into one line",
              })}
              className={cn(grouped && "border-ember/40 text-ember")}
            >
              <Layers size={12} /> {t("queries.group_repeats", { defaultValue: "Group" })}
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => setDensityPref(compact ? "0" : "1")}
              aria-pressed={compact}
              title={t("queries.compact_hint", { defaultValue: "Tighter rows, more of the log on screen" })}
              className={cn(compact && "border-ember/40 text-ember")}
            >
              <Rows3 size={12} /> {t("queries.compact", { defaultValue: "Compact" })}
            </Btn>
            {rows.length > 0 && (
              <Btn variant="ghost" onClick={() => exportCSV(rows)}>
                <Download size={12} /> {t("queries.csv")}
              </Btn>
            )}
            <Btn variant="danger" onClick={handleClear} disabled={loading}>
              <Trash2 size={12} /> {t("queries.clear_log")}
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => load(undefined, { silent: true })}
              disabled={loading}
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />{" "}
              {t("common.refresh")}
            </Btn>
          </div>
        }
      />

      {logDisabled && <Notice>{t("queries.log_disabled")}</Notice>}

      <FilterBar>
        <SearchInput
          icon={Search}
          placeholder={t("queries.domain_placeholder")}
          value={domainInput}
          onChange={(e) => setDomainInput(e.target.value)}
          className="w-full min-w-0 lg:flex-1"
        />
        <div className="w-full lg:w-56">
          <ClientMultiSelect
            clients={clientList}
            selected={selectedClients}
            onChange={handleClientChange}
          />
        </div>
        <Select
          value={filters.status ?? ""}
          onChange={(e) => handleSelectFilter("status", e.target.value as QueryStatus | "")}
          className="w-full lg:w-40"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? t(`queries.status_${s}`) : t("queries.all_statuses")}
            </option>
          ))}
        </Select>
        <Select
          value={filters.limit}
          onChange={(e) => handleSelectFilter("limit", Number(e.target.value))}
          className="w-full lg:w-32"
        >
          {[50, 100, 250, 500].map((n) => (
            <option key={n} value={n}>
              {n} {t("common.rows")}
            </option>
          ))}
        </Select>
      </FilterBar>

      {!loading && !err && (rows.length > 0 || pageIndex > 0) && (
        <div className="mb-3">
          <Pager
            pageIndex={pageIndex}
            pageStart={pageStart}
            pageEnd={pageEnd}
            atEnd={rows.length < currentLimit}
            onFirst={() => resetPagination(filtersRef.current)}
            onPrev={() => paginate(-1)}
            onNext={() => paginate(1)}
          />
        </div>
      )}

      <Card className="p-0! overflow-hidden">
        {loading && (
          <div className="space-y-2 p-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        )}
        {err && (
          <div className="p-5">
            <Err msg={err} />
          </div>
        )}
        {!loading && !err && (
          <div className="overflow-x-auto">
            <table className={cn("w-full text-xs", compact && "[&_td]:py-1")}>
              <thead>
                <tr className="border-bdr border-b">
                  <Th>{t("queries.col_time")}</Th>
                  <Th>{t("queries.col_domain")}</Th>
                  <Th className="hidden sm:table-cell">{t("queries.col_type")}</Th>
                  <Th className="hidden sm:table-cell">{t("queries.col_client")}</Th>
                  <Th>{t("queries.col_status")}</Th>
                  <Th className="hidden md:table-cell">{t("queries.col_latency")}</Th>
                  <Th className="hidden md:table-cell">{t("queries.col_rcode")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <EmptyRow
                    cols={7}
                    message={
                      // "No queries found" would read as "no traffic"; the log is
                      // simply not being kept.
                      logDisabled ? t("queries.no_queries_log_off") : t("queries.no_queries")
                    }
                  />
                ) : (
                  runs.map(({ row: r, count, since }) => (
                    <TableRow key={r.id} className={cn("border-l-2", STATUS_EDGE[r.status])}>
                      <Td className="text-muted whitespace-nowrap">
                        <span
                          title={
                            count > 1
                              ? `${new Date(since).toLocaleTimeString()} – ${new Date(r.timestamp).toLocaleTimeString()}`
                              : undefined
                          }
                        >
                          {new Date(r.timestamp).toLocaleTimeString()}
                        </span>
                      </Td>

                      <Td className="text-heading max-w-44 font-mono sm:max-w-xs">
                        <span className="group flex items-center">
                          <button
                            className="hover:text-ember cursor-pointer truncate text-left transition-colors"
                            onClick={() => filterByDomain(r.domain)}
                            title={`Filter by ${r.domain}`}
                          >
                            {r.domain}
                          </button>
                          {count > 1 && (
                            <span
                              className="border-bdr/70 text-muted rounded-xs ml-1.5 shrink-0 border px-1 text-[10px] tabular-nums"
                              title={t("queries.repeat_count_hint", {
                                count,
                                defaultValue: "{{count}} identical queries in a row",
                              })}
                            >
                              ×{count}
                            </span>
                          )}
                          <CopyBtn text={r.domain} />
                          <QuickRuleBtn
                            domain={r.domain}
                            kind={r.status === "blocked" ? "allow" : "block"}
                          />
                          <DomainInfoBtn domain={r.domain} client={r.client_ip} />
                        </span>
                        {/* The columns a phone hides, folded under the domain. */}
                        <span className="text-muted block truncate text-[10px] sm:hidden">
                          {qtypeName(r.query_type)} · {r.client_name || r.client_ip}
                        </span>
                      </Td>

                      <Td className="text-muted hidden font-mono sm:table-cell">
                        {qtypeName(r.query_type)}
                      </Td>

                      <Td className="hidden sm:table-cell">
                        {/* The device's name leads — that is how people know their
                            devices; the address is detail, unless it is all there is. */}
                        {r.client_name && r.client_name !== r.client_ip ? (
                          <>
                            <span className="group flex items-center gap-0.5">
                              <button
                                className="text-heading hover:text-ember cursor-pointer truncate text-left transition-colors"
                                onClick={() => filterByClient(r)}
                                title={`Filter by ${r.client_name}`}
                              >
                                {r.client_name}
                              </button>
                              <DeviceInfoBtn
                                device={{ ips: [r.client_ip], name: r.client_name }}
                                label={r.client_name}
                              />
                            </span>
                            <span className="group text-muted flex items-center gap-0.5 font-mono text-[10px]">
                              <span className="truncate">{r.client_ip}</span>
                              <CopyBtn text={r.client_ip} />
                            </span>
                          </>
                        ) : (
                          <span className="group flex items-center gap-0.5">
                            <button
                              className="text-body hover:text-ember cursor-pointer font-mono transition-colors"
                              onClick={() => filterByClient(r)}
                              title={`Filter by ${r.client_ip}`}
                            >
                              {r.client_ip}
                            </button>
                            <CopyBtn text={r.client_ip} />
                            <DeviceInfoBtn device={{ ips: [r.client_ip] }} label={r.client_ip} />
                          </span>
                        )}
                      </Td>

                      <Td>
                        <span className="flex items-center gap-1.5">
                          {r.upstream ? (
                            <Tooltip content={r.upstream}>
                              <Badge status={r.status} />
                            </Tooltip>
                          ) : (
                            <Badge status={r.status} />
                          )}
                          {/* Answered with the engine's safe host (SafeSearch /
                              YouTube Restricted Mode) rather than the name asked. */}
                          {r.upstream?.startsWith("safesearch:") && (
                            <Tooltip
                              content={t("queries.safe_hint", {
                                host: r.upstream.slice("safesearch:".length),
                                defaultValue: "Safe search: answered with {{host}}",
                              })}
                            >
                              <span className="text-cached border-cached/30 rounded-xs border px-1 font-mono text-[9px] uppercase tracking-wider">
                                {t("queries.safe_tag", { defaultValue: "safe" })}
                              </span>
                            </Tooltip>
                          )}
                        </span>
                      </Td>
                      <Td className="text-muted hidden tabular-nums md:table-cell">
                        {r.latency_ms != null ? `${r.latency_ms}ms` : "—"}
                      </Td>
                      <Td className="hidden md:table-cell">
                        {/* A block is answered NXDOMAIN by design; saying so
                            again beside BLOCKED is noise. Other codes stay. */}
                        {!(r.status === "blocked" && r.rcode === 3) && <RCodeBadge code={r.rcode} />}
                      </Td>
                    </TableRow>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!loading && !err && (rows.length > 0 || pageIndex > 0) && (
        <div className="mt-3">
          <Pager
            pageIndex={pageIndex}
            pageStart={pageStart}
            pageEnd={pageEnd}
            atEnd={rows.length < currentLimit}
            onFirst={() => resetPagination(filtersRef.current)}
            onPrev={() => paginate(-1)}
            onNext={() => paginate(1)}
          />
        </div>
      )}
    </PageContainer>
  );
}

/** First / prev / page+range / next pager, rendered identically above and below
 *  the table. "First" also returns to page 0, which is the live-tailing view. */
function Pager({
  pageIndex,
  pageStart,
  pageEnd,
  atEnd,
  onFirst,
  onPrev,
  onNext,
}: {
  pageIndex: number;
  pageStart: number;
  pageEnd: number;
  atEnd: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-end gap-2">
      <Btn
        size="sm"
        variant="ghost"
        disabled={pageIndex === 0}
        onClick={onFirst}
        title={t("queries.first_page", { defaultValue: "First page (live)" })}
      >
        <ChevronsLeft size={13} />
      </Btn>
      <Btn size="sm" variant="ghost" disabled={pageIndex === 0} onClick={onPrev}>
        {t("common.prev")}
      </Btn>
      <span className="text-muted text-xs tabular-nums">
        {t("queries.page", { n: pageIndex + 1, defaultValue: "Page {{n}}" })} · {pageStart}–
        {pageEnd}
      </span>
      <Btn size="sm" variant="ghost" disabled={atEnd} onClick={onNext}>
        {t("common.next")}
      </Btn>
    </div>
  );
}
