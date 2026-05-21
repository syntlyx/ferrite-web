import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Ban, CheckCircle2, Plus, Trash2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/layout/Card";
import { Err } from "@/components/feedback/Err";
import { Input, SearchInput, Btn, IconBtn, SectionLabel, Skeleton } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";

// ── Domain list ───────────────────────────────────────────────────────────────

function DomainList({
  items,
  onRemove,
  removing,
}: {
  items: string[];
  onRemove: (domain: string) => void;
  removing: string;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return <p className="text-muted py-2 text-xs">{t("blocklist.empty")}</p>;
  return (
    <div className="max-h-80 space-y-0.5 overflow-y-auto">
      {items.map((domain) => (
        <div
          key={domain}
          className="hover:bg-white/3 group flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
        >
          <span className="text-body min-w-0 truncate font-mono text-xs">{domain}</span>
          <IconBtn
            danger
            onClick={() => onRemove(domain)}
            disabled={removing === domain}
            className="opacity-0 group-hover:opacity-100"
          >
            <Trash2 size={12} />
          </IconBtn>
        </div>
      ))}
    </div>
  );
}

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
    <form onSubmit={handle} className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
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
  const [checkResult, setCheckResult] = useState<Awaited<
    ReturnType<typeof api.checkDomain>
  > | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    Promise.all([api.getBlacklist(), api.getWhitelist()])
      .then(([b, w]) => {
        setBlack(b.blacklist ?? []);
        setWhite(w.whitelist ?? []);
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleCheck(e: FormEvent) {
    e.preventDefault();
    const d = checkDomain.trim();
    if (!d) return;
    setChecking(true);
    try {
      setCheckResult(await api.checkDomain(d));
    } catch {
      setCheckResult(null);
    } finally {
      setChecking(false);
    }
  }

  async function addBlack(domain: string) {
    await api.addBlacklist(domain);
    setBlack((p) => [...p, domain].sort());
    toast(`"${domain}" added to blacklist`);
  }
  async function addWhite(domain: string) {
    await api.addWhitelist(domain);
    setWhite((p) => [...p, domain].sort());
    toast(`"${domain}" added to whitelist`);
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

  return (
    <div className="p-6">
      {ConfirmDialog}
      <PageHeader title={t("blocklist.title")} subtitle={t("blocklist.subtitle")} />
      {err && <Err msg={err} />}

      {/* Check domain — full-width filter bar at top */}
      <Card className="mb-4 p-3">
        <form
          onSubmit={handleCheck}
          className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
        >
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
          {checkResult && (
            <div
              className={cn(
                "flex h-9 items-center gap-2 rounded-md border px-3 text-xs",
                checkResult.blocked
                  ? "border-blocked/25 bg-blocked/10 text-blocked"
                  : "border-teal/25 bg-teal/10 text-teal",
              )}
            >
              {checkResult.blocked ? <Ban size={13} /> : <CheckCircle2 size={13} />}
              <span className="font-medium">
                {checkResult.blocked
                  ? t("blocklist.status_blocked")
                  : t("blocklist.status_allowed")}
              </span>
              {checkResult.whitelisted && (
                <span className="text-upstream border-upstream/25 border-l pl-2">
                  {t("blocklist.whitelisted")}
                </span>
              )}
            </div>
          )}
        </form>
      </Card>

      {/* Blacklist + Whitelist — full width, side by side */}
      <Card>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-5/6" />
          </div>
        ) : (
          <div className="md:divide-bdr/70 grid grid-cols-1 gap-6 md:grid-cols-2 md:divide-x">
            <section className="min-w-0 md:pr-6">
              <SectionLabel className="flex items-center">
                {t("blocklist.blacklist")}
                <span className="border-blocked/25 bg-blocked/10 text-blocked ml-auto rounded-full border px-2 py-0.5 normal-case tracking-normal">
                  {black.length}
                </span>
              </SectionLabel>
              <AddDomainForm onAdd={addBlack} placeholder={t("blocklist.blacklist_placeholder")} />
              <DomainList items={black} onRemove={removeBlack} removing={removing} />
            </section>
            <section className="min-w-0 md:pl-6">
              <SectionLabel className="flex items-center">
                {t("blocklist.whitelist")}
                <span className="border-teal/25 bg-teal/10 text-teal ml-auto rounded-full border px-2 py-0.5 normal-case tracking-normal">
                  {white.length}
                </span>
              </SectionLabel>
              <AddDomainForm onAdd={addWhite} placeholder={t("blocklist.whitelist_placeholder")} />
              <DomainList items={white} onRemove={removeWhite} removing={removing} />
            </section>
          </div>
        )}
      </Card>
    </div>
  );
}
