import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, RefreshCw, ExternalLink } from "lucide-react";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
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
} from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import type { SubscriptionList } from "@/api/types";

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

  useEffect(() => {
    api
      .getLists()
      .then((d) => setLists(d.lists ?? []))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: FormEvent) {
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

  async function handleToggle(l: SubscriptionList) {
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
        p.map((l) => (l.name === name ? { ...l, domains_loaded: d.domains_loaded } : l)),
      );
      toast(t("lists.refresh_toast", { name, count: d.domains_loaded }));
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setRefreshing("");
  }

  async function handleRefreshAll() {
    setRefreshingAll(true);
    try {
      const { lists: updated } = await api.refreshAllLists();
      setLists(updated);
      const total = updated.reduce((sum, l) => sum + (l.domains_loaded ?? 0), 0);
      toast(t("lists.refresh_all_toast", { count: updated.length, total }));
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setRefreshingAll(false);
  }

  async function handleRemove(name: string) {
    if (!(await confirm(t("lists.remove_confirm", { name })))) return;
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
    <div className="p-6">
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
              {t("lists.refresh_all")}
            </Btn>
          )
        }
      />
      {err && <Err msg={err} />}

      {/* Add form */}
      <Card className="mb-4">
        <SectionLabel>{t("lists.add_list")}</SectionLabel>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
          <Input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder={t("lists.name_placeholder")}
            className="w-40"
          />
          <Input
            value={form.url}
            onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
            placeholder={t("lists.url_placeholder")}
            className="min-w-48 flex-1"
          />
          <Btn type="submit" disabled={adding || !form.url.trim() || !form.name.trim()}>
            <Plus size={12} /> {t("lists.add")}
          </Btn>
        </form>
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
                        className="hover:text-teal flex items-center gap-1 truncate transition-colors"
                      >
                        <span className="truncate">{l.url}</span>
                        <ExternalLink size={10} className="shrink-0" />
                      </a>
                    </Td>
                    <Td className="text-body tabular-nums">{l.domains_loaded ?? "—"}</Td>
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
                            className={refreshing === l.name ? "animate-spin" : ""}
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
    </div>
  );
}
