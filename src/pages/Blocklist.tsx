import { useActionState, useEffect, useMemo, useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Ban,
  CheckCircle2,
  Plus,
  Trash2,
  Search,
  ListFilter,
  ShieldPlus,
  ShieldMinus,
} from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { ServicePicker } from "@/components/ServicePicker";
import { SafeSearchControls } from "@/components/SafeSearchControls";
import type {
  DomainCheckResult,
  SafeSearchSettings,
  ServiceCatalog,
  ServiceInfo,
} from "@/api/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/layout/Card";
import { Err } from "@/components/feedback/Err";
import {
  Input,
  SearchInput,
  Btn,
  IconBtn,
  SectionLabel,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";

// ── Add form ──────────────────────────────────────────────────────────────────

function AddDomainForm({
  onAdd,
  placeholder,
}: {
  onAdd: (domain: string) => Promise<void>;
  placeholder: string;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");

  const [err, submit, pending] = useActionState<string, FormData>(async () => {
    const domain = value.trim().toLowerCase();
    if (!domain) return "";
    try {
      await onAdd(domain);
      setValue("");
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  }, "");

  return (
    <form action={submit} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 font-mono"
      />
      <Btn type="submit" disabled={pending || !value.trim()}>
        <Plus size={12} /> {t("blocklist.add")}
      </Btn>
      {err && <p className="text-blocked col-span-full text-xs">{err}</p>}
    </form>
  );
}

// ── Rule list (one tab: blacklist or whitelist) ──────────────────────────────────

/** The add form, filter, and scrollable domain list for one rule set. Rendered
 *  inside a tab, so it carries no Card/heading of its own — the tab labels it. */
function RuleList({
  tone,
  items,
  placeholder,
  onAdd,
  onRemove,
  removing,
}: {
  tone: "blocked" | "ember";
  items: string[];
  placeholder: string;
  onAdd: (domain: string) => Promise<void>;
  onRemove: (domain: string) => void;
  removing: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((d) => d.includes(q)) : items;
  }, [items, query]);

  // The left accent bar on each row echoes the rule kind (block = red, allow = ember).
  const accent = tone === "blocked" ? "before:bg-blocked/60" : "before:bg-ember/60";

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-3 space-y-2">
        <AddDomainForm onAdd={onAdd} placeholder={placeholder} />
        {items.length > 5 && (
          <div className="flex items-center gap-2">
            <SearchInput
              icon={ListFilter}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("blocklist.filter_placeholder")}
              inputClass="font-mono"
              className="flex-1"
            />
            {query.trim() && (
              <span className="text-muted shrink-0 font-mono text-[11px] tabular-nums">
                {filtered.length} / {items.length}
              </span>
            )}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-muted py-2 text-xs">{t("blocklist.empty")}</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted py-2 text-xs">{t("blocklist.no_matches")}</p>
      ) : (
        <div className="max-h-[28rem] space-y-0.5 overflow-y-auto">
          {filtered.map((domain) => (
            <div
              key={domain}
              className={cn(
                "hover:bg-white/3 rounded-xs group relative flex items-center justify-between gap-2 py-1.5 pl-3 pr-2",
                "before:absolute before:left-0 before:top-1/2 before:h-3.5 before:w-0.5 before:-translate-y-1/2 before:rounded-full",
                accent,
              )}
            >
              <span className="text-body min-w-0 truncate font-mono text-xs">{domain}</span>
              <IconBtn
                danger
                onClick={() => onRemove(domain)}
                disabled={removing === domain}
                className="opacity-35 group-hover:opacity-100"
                title={t("common.delete")}
              >
                <Trash2 size={12} />
              </IconBtn>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A tab trigger label with a tone-colored count pill. */
function RuleTab({ label, count, tone }: { label: string; count: number; tone: "blocked" | "ember" }) {
  const pill =
    tone === "blocked"
      ? "border-blocked/25 bg-blocked/10 text-blocked"
      : "border-ember/25 bg-ember/10 text-ember";
  return (
    <span className="flex items-center gap-1.5">
      {label}
      <span className={cn("rounded-full border px-1.5 tabular-nums", pill)}>{count}</span>
    </span>
  );
}

// ── Network-wide services ──────────────────────────────────────────────────────

/** Catalog services blocked for every device. Each toggle applies at once,
 *  like the manual rules below; per-device choices live on the Profiles page. */
function BlockedServicesCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([api.serviceCatalog(), api.getBlockedServices()])
      .then(([c, b]) => {
        setCatalog(c);
        setBlocked(b.services ?? []);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  async function toggle(s: ServiceInfo) {
    const on = !blocked.includes(s.id);
    const next = on ? [...blocked, s.id] : blocked.filter((id) => id !== s.id);
    setBusy(true);
    try {
      const r = await api.putBlockedServices(next);
      setBlocked(r.services);
      toast(
        on
          ? t("services.blocked_toast", { name: s.name, defaultValue: "{{name}} blocked for every device" })
          : t("services.unblocked_toast", { name: s.name, defaultValue: "{{name}} unblocked" }),
      );
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{t("services.title", { defaultValue: "Blocked services" })}</SectionLabel>
        {blocked.length > 0 && (
          <span className="text-blocked mb-3 font-mono text-[10px] tabular-nums">
            {t("services.blocked_count", { count: blocked.length, defaultValue: "{{count}} blocked" })}
          </span>
        )}
      </div>
      <p className="text-muted -mt-1 mb-3 text-xs leading-relaxed">
        {t("services.help", {
          defaultValue:
            "Block a whole service for every device: its sites, apps and media servers. An allowlist entry still exempts a single domain.",
        })}
      </p>
      {err ? (
        <Err msg={err} />
      ) : catalog ? (
        <ServicePicker catalog={catalog} selected={blocked} onToggle={(s) => void toggle(s)} disabled={busy} />
      ) : (
        <Skeleton className="h-28 w-full" />
      )}
      <p className="text-muted/80 mt-3 text-[11px]">
        {t("services.profiles_hint", {
          defaultValue: "To block a service only on some devices, use a profile.",
        })}{" "}
        <Link to="/profiles" className="text-ember hover:underline">
          {t("nav.profiles", { defaultValue: "Profiles" })} →
        </Link>
      </p>
    </Card>
  );
}

// ── Network-wide safe search ───────────────────────────────────────────────────

/** SafeSearch and YouTube Restricted Mode for every device; applies at once. */
function SafeSearchCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const [value, setValue] = useState<SafeSearchSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getSafeSearch()
      .then(setValue)
      .catch(() => {});
  }, []);

  async function change(next: SafeSearchSettings) {
    const prev = value;
    setValue(next);
    setBusy(true);
    try {
      await api.putSafeSearch(next);
      toast(t("safesearch.saved", { defaultValue: "Safe search updated" }));
    } catch (e) {
      setValue(prev);
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <SectionLabel>{t("safesearch.title", { defaultValue: "Safe search" })}</SectionLabel>
      <p className="text-muted -mt-1 mb-3 text-xs leading-relaxed">
        {t("safesearch.help", {
          defaultValue:
            "Filtered results on Google, Bing and DuckDuckGo, and Restricted Mode on YouTube, for every device — whatever the browser or app is set to. A profile can make it stricter for its devices.",
        })}
      </p>
      {value ? (
        <SafeSearchControls value={value} onChange={(v) => void change(v)} disabled={busy} />
      ) : (
        <Skeleton className="h-16 w-full" />
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Blocklist() {
  const { t } = useTranslation();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [black, setBlack] = useState<string[]>([]);
  const [white, setWhite] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [removing, setRemoving] = useState("");

  // Check domain state
  const [checkDomain, setCheckDomain] = useState("");
  const [checkResult, setCheckResult] = useState<DomainCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [quickActing, setQuickActing] = useState(false);

  useEffect(() => {
    Promise.all([api.getBlacklist(), api.getWhitelist()])
      .then(([b, w]) => {
        setBlack(b.blacklist ?? []);
        setWhite(w.whitelist ?? []);
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function runCheck(domain: string) {
    setChecking(true);
    try {
      setCheckResult(await api.checkDomain(domain));
    } catch {
      setCheckResult(null);
    } finally {
      setChecking(false);
    }
  }

  async function handleCheck(e: SubmitEvent) {
    e.preventDefault();
    const d = checkDomain.trim().toLowerCase();
    if (!d) return;
    await runCheck(d);
  }

  async function addBlack(domain: string) {
    // Use the server-normalized key (lowercase, no trailing dot) so the row
    // matches what a refetch returns and membership checks line up.
    const { domain: canonical } = await api.addBlacklist(domain);
    setBlack((p) => (p.includes(canonical) ? p : [...p, canonical].sort()));
    toast(t("blocklist.added_toast", { domain: canonical, list: t("blocklist.blacklist") }));
  }
  async function addWhite(domain: string) {
    const { domain: canonical } = await api.addWhitelist(domain);
    setWhite((p) => (p.includes(canonical) ? p : [...p, canonical].sort()));
    toast(t("blocklist.added_toast", { domain: canonical, list: t("blocklist.whitelist") }));
  }

  async function quickAdd(kind: "black" | "white") {
    if (!checkResult) return;
    setQuickActing(true);
    try {
      if (kind === "black") await addBlack(checkResult.domain);
      else await addWhite(checkResult.domain);
      await runCheck(checkResult.domain);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setQuickActing(false);
    }
  }

  async function removeBlack(domain: string) {
    if (!(await confirm(t("blocklist.remove_black_confirm", { domain })))) return;
    setRemoving(domain);
    try {
      await api.removeBlacklist(domain);
      setBlack((p) => p.filter((d) => d !== domain));
      toast(`"${domain}" removed`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setRemoving("");
  }
  async function removeWhite(domain: string) {
    if (!(await confirm(t("blocklist.remove_white_confirm", { domain })))) return;
    setRemoving(domain);
    try {
      await api.removeWhitelist(domain);
      setWhite((p) => p.filter((d) => d !== domain));
      toast(`"${domain}" removed`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setRemoving("");
  }

  const inBlack = checkResult ? black.includes(checkResult.domain) : false;
  const inWhite = checkResult ? white.includes(checkResult.domain) : false;

  return (
    <PageContainer>
      {ConfirmDialog}
      <PageHeader title={t("blocklist.title")} subtitle={t("blocklist.subtitle")} />
      {err && <Err msg={err} />}

      {/* Domain inspector */}
      <Card className="plate-ticks mb-4">
        <SectionLabel>{t("blocklist.quick_curate", { defaultValue: "Quick curate" })}</SectionLabel>
        <form onSubmit={handleCheck} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <SearchInput
            icon={Search}
            value={checkDomain}
            onChange={(e) => {
              setCheckDomain(e.target.value);
              setCheckResult(null);
            }}
            placeholder={t("blocklist.check_placeholder")}
            className="min-w-0"
            inputClass="font-mono"
          />
          <Btn variant="ghost" type="submit" disabled={checking || !checkDomain.trim()}>
            {t("blocklist.check_btn")}
          </Btn>
        </form>

        {checkResult && (
          <div className="animate-fade-up border-bdr/60 mt-3 space-y-3 border-t pt-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                <span
                  className={cn(
                    "rounded-xs flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]",
                    checkResult.blocked
                      ? "border-blocked/25 bg-blocked/10 text-blocked"
                      : "border-cached/25 bg-cached/10 text-cached",
                  )}
                >
                  {checkResult.blocked ? <Ban size={12} /> : <CheckCircle2 size={12} />}
                  {checkResult.blocked
                    ? t("blocklist.status_blocked")
                    : t("blocklist.status_allowed")}
                </span>
                <span className="text-heading min-w-0 truncate font-mono text-sm">
                  {checkResult.domain}
                </span>
                {checkResult.whitelisted && (
                  <span className="border-upstream/25 bg-upstream/10 text-upstream rounded-xs border px-2 py-0.5 text-[10px] font-medium">
                    {t("blocklist.whitelisted")}
                  </span>
                )}
                {inBlack && (
                  <span className="border-blocked/25 bg-blocked/10 text-blocked rounded-xs border px-2 py-0.5 text-[10px] font-medium">
                    {t("blocklist.in_blacklist")}
                  </span>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                {checkResult.blocked && !inWhite && (
                  <Btn variant="ghost" disabled={quickActing} onClick={() => quickAdd("white")}>
                    <ShieldPlus size={12} /> {t("blocklist.add_to_whitelist")}
                  </Btn>
                )}
                {!checkResult.blocked && !inBlack && (
                  <Btn variant="ghost" disabled={quickActing} onClick={() => quickAdd("black")}>
                    <ShieldMinus size={12} /> {t("blocklist.add_to_blacklist")}
                  </Btn>
                )}
              </div>
            </div>

            {/* Full attribution (matched sources, whitelist reason, routing) lives
             *  on the Tools page; here we keep only the quick add/exempt actions. */}
            <p className="text-muted/70 text-[11px]">
              {t("blocklist.full_check_hint", {
                defaultValue: "Matched sources and routing are on the Tools page.",
              })}
            </p>
          </div>
        )}
      </Card>

      <BlockedServicesCard />
      <SafeSearchCard />

      {/* Manual rules — blacklist / whitelist as tabs so uneven counts never
          leave one column dwarfing the other. */}
      {loading ? (
        <Card>
          <div className="space-y-3">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-5/6" />
          </div>
        </Card>
      ) : (
        <Card>
          <SectionLabel>{t("blocklist.manual_rules", { defaultValue: "Manual rules" })}</SectionLabel>
          <Tabs defaultValue="black" className="mt-1">
            <TabsList className="mb-3">
              <TabsTrigger value="black">
                <RuleTab label={t("blocklist.blacklist")} count={black.length} tone="blocked" />
              </TabsTrigger>
              <TabsTrigger value="white">
                <RuleTab label={t("blocklist.whitelist")} count={white.length} tone="ember" />
              </TabsTrigger>
            </TabsList>
            <TabsContent value="black">
              <RuleList
                tone="blocked"
                items={black}
                placeholder={t("blocklist.blacklist_placeholder")}
                onAdd={addBlack}
                onRemove={removeBlack}
                removing={removing}
              />
            </TabsContent>
            <TabsContent value="white">
              <RuleList
                tone="ember"
                items={white}
                placeholder={t("blocklist.whitelist_placeholder")}
                onAdd={addWhite}
                onRemove={removeWhite}
                removing={removing}
              />
            </TabsContent>
          </Tabs>
        </Card>
      )}

    </PageContainer>
  );
}
