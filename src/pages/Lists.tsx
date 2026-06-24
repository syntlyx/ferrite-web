import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, RefreshCw, ExternalLink, Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/layout/Card";
import { Err } from "@/components/feedback/Err";
import {
  Input,
  Btn,
  IconBtn,
  SectionLabel,
  Switch,
  Skeleton,
  Th,
  Td,
  TableRow,
  EmptyRow,
  Tooltip,
} from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import type { SubscriptionList } from "@/api/types";
import { LIST_CATALOG } from "@/data/list-catalog";
import type { CatalogCategory, CatalogList } from "@/data/list-catalog";

/** Badge colour per catalog category. Typed as a full Record so adding a new
 *  category to the catalog forces an update here (compile error otherwise). */
const CATEGORY_BADGE: Record<CatalogCategory, string> = {
  general: "bg-upstream/10 text-upstream",
  ads: "bg-ember/10 text-ember",
  tracking: "bg-warn/10 text-warn",
  malware: "bg-blocked/10 text-blocked",
  phishing: "bg-blocked/10 text-blocked",
  adult: "bg-white/5 text-muted",
  gambling: "bg-white/5 text-muted",
};

export default function Lists() {
  const { t } = useTranslation();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [lists, setLists] = useState<SubscriptionList[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState("");
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [removing, setRemoving] = useState("");
  const [toggling, setToggling] = useState("");

  const [form, setForm] = useState({ url: "", name: "", enabled: true });
  const [adding, setAdding] = useState(false);
  // URL of the catalog entry currently being added (for per-item spinner).
  const [addingCatalog, setAddingCatalog] = useState("");

  // Bumped by every mutating action so the long (up to 5-min) refresh-all
  // doesn't clobber a toggle/remove that ran while it was in flight.
  const opSeq = useRef(0);

  // Catalog entries already subscribed (matched by URL) are shown as added.
  const addedUrls = new Set(lists.map((l) => l.url));

  useEffect(() => {
    api
      .getLists()
      .then((d) => setLists(d.lists ?? []))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: SubmitEvent) {
    e.preventDefault();
    if (!form.url.trim() || !form.name.trim()) return;
    setAdding(true);
    try {
      const d = await api.addList(form);
      setLists((p) => [...p, d.list]);
      setForm({ url: "", name: "", enabled: true });
      toast(`"${form.name}" added`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setAdding(false);
    }
  }

  async function addFromCatalog(item: CatalogList) {
    if (addedUrls.has(item.url) || addingCatalog) return;
    opSeq.current++;
    setAddingCatalog(item.url);
    try {
      const d = await api.addList({ name: item.name, url: item.url, enabled: true });
      setLists((p) => (p.some((l) => l.url === item.url) ? p : [...p, d.list]));
      toast(`"${item.name}" added`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setAddingCatalog("");
  }

  async function handleToggle(l: SubscriptionList) {
    opSeq.current++;
    setToggling(l.name);
    try {
      const d = await api.toggleList(l.name, { enabled: !l.enabled });
      setLists((p) => p.map((item) => (item.name === l.name ? d.list : item)));
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setToggling("");
  }

  async function handleRefresh(name: string) {
    setRefreshing(name);
    try {
      const d = await api.refreshList(name);
      setLists((p) =>
        p.map((l) =>
          l.name === name
            ? { ...l, domains_loaded: d.domains_loaded, parse_stats: d.parse_stats }
            : l,
        ),
      );
      toast(t("lists.refresh_toast", { name, count: d.domains_loaded }));
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setRefreshing("");
  }

  async function handleRefreshAll() {
    const seq = ++opSeq.current;
    setRefreshingAll(true);
    try {
      const { lists: updated } = await api.refreshAllLists();
      // The refresh response may omit domains_loaded — re-fetch for
      // authoritative counts so the column never degrades to "—".
      const fresh = await api
        .getLists()
        .then((d) => d.lists ?? updated)
        .catch(() => updated);
      // A toggle/remove ran during the refresh — don't overwrite it with our
      // now-stale snapshot.
      if (seq !== opSeq.current) return;
      setLists(fresh);
      const total = fresh.reduce((sum, l) => sum + (l.domains_loaded ?? 0), 0);
      toast(t("lists.refresh_all_toast", { count: updated.length, total: fmt(total) }));
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setRefreshingAll(false);
  }

  async function handleRemove(name: string) {
    if (!(await confirm(t("lists.remove_confirm", { name })))) return;
    opSeq.current++;
    setRemoving(name);
    try {
      await api.removeList(name);
      setLists((p) => p.filter((l) => l.name !== name));
      toast(`"${name}" removed`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setRemoving("");
  }

  return (
    <PageContainer>
      {ConfirmDialog}
      <PageHeader
        title={t("lists.title")}
        subtitle={t("lists.subtitle")}
        action={
          lists.length > 1 && (
            <Btn
              variant="ghost"
              onClick={handleRefreshAll}
              disabled={refreshingAll || !!refreshing}
            >
              <RefreshCw size={12} className={refreshingAll ? "animate-spin" : ""} />
              {refreshingAll ? t("lists.refreshing_all") : t("lists.refresh_all")}
            </Btn>
          )
        }
      />
      {err && <Err msg={err} />}

      {/* Add form */}
      <Card className="mb-4">
        <SectionLabel>{t("lists.add_list")}</SectionLabel>
        <form
          onSubmit={handleAdd}
          className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(12rem,18rem)_minmax(16rem,1fr)_auto]"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted text-xs">{t("lists.col_name")}</span>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder={t("lists.name_placeholder")}
              className="w-full"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-muted text-xs">{t("lists.col_url")}</span>
            <Input
              value={form.url}
              onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
              placeholder={t("lists.url_placeholder")}
              className="w-full font-mono"
            />
          </div>
          <Btn
            type="submit"
            disabled={adding || !form.url.trim() || !form.name.trim()}
            className="self-end"
          >
            <Plus size={12} /> {t("lists.add")}
          </Btn>
        </form>
      </Card>

      {/* Recommended catalog — add popular lists in one click */}
      <Card className="mb-4">
        <SectionLabel>{t("lists.recommended", { defaultValue: "Recommended lists" })}</SectionLabel>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {LIST_CATALOG.map((item) => {
            const added = addedUrls.has(item.url);
            const busy = addingCatalog === item.url;
            return (
              <button
                key={item.url}
                type="button"
                onClick={() => addFromCatalog(item)}
                disabled={added || !!addingCatalog}
                className={cn(
                  "rounded-xs flex items-start gap-2.5 border px-3 py-2 text-left transition-colors",
                  added
                    ? "border-bdr bg-sidebar/40 cursor-default"
                    : "border-bdr bg-sidebar hover:border-ember/40 disabled:opacity-50",
                )}
              >
                <span className="mt-0.5 shrink-0">
                  {added ? (
                    <Check size={13} className="text-ember" />
                  ) : busy ? (
                    <RefreshCw size={13} className="text-muted animate-spin" />
                  ) : (
                    <Plus size={13} className="text-muted" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-heading truncate text-xs font-medium">{item.name}</span>
                    {item.recommended && (
                      <span
                        title={t("lists.recommended_badge", { defaultValue: "Recommended" })}
                        className="shrink-0"
                      >
                        <Star size={10} className="fill-ember text-ember" />
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-xs shrink-0 px-1 py-0.5 text-[9px] uppercase tracking-wide",
                        CATEGORY_BADGE[item.category],
                      )}
                    >
                      {item.category}
                    </span>
                  </span>
                  <span className="text-muted mt-0.5 block truncate text-[11px]">
                    {added ? t("lists.added", { defaultValue: "Added" }) : item.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0! overflow-x-auto">
        {loading && (
          <div className="space-y-3 p-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-8" />
              </div>
            ))}
          </div>
        )}
        {!loading && (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-bdr border-b">
                <Th>{t("lists.col_name")}</Th>
                <Th>{t("lists.col_url")}</Th>
                <Th>{t("lists.col_domains")}</Th>
                <Th>{t("lists.col_enabled")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {lists.length === 0 ? (
                <EmptyRow cols={5} message={t("lists.no_lists")} />
              ) : (
                lists.map((l) => (
                  <TableRow key={l.name}>
                    <Td className="text-heading font-medium">{l.name}</Td>
                    <Td className="text-muted max-w-xs font-mono">
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-ember flex items-center gap-1 truncate transition-colors"
                      >
                        <span className="truncate">{l.url}</span>
                        <ExternalLink size={10} className="shrink-0" />
                      </a>
                    </Td>
                    <Td
                      className={cn(
                        "font-mono tabular-nums",
                        (refreshing === l.name || (refreshingAll && l.enabled)) &&
                          "text-muted animate-pulse",
                      )}
                    >
                      <span className="text-body block">
                        {l.domains_loaded != null ? fmt(l.domains_loaded) : "—"}
                      </span>
                      {(() => {
                        const s = l.parse_stats;
                        if (!s) return null;
                        const skipped =
                          s.scoped_skipped + s.cosmetic_skipped + s.unsupported_skipped;
                        if (skipped === 0) return null;
                        const rows: [string, number][] = [
                          [t("lists.stat_cosmetic"), s.cosmetic_skipped],
                          [t("lists.stat_scoped"), s.scoped_skipped],
                          [t("lists.stat_unsupported"), s.unsupported_skipped],
                          [t("lists.stat_exceptions"), s.exceptions],
                        ];
                        return (
                          <Tooltip
                            className="min-w-44"
                            content={
                              <span className="block space-y-0.5">
                                <span className="text-muted mb-1 block text-[10px] uppercase tracking-wide">
                                  {t("lists.skipped_title")}
                                </span>
                                {rows.map(([label, val]) => (
                                  <span key={label} className="flex justify-between gap-6">
                                    <span className="text-muted">{label}</span>
                                    <span className="tabular-nums">{fmt(val)}</span>
                                  </span>
                                ))}
                              </span>
                            }
                          >
                            <span className="text-muted cursor-help text-[10px] tabular-nums">
                              {t("lists.skipped_short", { count: fmt(skipped) })}
                            </span>
                          </Tooltip>
                        );
                      })()}
                    </Td>
                    <Td>
                      <Switch
                        checked={l.enabled}
                        onCheckedChange={() => handleToggle(l)}
                        disabled={toggling === l.name}
                      />
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        <IconBtn
                          title="Re-fetch"
                          onClick={() => handleRefresh(l.name)}
                          disabled={refreshing === l.name || refreshingAll}
                        >
                          <RefreshCw
                            size={13}
                            className={
                              refreshing === l.name || (refreshingAll && l.enabled)
                                ? "animate-spin"
                                : ""
                            }
                          />
                        </IconBtn>
                        <IconBtn
                          danger
                          title="Remove"
                          onClick={() => handleRemove(l.name)}
                          disabled={removing === l.name}
                        >
                          <Trash2 size={13} />
                        </IconBtn>
                      </div>
                    </Td>
                  </TableRow>
                ))
              )}
            </tbody>
          </table>
        )}
      </Card>
    </PageContainer>
  );
}
