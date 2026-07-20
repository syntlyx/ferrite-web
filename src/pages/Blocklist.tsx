import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import type { SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Ban,
  CheckCircle2,
  Plus,
  Trash2,
  Search,
  ListFilter,
  ShieldBan,
  ShieldPlus,
  ShieldMinus,
  Save,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { deviceTokens } from "@/api/clients";
import type { BlocklistProfile, ClientEntry, DomainCheckResult } from "@/api/types";
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
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";

/** Slugify a display name into a stable profile id (mirrors the server). */
const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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

// ── Page ──────────────────────────────────────────────────────────────────────

// ── Per-device profiles ─────────────────────────────────────────────────────────

/** A profile's manual block or allow domain list, with an inline add box. Block
 *  entries override the global whitelist for these devices; allow entries
 *  override the global block and the profile's own lists. */
function ManualRuleBox({
  kind,
  domains,
  onAdd,
  onRemove,
}: {
  kind: "block" | "allow";
  domains: string[];
  onAdd: (domain: string) => void;
  onRemove: (domain: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const tone =
    kind === "block"
      ? "border-blocked/40 bg-blocked/10 text-blocked"
      : "border-cached/40 bg-cached/10 text-cached";
  const label =
    kind === "block"
      ? t("profiles.block_here", { defaultValue: "Block for these devices" })
      : t("profiles.allow_here", { defaultValue: "Allow for these devices" });

  const submit = () => {
    onAdd(value);
    setValue("");
  };

  return (
    <div>
      <span className="text-muted mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em]">
        {kind === "block" ? <Ban size={11} /> : <CheckCircle2 size={11} />} {label}
      </span>
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="example.com"
          className="min-w-0 flex-1 font-mono"
        />
        <IconBtn onClick={submit} disabled={!value.trim()} title={t("blocklist.add")}>
          <Plus size={13} />
        </IconBtn>
      </div>
      {domains.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {domains.map((d) => (
            <span
              key={d}
              className={cn(
                "rounded-xs group flex items-center gap-1 border px-2 py-1 font-mono text-[11px]",
                tone,
              )}
            >
              {d}
              <button
                type="button"
                onClick={() => onRemove(d)}
                className="opacity-50 transition-opacity hover:opacity-100"
                title={t("common.delete")}
              >
                <Trash2 size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Apply a subset of the subscription lists to specific devices. Devices that
 *  match no profile use all enabled lists (the default). Self-contained: loads
 *  its own data and edits a local draft that Save persists. */
function ProfilesPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [profiles, setProfiles] = useState<BlocklistProfile[]>([]);
  const [availableLists, setAvailableLists] = useState<string[]>([]);
  const [availableAllowlists, setAvailableAllowlists] = useState<string[]>([]);
  const [knownClients, setKnownClients] = useState<ClientEntry[]>([]);
  const [savedJson, setSavedJson] = useState("[]");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    return api
      .getProfiles()
      .then((d) => {
        setProfiles(d.profiles ?? []);
        setAvailableLists(d.available_lists ?? []);
        setAvailableAllowlists(d.available_allowlists ?? []);
        setSavedJson(JSON.stringify(d.profiles ?? []));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
    api
      .clients(200)
      .then((r) => setKnownClients(r.clients))
      .catch(() => {});
  }, [load]);

  const dirty = savedJson !== JSON.stringify(profiles);

  const addProfile = () =>
    setProfiles((p) => [
      ...p,
      {
        id: "",
        name: "",
        lists: [...availableLists],
        clients: [],
        block: [],
        allow: [],
        allowlists: [],
        default_deny: false,
      },
    ]);

  const removeProfile = async (i: number) => {
    if (profiles[i].name && !(await confirm(t("profiles.remove_confirm", { name: profiles[i].name }))))
      return;
    setProfiles((p) => p.filter((_, idx) => idx !== i));
  };

  const rename = (i: number, name: string) =>
    setProfiles((p) => p.map((pr, idx) => (idx === i ? { ...pr, name, id: slug(name) } : pr)));

  const toggleList = (i: number, list: string) =>
    setProfiles((p) =>
      p.map((pr, idx) =>
        idx === i
          ? {
              ...pr,
              lists: pr.lists.includes(list)
                ? pr.lists.filter((l) => l !== list)
                : [...pr.lists, list],
            }
          : pr,
      ),
    );

  const toggleAllowlist = (i: number, list: string) =>
    setProfiles((p) =>
      p.map((pr, idx) => {
        if (idx !== i) return pr;
        const cur = pr.allowlists ?? [];
        return {
          ...pr,
          allowlists: cur.includes(list) ? cur.filter((l) => l !== list) : [...cur, list],
        };
      }),
    );

  const toggleDefaultDeny = (i: number) =>
    setProfiles((p) =>
      p.map((pr, idx) => (idx === i ? { ...pr, default_deny: !pr.default_deny } : pr)),
    );

  const toggleDevice = (i: number, c: ClientEntry) => {
    const tokens = deviceTokens(c).map((x) => x.toLowerCase());
    setProfiles((p) =>
      p.map((pr, idx) => {
        if (idx !== i) return pr;
        const cur = (pr.clients ?? []).map((x) => x.toLowerCase());
        const on = tokens.some((tok) => cur.includes(tok));
        const next = on
          ? cur.filter((x) => !tokens.includes(x))
          : [...cur, ...tokens.filter((tok) => !cur.includes(tok))];
        return { ...pr, clients: next };
      }),
    );
  };

  // Add/remove a manual domain to a profile's block or allow set.
  const addManual = (i: number, kind: "block" | "allow", domain: string) => {
    const d = domain.trim().toLowerCase();
    if (!d) return;
    setProfiles((p) =>
      p.map((pr, idx) =>
        idx === i && !(pr[kind] ?? []).includes(d)
          ? { ...pr, [kind]: [...(pr[kind] ?? []), d] }
          : pr,
      ),
    );
  };
  const removeManual = (i: number, kind: "block" | "allow", domain: string) =>
    setProfiles((p) =>
      p.map((pr, idx) =>
        idx === i ? { ...pr, [kind]: (pr[kind] ?? []).filter((d) => d !== domain) } : pr,
      ),
    );

  async function save() {
    setSaving(true);
    try {
      await api.putProfiles(profiles.map((p) => ({ ...p, id: slug(p.name) })));
      toast(t("profiles.saved", { defaultValue: "Profiles saved" }));
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4">
      {ConfirmDialog}
      <div className="flex items-center justify-between">
        <SectionLabel>{t("profiles.title", { defaultValue: "Device profiles" })}</SectionLabel>
        <Btn variant="ghost" onClick={addProfile}>
          <Plus size={12} /> {t("profiles.add", { defaultValue: "Add profile" })}
        </Btn>
      </div>
      <p className="text-muted mb-3 text-xs leading-relaxed">
        {t("profiles.help", {
          defaultValue:
            "Apply a subset of the subscription lists to specific devices. Devices in no profile use all enabled lists. Manual block/allow entries and wildcards apply to everyone.",
        })}
      </p>

      {loading ? (
        <Skeleton className="h-20 w-full" />
      ) : availableLists.length === 0 ? (
        <p className="text-muted text-xs">
          {t("profiles.no_lists", {
            defaultValue: "Add subscription lists first — profiles are built from them.",
          })}
        </p>
      ) : profiles.length === 0 ? (
        <p className="text-muted text-xs">
          {t("profiles.empty", {
            defaultValue: "No profiles yet. Every device uses all enabled lists.",
          })}
        </p>
      ) : (
        <div className="space-y-3">
          {profiles.map((pr, i) => {
            const scoped = (pr.clients ?? []).map((x) => x.toLowerCase());
            return (
              <div key={i} className="border-bdr/70 rounded-xs space-y-3 border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={pr.name}
                    onChange={(e) => rename(i, e.target.value)}
                    placeholder={t("profiles.name_placeholder", { defaultValue: "Kids' devices" })}
                    className="w-full"
                  />
                  {pr.id && (
                    <span className="text-muted shrink-0 font-mono text-[10px] opacity-60">
                      {pr.id}
                    </span>
                  )}
                  <IconBtn danger onClick={() => void removeProfile(i)}>
                    <Trash2 size={13} />
                  </IconBtn>
                </div>

                {/* List subset */}
                <div>
                  <span className="text-muted mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em]">
                    <ListFilter size={11} /> {t("profiles.lists", { defaultValue: "Lists applied" })}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableLists.map((list) => {
                      const on = pr.lists.includes(list);
                      return (
                        <button
                          key={list}
                          type="button"
                          onClick={() => toggleList(i, list)}
                          className={cn(
                            "rounded-xs border px-2 py-1 font-mono text-[11px] transition-colors",
                            on
                              ? "border-blocked/40 bg-blocked/10 text-blocked"
                              : "border-bdr/70 text-muted hover:text-blocked hover:border-blocked/40",
                          )}
                        >
                          {list}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Allowlist subset — empty selection inherits every enabled allowlist */}
                {availableAllowlists.length > 0 && (
                  <div>
                    <span className="text-muted mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em]">
                      <CheckCircle2 size={11} />{" "}
                      {t("profiles.allowlists", { defaultValue: "Allowlists applied" })}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {availableAllowlists.map((list) => {
                        const on = (pr.allowlists ?? []).includes(list);
                        return (
                          <button
                            key={list}
                            type="button"
                            onClick={() => toggleAllowlist(i, list)}
                            className={cn(
                              "rounded-xs border px-2 py-1 font-mono text-[11px] transition-colors",
                              on
                                ? "border-cached/40 bg-cached/10 text-cached"
                                : "border-bdr/70 text-muted hover:text-cached hover:border-cached/40",
                            )}
                          >
                            {list}
                          </button>
                        );
                      })}
                    </div>
                    {(pr.allowlists ?? []).length === 0 && (
                      <p className="text-muted mt-1.5 text-[11px]">
                        {t("profiles.allowlists_inherit", {
                          defaultValue: "None selected — all enabled allowlists apply.",
                        })}
                      </p>
                    )}
                  </div>
                )}

                {/* Device scope */}
                <div>
                  <span className="text-muted mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em]">
                    <Users size={11} /> {t("profiles.devices", { defaultValue: "Devices" })}
                  </span>
                  {knownClients.length === 0 ? (
                    <p className="text-muted text-xs">
                      {t("profiles.no_devices", {
                        defaultValue: "No devices seen yet — they appear once they query.",
                      })}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {knownClients.map((c) => {
                        const tokens = deviceTokens(c).map((x) => x.toLowerCase());
                        const on = tokens.some((tok) => scoped.includes(tok));
                        return (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => toggleDevice(i, c)}
                            title={c.ips.join(", ")}
                            className={cn(
                              "rounded-xs border px-2 py-1 font-mono text-[11px] transition-colors",
                              on
                                ? "border-ember/40 bg-ember/10 text-ember"
                                : "border-bdr/70 text-muted hover:text-ember hover:border-ember/40",
                            )}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Per-profile manual rules: block/allow just for these devices,
                    overriding the global lists. */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ManualRuleBox
                    kind="block"
                    domains={pr.block ?? []}
                    onAdd={(d) => addManual(i, "block", d)}
                    onRemove={(d) => removeManual(i, "block", d)}
                  />
                  <ManualRuleBox
                    kind="allow"
                    domains={pr.allow ?? []}
                    onAdd={(d) => addManual(i, "allow", d)}
                    onRemove={(d) => removeManual(i, "allow", d)}
                  />
                </div>

                {/* Default-deny mode */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em]",
                        pr.default_deny ? "text-warn" : "text-muted",
                      )}
                    >
                      <ShieldBan size={11} />{" "}
                      {t("profiles.default_deny", {
                        defaultValue: "Block everything except allowed",
                      })}
                    </span>
                    <p className="text-muted mt-1 text-[11px] leading-relaxed">
                      {t("profiles.default_deny_hint", {
                        defaultValue:
                          "Only allowed domains resolve for these devices: manual allows plus the allowlists above. Local network names (PTR, .lan, .local, your zones) keep working.",
                      })}
                    </p>
                    {pr.default_deny &&
                      (pr.allow ?? []).length === 0 &&
                      availableAllowlists.length === 0 && (
                        <p className="text-warn mt-1 text-[11px]">
                          {t("profiles.default_deny_warn", {
                            defaultValue:
                              "Nothing is allowed yet — these devices will effectively lose DNS. Add allow entries or an allowlist first.",
                          })}
                        </p>
                      )}
                  </div>
                  <Switch
                    checked={!!pr.default_deny}
                    onCheckedChange={() => toggleDefaultDeny(i)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dirty && (
        <div className="mt-3 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => void load()} disabled={saving}>
            {t("common.reset", { defaultValue: "Reset" })}
          </Btn>
          <Btn onClick={() => void save()} disabled={saving}>
            <Save size={13} /> {t("profiles.save", { defaultValue: "Save profiles" })}
          </Btn>
        </div>
      )}
    </Card>
  );
}

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

      {!loading && <ProfilesPanel />}
    </PageContainer>
  );
}
