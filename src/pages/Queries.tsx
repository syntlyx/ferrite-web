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
import { RCODE_LABEL, RCODE_COLOR, qtypeName } from "@/lib/dns";
import { fmt } from "@/lib/format";
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
      className="text-muted hover:text-teal ml-1 inline-flex opacity-0 transition-all group-hover:opacity-100"
      title="Copy"
    >
      {copied ? <Check size={11} className="text-teal" /> : <Copy size={11} />}
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
          "bg-sidebar hover:border-teal/30 focus:border-teal flex h-9 w-full items-center gap-2 rounded-md border px-3 text-xs transition-colors focus:outline-none",
          selected.size > 0 ? "border-teal/40 text-body" : "border-bdr text-muted",
        )}
      >
        <Users size={12} className={selected.size > 0 ? "text-teal" : "text-muted"} />
        <span className="min-w-0 flex-1 truncate text-left">
          {label ?? t("queries.all_clients")}
        </span>
        <ChevronDown size={11} className="text-muted shrink-0" />
      </button>

      {open && (
        <div className="min-w-52 animate-fade-down border-bdr bg-card absolute left-0 top-full z-30 mt-1 rounded-lg border shadow-2xl">
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
                      selected.has(c.name) ? "border-teal bg-teal" : "border-bdr bg-transparent",
                    )}
                  >
                    {selected.has(c.name) && (
                      <Check size={9} className="text-[#0a0c10]" strokeWidth={3} />
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

  const [domainInput, setDomainInput] = useState(searchParams.get("domain") ?? "");
  const [filters, setFilters] = useState<QueryFilters>({
    domain: searchParams.get("domain") ?? "",
    client_ip: initialClientIps,
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

  const load = useCallback(async (f?: QueryFilters, { silent = false } = {}) => {
    const target = f ?? filtersRef.current;
    if (!silent) setLoading(true);
    setErr("");
    try {
      const data = await api.queries(target);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
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
        // Pre-select clients matching URL params
        if (initialClientIps) {
          const ipSet = new Set(initialClientIps.split(","));
          const matched = new Set(
            r.clients
              .filter((c) => c.ips.some((ip) => ipSet.has(ip)) || ipSet.has(c.name))
              .map((c) => c.name),
          );
          if (matched.size > 0) setSelectedClients(matched);
        }
      })
      .catch((e) => console.warn("Failed to load clients:", e));
  }, [load, initialClientIps]);

  // Debounced domain filter
  const initializedDomain = useRef(false);
  useEffect(() => {
    if (!initializedDomain.current) {
      initializedDomain.current = true;
      return;
    }
    resetPagination({ ...filtersRef.current, domain: debouncedDomain });
  }, [debouncedDomain, resetPagination]);

  // Auto-refresh
  const isLive = pageIndex === 0;
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => load(undefined, { silent: true }), AUTO_REFRESH);
    return () => clearInterval(id);
  }, [isLive, load]);

  function handleSelectFilter(key: keyof QueryFilters, val: QueryFilters[keyof QueryFilters]) {
    resetPagination({ ...filtersRef.current, [key]: val });
  }

  function handleClientChange(names: Set<string>) {
    setSelectedClients(names);
    const ips = clientList
      .filter((c) => names.has(c.name))
      .flatMap((c) => (c.ips.length > 0 ? c.ips : [c.name]))
      .join(",");
    resetPagination({ ...filtersRef.current, client_ip: ips });
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

  function filterByClient(ip: string) {
    const client = clientList.find((c) => c.ips.includes(ip) || c.name === ip);
    if (client) {
      handleClientChange(new Set([client.name]));
    } else {
      // Unknown client — fall back to raw IP
      resetPagination({ ...filtersRef.current, client_ip: ip });
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
                  <span className="bg-teal absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
                  <span className="bg-teal relative inline-flex h-2 w-2 rounded-full" />
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
                            className="hover:text-teal cursor-pointer truncate text-left transition-colors"
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
                            className="text-body hover:text-teal cursor-pointer font-mono transition-colors"
                            onClick={() => filterByClient(r.client_ip)}
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
