import { useEffect, useRef, useState, useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, RefreshCw, Download, Copy, Check, Trash2, ChevronDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/layout/Card";
import { Badge } from "@/components/feedback/Badge";
import { Err } from "@/components/feedback/Err";
import { SearchInput, Select, Btn, Th, Td, TableRow, EmptyRow, Skeleton } from "@/components/ui";
import { useDebounce } from "@/hooks/use-debounce";
import { useConfirm } from "@/hooks/use-confirm";
import { usePageVisible } from "@/hooks/use-page-visible";
import { RCODE_LABEL, RCODE_COLOR, qtypeName } from "@/lib/dns";
import { fmt } from "@/lib/format";
import { deviceTokens } from "@/api/clients";
import type { QueryEntry, QueryFilters, QueryStatus, ClientEntry } from "@/api/types";

// ── DNS helpers ───────────────────────────────────────────────────────────────

function RCodeBadge({ code }: { code: number }) {
  const label = RCODE_LABEL[code];
  if (!label) return null;
  return <span className={`font-mono text-xs ${RCODE_COLOR[code] ?? "text-muted"}`}>{label}</span>;
}

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const el = Object.assign(document.createElement("textarea"), {
      value: text,
      style: "position:fixed;opacity:0;pointer-events:none",
    });
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    if (ok) resolve();
    else reject(new Error("Copy failed"));
  });
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

const STATUSES: (QueryStatus | "")[] = ["", "allowed", "blocked", "cached", "upstream"];
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

export default function Queries() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const [rows, setRows] = useState<QueryEntry[]>([]);
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

  // Auto-refresh: only on the live first page and only while the tab is
  // visible. On return to a visible tab, catch up immediately.
  const isLive = pageIndex === 0;
  const pageVisible = usePageVisible();
  const wasHidden = useRef(false);
  useEffect(() => {
    if (!isLive) return;
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
  }, [isLive, pageVisible, refresh]);

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

  function filterByClient(row: QueryEntry) {
    const client = clientList.find(
      (c) =>
        c.ips.includes(row.client_ip) ||
        c.name === row.client_ip ||
        c.macs.includes(row.device),
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
    <div className="p-6">
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

      <Card className="mb-4 p-3">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(18rem,1fr)_minmax(10rem,14rem)_minmax(9rem,10rem)_8rem]">
          <SearchInput
            icon={Search}
            placeholder={t("queries.domain_placeholder")}
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            className="min-w-0"
            inputClass="h-9"
          />
          <ClientMultiSelect
            clients={clientList}
            selected={selectedClients}
            onChange={handleClientChange}
          />
          <Select
            value={filters.status ?? ""}
            onChange={(e) => handleSelectFilter("status", e.target.value as QueryStatus | "")}
            className="w-full"
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
            className="w-full"
          >
            {[50, 100, 250, 500].map((n) => (
              <option key={n} value={n}>
                {n} {t("common.rows")}
              </option>
            ))}
          </Select>
        </div>
      </Card>

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
            <table className="w-full text-xs">
              <thead>
                <tr className="border-bdr border-b">
                  <Th>{t("queries.col_time")}</Th>
                  <Th>{t("queries.col_domain")}</Th>
                  <Th>{t("queries.col_type")}</Th>
                  <Th>{t("queries.col_client")}</Th>
                  <Th>{t("queries.col_status")}</Th>
                  <Th>{t("queries.col_latency")}</Th>
                  <Th>{t("queries.col_rcode")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <EmptyRow cols={7} message={t("queries.no_queries")} />
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <Td className="text-muted whitespace-nowrap">
                        {new Date(r.timestamp).toLocaleTimeString()}
                      </Td>

                      <Td className="text-heading max-w-xs font-mono">
                        <span className="group flex items-center">
                          <button
                            className="hover:text-ember cursor-pointer truncate text-left transition-colors"
                            onClick={() => filterByDomain(r.domain)}
                            title={`Filter by ${r.domain}`}
                          >
                            {r.domain}
                          </button>
                          <CopyBtn text={r.domain} />
                        </span>
                      </Td>

                      <Td className="text-muted font-mono">{qtypeName(r.query_type)}</Td>

                      <Td>
                        <span className="group flex items-center gap-0.5">
                          <button
                            className="text-body hover:text-ember cursor-pointer font-mono transition-colors"
                            onClick={() => filterByClient(r)}
                            title={`Filter by ${r.client_ip}`}
                          >
                            {r.client_ip}
                          </button>
                          <CopyBtn text={r.client_ip} />
                        </span>
                        {r.client_name && r.client_name !== r.client_ip && (
                          <span className="text-muted block text-[10px]">{r.client_name}</span>
                        )}
                      </Td>

                      <Td>
                        <Badge status={r.status} />
                      </Td>
                      <Td className="text-muted tabular-nums">
                        {r.latency_ms != null ? `${r.latency_ms}ms` : "—"}
                      </Td>
                      <Td>
                        <RCodeBadge code={r.rcode} />
                      </Td>
                    </TableRow>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-3 flex items-center justify-end gap-3">
        <Btn variant="ghost" disabled={pageIndex === 0} onClick={() => paginate(-1)}>
          {t("common.prev")}
        </Btn>
        <span className="text-muted text-xs tabular-nums">
          {pageStart}–{pageEnd}
        </span>
        <Btn
          variant="ghost"
          disabled={rows.length < (filters.limit ?? 100)}
          onClick={() => paginate(1)}
        >
          {t("common.next")}
        </Btn>
      </div>
    </div>
  );
}
