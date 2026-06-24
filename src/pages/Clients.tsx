import { useEffect, useMemo, useState } from "react";
import type { SubmitEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  RefreshCw,
  Plus,
  Trash2,
  Search,
  Users,
  Activity,
  BarChart3,
  ShieldOff,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/layout/Card";
import { FilterBar } from "@/components/layout/FilterBar";
import { StatusTile } from "@/components/layout/SettingsPanel";
import { Spinner } from "@/components/feedback/Spinner";
import { Err } from "@/components/feedback/Err";
import {
  Btn,
  IconBtn,
  Input,
  SearchInput,
  Bar,
  SectionLabel,
  Skeleton,
  Th,
  Td,
  TableRow,
  EmptyRow,
  Switch,
} from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { fmt, fmtRelTime } from "@/lib/format";
import { deviceTokens } from "@/api/clients";
import type { AddAliasBody, ClientAlias, ClientEntry } from "@/api/types";

// ── Aliases panel ─────────────────────────────────────────────────────────────

const addrTypeBadgeCls = "rounded px-1.5 py-0.5 text-[10px] font-medium";
type AliasKeyType = "IP" | "MAC";

/** A request from a client row to prefill the aliases form. `nonce` bumps on each
 *  click so re-naming the same device re-triggers the prefill effect. */
type AliasPrefill = { type: AliasKeyType; address: string; nonce: number };

function TypeToggle({
  value,
  onChange,
}: {
  value: AliasKeyType;
  onChange: (type: AliasKeyType) => void;
}) {
  return (
    <div className="border-bdr/80 rounded-xs flex w-fit shrink-0 overflow-hidden border">
      {(["IP", "MAC"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={cn(
            "border-bdr/60 not-last:border-r px-3.5 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.06em] transition-colors",
            value === t
              ? "bg-ember-dim text-ember"
              : "bg-sidebar/90 text-muted hover:bg-white/4 hover:text-heading",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function AddrTypeBadge({ alias }: { alias: ClientAlias }) {
  if (alias.mac)
    return <span className={cn(addrTypeBadgeCls, "bg-upstream/10 text-upstream/80")}>MAC</span>;
  if (alias.ip?.includes(":"))
    return <span className={cn(addrTypeBadgeCls, "bg-warn/10 text-warn/80")}>IPv6</span>;
  return <span className={cn(addrTypeBadgeCls, "bg-ember/10 text-ember/70")}>IPv4</span>;
}

function aliasKey(a: ClientAlias): string {
  return a.mac ?? a.ip ?? "";
}

function uniqueKeys(keys: string[]): string[] {
  return Array.from(new Set(keys.filter(Boolean)));
}

function clientBlockingKeys(client: ClientEntry): string[] {
  return uniqueKeys([...client.ips, ...client.macs]);
}

/** Recency dot: live (<5 min, glowing), recent (<24h), or idle. */
function lastSeenDot(lastSeen: number): string {
  const age = Date.now() / 1000 - lastSeen;
  if (age < 300) return "bg-ember shadow-[0_0_6px_var(--color-ember)]";
  if (age < 86400) return "bg-ember/40";
  return "bg-muted/30";
}

function AliasesPanel({ prefill }: { prefill: AliasPrefill | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [aliases, setAliases] = useState<ClientAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [addrType, setAddrType] = useState<AliasKeyType>("IP");
  const [form, setForm] = useState({ address: "", name: "" });
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [removing, setRemoving] = useState("");

  useEffect(() => {
    api
      .getAliases()
      .then((d) => setAliases(d.aliases ?? []))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  // A client row asked to name a device: fill in its address + type, then scroll
  // to and focus the name field so the user only types the label.
  useEffect(() => {
    if (!prefill) return;
    setAddrType(prefill.type);
    setForm((p) => ({ ...p, address: prefill.address }));
    const el = document.getElementById("alias-name-input");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }, [prefill]);

  const placeholder =
    addrType === "MAC" ? t("clients.mac_placeholder") : t("clients.ip_placeholder");

  async function handleAdd(e: SubmitEvent) {
    e.preventDefault();
    const addr = form.address.trim();
    if (!addr || !form.name.trim()) return;
    setAdding(true);
    setAddErr("");
    const body: AddAliasBody =
      addrType === "MAC"
        ? { mac: addr, name: form.name.trim() }
        : { ip: addr, name: form.name.trim() };
    try {
      await api.addAlias(body);
      const newAlias = { ...body };
      setAliases((p) => {
        const filtered = p.filter((a) => aliasKey(a) !== aliasKey(newAlias));
        return [...filtered, newAlias].sort((a, b) => aliasKey(a).localeCompare(aliasKey(b)));
      });
      toast(t("clients.alias_saved", { addr }));
      setForm({ address: "", name: "" });
    } catch (e) {
      setAddErr((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(alias: ClientAlias) {
    const key = aliasKey(alias);
    if (!(await confirm(t("clients.remove_alias_confirm", { key })))) return;
    setRemoving(key);
    try {
      await api.removeAlias(key);
      setAliases((p) => p.filter((a) => aliasKey(a) !== key));
      toast(t("clients.alias_removed", { key }));
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setRemoving("");
  }

  return (
    <Card>
      {ConfirmDialog}
      <SectionLabel>{t("clients.manual_aliases")}</SectionLabel>
      {err && <Err msg={err} />}

      <form
        onSubmit={handleAdd}
        className="mb-4 grid grid-cols-1 gap-2 lg:grid-cols-[auto_minmax(16rem,1fr)_minmax(10rem,14rem)_auto] lg:items-end"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-muted text-xs">{t("clients.col_type")}</span>
          <TypeToggle
            value={addrType}
            onChange={(t) => {
              setAddrType(t);
              setForm((p) => ({ ...p, address: "" }));
            }}
          />
        </div>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-muted text-xs">{t("clients.col_address")}</span>
          <Input
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            placeholder={placeholder}
            className="w-full font-mono"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-muted text-xs">{t("clients.col_name")}</span>
          <Input
            id="alias-name-input"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder={t("clients.alias_name_placeholder")}
            className="w-full"
          />
        </label>
        <Btn type="submit" disabled={adding || !form.address.trim() || !form.name.trim()}>
          <Plus size={12} /> {t("clients.add_alias")}
        </Btn>
        {addErr && <p className="text-blocked text-xs lg:col-span-4">{addErr}</p>}
      </form>

      {loading ? (
        <Spinner />
      ) : aliases.length === 0 ? (
        <p className="text-muted text-xs">{t("clients.no_aliases")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-bdr border-b">
                <Th className="w-14">{t("clients.col_type")}</Th>
                <Th>{t("clients.col_address")}</Th>
                <Th>{t("clients.col_name")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {aliases.map((a) => (
                <TableRow key={aliasKey(a)} className="group">
                  <Td>
                    <AddrTypeBadge alias={a} />
                  </Td>
                  <Td className="text-body font-mono">{a.mac ?? a.ip}</Td>
                  <Td className="text-heading">{a.name}</Td>
                  <Td className="text-right">
                    <IconBtn
                      danger
                      onClick={() => handleRemove(a)}
                      disabled={removing === aliasKey(a)}
                      className="opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </IconBtn>
                  </Td>
                </TableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Sortable column header ─────────────────────────────────────────────────────

type SortKey = "name" | "total" | "blocked" | "last_seen";
type SortState = { key: SortKey; dir: "asc" | "desc" };
const LOAD_STEP = 100;

function SortHeader({
  label,
  field,
  sort,
  onSort,
  className,
}: {
  label: string;
  field: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === field;
  return (
    <Th className={className}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "group inline-flex items-center gap-1 align-middle font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors hover:text-heading",
          active ? "text-ember" : "text-muted",
        )}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ChevronUp size={11} />
          ) : (
            <ChevronDown size={11} />
          )
        ) : (
          <ChevronsUpDown
            size={11}
            className="opacity-0 transition-opacity group-hover:opacity-40"
          />
        )}
      </button>
    </Th>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Clients() {
  const { t } = useTranslation();
  const toast = useToast();
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [limit, setLimit] = useState(LOAD_STEP);
  const [err, setErr] = useState("");
  const [blockingEnabled, setBlockingEnabled] = useState(true);
  const [bypassKeys, setBypassKeys] = useState<string[]>([]);
  const [togglingBlocking, setTogglingBlocking] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "total", dir: "desc" });
  const [prefill, setPrefill] = useState<AliasPrefill | null>(null);

  // Hand a client's address to the aliases form below (prefer MAC — it follows
  // the device across IPs). Clients with neither an IP nor MAC can't be aliased.
  function nameDevice(c: ClientEntry) {
    const mac = c.macs[0];
    const ip = c.ips[0];
    if (!mac && !ip) return;
    setPrefill((p) => ({
      type: mac ? "MAC" : "IP",
      address: mac ?? ip,
      nonce: (p?.nonce ?? 0) + 1,
    }));
  }

  async function load(nextLimit = limit) {
    setLoading(true);
    setErr("");
    try {
      const [data, settings] = await Promise.all([api.clients(nextLimit), api.getSettings()]);
      setClients(data.clients ?? []);
      setLimit(nextLimit);
      setBlockingEnabled(settings.blocklist?.enabled ?? true);
      setBypassKeys(settings.blocklist?.client_bypass ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Fetch a larger top-N and swap in the bigger list. The server has no total
  // count, so "there may be more" is inferred from getting a full page back.
  async function loadMore() {
    const next = limit + LOAD_STEP;
    setLoadingMore(true);
    try {
      const data = await api.clients(next);
      setClients(data.clients ?? []);
      setLimit(next);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleClientBlocking(client: ClientEntry) {
    const keys = clientBlockingKeys(client);
    if (keys.length === 0) return;

    const token = client.name;
    setTogglingBlocking(token);
    try {
      const nextBypass = client.blocking_bypassed
        ? bypassKeys.filter((key) => !keys.includes(key))
        : uniqueKeys([...bypassKeys, ...keys]);

      await api.patchSettings({ blocklist_client_bypass: nextBypass });
      window.dispatchEvent(new Event("ferrite:settings-changed"));
      setBypassKeys(nextBypass);
      setClients((prev) =>
        prev.map((item) =>
          item === client || item.name === client.name
            ? { ...item, blocking_bypassed: !client.blocking_bypassed }
            : item,
        ),
      );
      toast(
        client.blocking_bypassed
          ? t("clients.filtering_enabled_toast", { name: client.name })
          : t("clients.filtering_bypassed_toast", { name: client.name }),
      );
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setTogglingBlocking("");
    }
  }

  // Clients arrive sorted by query count; capture that rank before any re-sort so
  // the "#" column always means "rank by queries", whatever the active sort is.
  const maxTotal = clients[0]?.total ?? 1;
  const rankOf = useMemo(
    () => new Map(clients.map((c, i) => [c, i + 1] as const)),
    [clients],
  );
  const hasMore = clients.length >= limit;

  const nowSec = Date.now() / 1000;
  const active24 = clients.filter((c) => nowSec - c.last_seen < 86400).length;
  const totalQueries = clients.reduce((sum, c) => sum + c.total, 0);
  const bypassing = clients.filter((c) => c.blocking_bypassed).length;

  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = clients.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.ips.some((ip) => ip.toLowerCase().includes(q)) ||
        c.macs.some((m) => m.toLowerCase().includes(q)),
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let d = 0;
      if (sort.key === "name") d = a.name.localeCompare(b.name);
      else if (sort.key === "total") d = a.total - b.total;
      else if (sort.key === "blocked") d = a.blocked - b.blocked;
      else d = a.last_seen - b.last_seen;
      return d * dir;
    });
  }, [clients, search, sort]);

  return (
    <PageContainer>
      <PageHeader
        title={t("clients.title")}
        subtitle={t("clients.subtitle")}
        action={
          <Btn variant="ghost" onClick={() => load()} disabled={loading}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> {t("common.refresh")}
          </Btn>
        }
      />
      {err && <Err msg={err} />}

      {loading && !clients.length && (
        <Card className="p-0! mb-4 overflow-hidden">
          <div className="space-y-3 p-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-2 w-32" />
                <Skeleton className="ml-auto h-4 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {clients.length > 0 && (
        <>
          {/* ── Overview ── */}
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatusTile
              icon={Users}
              label={t("clients.tile_clients", { defaultValue: "Clients" })}
              value={`${clients.length}${hasMore ? "+" : ""}`}
              sub={t("clients.tile_clients_sub", { defaultValue: "tracked" })}
            />
            <StatusTile
              icon={Activity}
              label={t("clients.tile_active", { defaultValue: "Active (24h)" })}
              value={active24}
              sub={t("clients.tile_active_sub", { defaultValue: "seen recently" })}
              tone="upstream"
            />
            <StatusTile
              icon={BarChart3}
              label={t("clients.tile_queries", { defaultValue: "Queries" })}
              value={fmt(totalQueries)}
              sub={t("clients.tile_queries_sub", { defaultValue: "across clients" })}
            />
            <StatusTile
              icon={ShieldOff}
              label={t("clients.tile_bypassing", { defaultValue: "Bypassing filter" })}
              value={bypassing}
              sub={t("clients.tile_bypassing_sub", { defaultValue: "clients" })}
              tone={bypassing > 0 ? "warn" : "muted"}
            />
          </div>

          {/* ── Toolbar ── */}
          <FilterBar
            meta={
              <>
                {search
                  ? t("clients.count_filtered", {
                      shown: view.length,
                      total: clients.length,
                      defaultValue: "{{shown}} of {{total}}",
                    })
                  : t("clients.count", {
                      count: clients.length,
                      defaultValue: "{{count}} clients",
                    })}
                {hasMore ? "+" : ""}
              </>
            }
          >
            <SearchInput
              icon={Search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("clients.filter_placeholder", {
                defaultValue: "Filter by name, IP or MAC…",
              })}
              className="w-full min-w-0 lg:flex-1"
              inputClass="font-mono"
            />
          </FilterBar>

          <Card className="p-0! mb-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-bdr border-b">
                  <Th className="w-8">{t("clients.col_rank")}</Th>
                  <SortHeader
                    label={t("clients.col_client")}
                    field="name"
                    sort={sort}
                    onSort={onSort}
                  />
                  <Th>{t("clients.col_ips")}</Th>
                  <Th className="w-36">{t("clients.col_activity")}</Th>
                  <SortHeader
                    label={t("clients.col_total")}
                    field="total"
                    sort={sort}
                    onSort={onSort}
                    className="text-right"
                  />
                  <SortHeader
                    label={t("clients.col_blocked")}
                    field="blocked"
                    sort={sort}
                    onSort={onSort}
                    className="text-right"
                  />
                  <Th className="text-right">{t("clients.col_filtering")}</Th>
                  <SortHeader
                    label={t("clients.col_last_seen")}
                    field="last_seen"
                    sort={sort}
                    onSort={onSort}
                    className="text-right"
                  />
                </tr>
              </thead>
              <tbody>
                {view.length === 0 ? (
                  <EmptyRow
                    cols={8}
                    message={t("clients.no_match", {
                      defaultValue: "No clients match your filter.",
                    })}
                  />
                ) : (
                  view.map((c) => {
                    const rank = rankOf.get(c) ?? 0;
                    const blockedPct = c.total > 0 ? (c.blocked / c.total) * 100 : 0;
                    const filteringOn = blockingEnabled && !c.blocking_bypassed;
                    const canName = Boolean(c.macs[0] || c.ips[0]);
                    return (
                      <TableRow key={c.name + rank} className="group">
                        <Td className="text-muted tabular-nums">{rank}</Td>
                        <Td>
                          <div className="flex items-center gap-1.5">
                            <Link
                              to={`/queries?device=${encodeURIComponent(deviceTokens(c).join(","))}`}
                              className="text-heading hover:text-ember font-medium transition-colors"
                            >
                              {c.name}
                            </Link>
                            {c.is_alias && (
                              <span className="bg-ember/10 text-ember/70 rounded px-1 py-0.5 text-[10px]">
                                {t("clients.alias_badge")}
                              </span>
                            )}
                            {canName && (
                              <IconBtn
                                onClick={() => nameDevice(c)}
                                title={t("clients.name_device", { defaultValue: "Name this device" })}
                                className="opacity-0 transition-opacity group-hover:opacity-100"
                              >
                                <Tag size={11} />
                              </IconBtn>
                            )}
                          </div>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {c.ips.map((ip) => (
                              <span key={ip} className="text-muted font-mono text-[10px]">
                                {ip}
                              </span>
                            ))}
                          </div>
                        </Td>
                        <Td>
                          <Bar
                            value={(c.total / maxTotal) * 100}
                            color={rank === 1 ? "bg-ember" : "bg-ember/40"}
                          />
                        </Td>
                        <Td className="text-body text-right tabular-nums">{fmt(c.total)}</Td>
                        <Td className="text-right">
                          <span className="text-blocked tabular-nums">{fmt(c.blocked)}</span>
                          {c.total > 0 && (
                            <span className="text-muted ml-1">({blockedPct.toFixed(0)}%)</span>
                          )}
                        </Td>
                        <Td className="text-right">
                          <div className="inline-flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                filteringOn ? "bg-ember/10 text-ember" : "bg-warn/10 text-warn",
                              )}
                            >
                              {!blockingEnabled
                                ? t("clients.filtering_global_off")
                                : c.blocking_bypassed
                                  ? t("clients.filtering_bypassed")
                                  : t("clients.filtering_on")}
                            </span>
                            <Switch
                              checked={filteringOn}
                              onCheckedChange={() => toggleClientBlocking(c)}
                              disabled={!blockingEnabled || togglingBlocking === c.name}
                            />
                          </div>
                        </Td>
                        <Td className="text-muted whitespace-nowrap text-right">
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <span
                              className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                lastSeenDot(c.last_seen),
                              )}
                            />
                            {fmtRelTime(c.last_seen)}
                          </span>
                        </Td>
                      </TableRow>
                    );
                  })
                )}
              </tbody>
            </table>
          </Card>

          {hasMore && (
            <div className="mb-4 flex justify-center">
              <Btn variant="ghost" onClick={loadMore} disabled={loadingMore}>
                <ChevronDown size={12} className={loadingMore ? "animate-pulse" : ""} />
                {t("clients.load_more", { defaultValue: "Load more" })}
              </Btn>
            </div>
          )}
        </>
      )}

      {!loading && clients.length === 0 && !err && (
        <Card className="mb-4">
          <p className="text-muted py-4 text-center text-xs">{t("clients.no_data")}</p>
        </Card>
      )}

      <AliasesPanel prefill={prefill} />
    </PageContainer>
  );
}
