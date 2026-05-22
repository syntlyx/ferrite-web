import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RefreshCw, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/layout/Card";
import { Spinner } from "@/components/feedback/Spinner";
import { Err } from "@/components/feedback/Err";
import {
  Btn,
  IconBtn,
  Input,
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
import type { AddAliasBody, ClientAlias, ClientEntry } from "@/api/types";

// ── Aliases panel ─────────────────────────────────────────────────────────────

const addrTypeBadgeCls = "rounded px-1.5 py-0.5 text-[10px] font-medium";
type AliasKeyType = "IP" | "MAC";

function TypeToggle({
  value,
  onChange,
}: {
  value: AliasKeyType;
  onChange: (type: AliasKeyType) => void;
}) {
  return (
    <div className="flex shrink-0">
      {(["IP", "MAC"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={cn(
            "border-bdr -mr-px border px-3 py-2 text-xs transition-colors first:rounded-l-lg last:mr-0 last:rounded-r-lg",
            value === t
              ? "border-teal/40 bg-teal/15 text-teal relative z-10"
              : "bg-sidebar text-muted hover:text-body",
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
  return <span className={cn(addrTypeBadgeCls, "bg-teal/10 text-teal/70")}>IPv4</span>;
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

function AliasesPanel() {
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

  const placeholder =
    addrType === "MAC" ? t("clients.mac_placeholder") : t("clients.ip_placeholder");

  async function handleAdd(e: FormEvent) {
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
        <div className="space-y-1">
          <span className="text-muted block text-[10px] uppercase tracking-wider">
            {t("clients.col_type")}
          </span>
          <TypeToggle
            value={addrType}
            onChange={(t) => {
              setAddrType(t);
              setForm((p) => ({ ...p, address: "" }));
            }}
          />
        </div>
        <label className="min-w-0 space-y-1">
          <span className="text-muted block text-[10px] uppercase tracking-wider">
            {t("clients.col_address")}
          </span>
          <Input
            value={form.address}
            onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            placeholder={placeholder}
            className="w-full font-mono"
          />
        </label>
        <label className="min-w-0 space-y-1">
          <span className="text-muted block text-[10px] uppercase tracking-wider">
            {t("clients.col_name")}
          </span>
          <Input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder={t("clients.alias_name_placeholder")}
            className="w-full"
          />
        </label>
        <Btn
          type="submit"
          disabled={adding || !form.address.trim() || !form.name.trim()}
          className="h-9"
        >
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Clients() {
  const { t } = useTranslation();
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [blockingEnabled, setBlockingEnabled] = useState(true);
  const [bypassKeys, setBypassKeys] = useState<string[]>([]);
  const [togglingBlocking, setTogglingBlocking] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const [data, settings] = await Promise.all([api.clients(100), api.getSettings()]);
      setClients(data.clients ?? []);
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

  const maxTotal = clients[0]?.total ?? 1;

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

  return (
    <div className="p-6">
      <PageHeader
        title={t("clients.title")}
        subtitle={t("clients.subtitle")}
        action={
          <Btn variant="ghost" onClick={load} disabled={loading}>
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
        <Card className="p-0! mb-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-bdr border-b">
                <Th className="w-8">{t("clients.col_rank")}</Th>
                <Th>{t("clients.col_client")}</Th>
                <Th>{t("clients.col_ips")}</Th>
                <Th className="w-36">{t("clients.col_activity")}</Th>
                <Th className="text-right">{t("clients.col_total")}</Th>
                <Th className="text-right">{t("clients.col_blocked")}</Th>
                <Th className="text-right">{t("clients.col_filtering")}</Th>
                <Th className="text-right">{t("clients.col_last_seen")}</Th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <EmptyRow cols={8} message={t("clients.no_data")} />
              ) : (
                clients.map((c, i) => {
                  const blockedPct = c.total > 0 ? (c.blocked / c.total) * 100 : 0;
                  const filteringOn = blockingEnabled && !c.blocking_bypassed;
                  return (
                    <TableRow key={c.name + i}>
                      <Td className="text-muted tabular-nums">{i + 1}</Td>
                      <Td>
                        <Link
                          to={`/queries?client_ip=${encodeURIComponent((c.ips.length > 0 ? c.ips : [c.name]).join(","))}`}
                          className="text-heading hover:text-teal font-medium transition-colors"
                        >
                          {c.name}
                        </Link>
                        {c.is_alias && (
                          <span className="bg-teal/10 text-teal/70 ml-1.5 rounded px-1 py-0.5 text-[10px]">
                            {t("clients.alias_badge")}
                          </span>
                        )}
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
                          color={i === 0 ? "bg-teal" : "bg-teal/40"}
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
                              filteringOn
                                ? "bg-teal/10 text-teal"
                                : "bg-warn/10 text-warn",
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
                        {fmtRelTime(c.last_seen)}
                      </Td>
                    </TableRow>
                  );
                })
              )}
            </tbody>
          </table>
        </Card>
      )}

      {!loading && clients.length === 0 && !err && (
        <Card className="mb-4">
          <p className="text-muted py-4 text-center text-xs">{t("clients.no_data")}</p>
        </Card>
      )}

      <AliasesPanel />
    </div>
  );
}
