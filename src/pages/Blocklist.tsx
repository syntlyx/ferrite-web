import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
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
import { cn } from "@/lib/utils";
import { api } from "@/api";
import type { DomainCheckResult } from "@/api/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/layout/Card";
import { Err } from "@/components/feedback/Err";
import { Input, SearchInput, Btn, IconBtn, SectionLabel, Skeleton } from "@/components/ui";
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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handle(e: FormEvent) {
    e.preventDefault();
    const domain = value.trim().toLowerCase();
    if (!domain) return;
    setLoading(true);
    setErr("");
    try {
      await onAdd(domain);
      setValue("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handle} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <Input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setErr("");
        }}
        placeholder={placeholder}
        className="min-w-0 font-mono"
      />
      <Btn type="submit" disabled={loading || !value.trim()}>
        <Plus size={12} /> {t("blocklist.add")}
      </Btn>
      {err && <p className="text-blocked col-span-full text-xs">{err}</p>}
    </form>
  );
}

// ── List column ───────────────────────────────────────────────────────────────

function ListPanel({
  label,
  tone,
  items,
  placeholder,
  onAdd,
  onRemove,
  removing,
}: {
  label: string;
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

  const badgeCls =
    tone === "blocked"
      ? "border-blocked/25 bg-blocked/10 text-blocked"
      : "border-ember/25 bg-ember/10 text-ember";

  return (
    <Card className="flex min-w-0 flex-col">
      <SectionLabel className="flex items-center">
        {label}
        <span className={cn("ml-auto rounded-full border px-2 py-0.5 tracking-normal", badgeCls)}>
          {query.trim() ? `${filtered.length} / ${items.length}` : items.length}
        </span>
      </SectionLabel>

      <div className="mb-3 space-y-2">
        <AddDomainForm onAdd={onAdd} placeholder={placeholder} />
        {items.length > 5 && (
          <SearchInput
            icon={ListFilter}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("blocklist.filter_placeholder")}
            inputClass="font-mono"
          />
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-muted py-2 text-xs">{t("blocklist.empty")}</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted py-2 text-xs">{t("blocklist.no_matches")}</p>
      ) : (
        <div className="max-h-96 space-y-0.5 overflow-y-auto">
          {filtered.map((domain) => (
            <div
              key={domain}
              className="hover:bg-white/3 rounded-xs group flex items-center justify-between gap-2 px-2 py-1.5"
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

  async function handleCheck(e: FormEvent) {
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
    <div className="p-6">
      {ConfirmDialog}
      <PageHeader title={t("blocklist.title")} subtitle={t("blocklist.subtitle")} />
      {err && <Err msg={err} />}

      {/* Domain inspector */}
      <Card className="plate-ticks mb-4">
        <SectionLabel>{t("blocklist.check_btn")}</SectionLabel>
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
            inputClass="h-9 font-mono"
          />
          <Btn
            variant="ghost"
            type="submit"
            disabled={checking || !checkDomain.trim()}
            className="h-9"
          >
            {t("blocklist.check_btn")}
          </Btn>
        </form>

        {checkResult && (
          <div className="animate-fade-up border-bdr/60 mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
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
        )}
      </Card>

      {/* Blacklist + Whitelist */}
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
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <ListPanel
            label={t("blocklist.blacklist")}
            tone="blocked"
            items={black}
            placeholder={t("blocklist.blacklist_placeholder")}
            onAdd={addBlack}
            onRemove={removeBlack}
            removing={removing}
          />
          <ListPanel
            label={t("blocklist.whitelist")}
            tone="ember"
            items={white}
            placeholder={t("blocklist.whitelist_placeholder")}
            onAdd={addWhite}
            onRemove={removeWhite}
            removing={removing}
          />
        </div>
      )}
    </div>
  );
}
