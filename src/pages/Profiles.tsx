import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ListFilter,
  Pencil,
  Plus,
  Save,
  SearchCheck,
  ShieldBan,
  Trash2,
  Users,
  LayoutGrid,
} from "lucide-react";
import { cn, normalizeEntry } from "@/lib/utils";
import { api } from "@/api";
import { deviceTokens } from "@/api/clients";
import { DevicePicker } from "@/components/DevicePicker";
import { ServiceIcon, ServicePicker } from "@/components/ServicePicker";
import { SafeSearchControls } from "@/components/SafeSearchControls";
import {
  ScheduleEditor,
  describeWindow,
  formatWeekMinute,
  scheduleActive,
  useWeekdayNames,
} from "@/components/ScheduleEditor";
import type {
  BlocklistProfile,
  ClientEntry,
  SafeSearchSettings,
  ServiceCatalog,
} from "@/api/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/layout/Card";
import { Err } from "@/components/feedback/Err";
import { Input, Btn, IconBtn, Skeleton, Switch } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { useRowKeys } from "@/hooks/use-row-keys";
import { Tag } from "@/components/feedback/Badge";

/** Slugify a display name into a stable profile id (mirrors the server). */
const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Older servers send profiles without `services`; give every profile the full shape. */
const withDefaults = (p: BlocklistProfile): BlocklistProfile => ({
  ...p,
  clients: p.clients ?? [],
  block: p.block ?? [],
  allow: p.allow ?? [],
  allowlists: p.allowlists ?? [],
  services: p.services ?? [],
  schedule: p.schedule ?? [],
  safe_search: p.safe_search ?? false,
  youtube_restricted: p.youtube_restricted ?? "off",
});

/** The box's minute of the week, kept ticking from the snapshot the server
 *  sent, so schedule status stays right while the page is open. */
function useBoxMinute(clock: { minute: number; at: number } | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  if (!clock) return null;
  return (clock.minute + Math.floor(Math.max(0, now - clock.at) / 60_000)) % (7 * 24 * 60);
}

/** Section heading inside a profile card. */
function Field({
  icon: Icon,
  label,
  aside,
  tone,
}: {
  icon: typeof Users;
  label: string;
  aside?: string;
  tone?: string;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className={cn("flex items-center gap-1.5 text-[13px]", tone ?? "text-muted")}>
        <Icon size={11} /> {label}
      </span>
      {aside && <span className="font-mono text-[10px] text-muted tabular-nums">{aside}</span>}
    </div>
  );
}

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
      <Field icon={kind === "block" ? Ban : CheckCircle2} label={label} />
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
                "group flex items-center gap-1 rounded-xs border px-2 py-1 font-mono text-[11px]",
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

/** Toggle chips for a set of subscription names. */
function ListChips({
  names,
  selected,
  onToggle,
  tone,
}: {
  names: string[];
  selected: string[];
  onToggle: (name: string) => void;
  tone: "blocked" | "cached";
}) {
  const on =
    tone === "blocked"
      ? "border-blocked/40 bg-blocked/10 text-blocked"
      : "border-cached/40 bg-cached/10 text-cached";
  const off =
    tone === "blocked"
      ? "border-bdr/70 text-muted hover:text-blocked hover:border-blocked/40"
      : "border-bdr/70 text-muted hover:text-cached hover:border-cached/40";
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onToggle(name)}
          aria-pressed={selected.includes(name)}
          className={cn(
            "rounded-xs border px-2 py-1 font-mono text-[11px] transition-colors",
            selected.includes(name) ? on : off,
          )}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/** Toggle `item` in `list`. */
const flip = (list: string[], item: string) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

/** One collapsed profile: who it applies to, when, and what it does — enough
 *  to tell profiles apart without opening the editor. */
function ProfileSummary({
  pr,
  knownClients,
  catalog,
  on,
  dayNames,
}: {
  pr: BlocklistProfile;
  knownClients: ClientEntry[];
  catalog: ServiceCatalog | null;
  /** Whether the schedule has it on now; null without a schedule. */
  on: boolean | null;
  dayNames: string[];
}) {
  const { t } = useTranslation();
  const scoped = pr.clients.map((x) => x.toLowerCase());
  const matched = knownClients.filter((c) =>
    deviceTokens(c).some((tok) => scoped.includes(tok.toLowerCase())),
  );
  const covered = new Set(matched.flatMap((c) => deviceTokens(c).map((x) => x.toLowerCase())));
  // Devices the profile names that haven't been seen lately still count.
  const unseen = scoped.filter((tok) => !covered.has(tok)).length;
  const names = matched.map((c) => c.name);
  const extra = Math.max(0, names.length - 3) + unseen;
  const services = (catalog?.services ?? []).filter((s) => pr.services.includes(s.id));
  const everyDay = t("profiles.schedule_every_day", { defaultValue: "every day" });

  const meta = "flex items-center gap-1.5";
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-heading transition-colors group-hover:text-ember">
          {pr.name || t("profiles.unnamed", { defaultValue: "Unnamed profile" })}
        </span>
        {on !== null && (
          <Tag tone={on ? "cached" : "muted"}>
            {on
              ? t("profiles.on_now", { defaultValue: "On now" })
              : t("profiles.off_now", { defaultValue: "Off now" })}
          </Tag>
        )}
        {pr.default_deny && (
          <Tag tone="warn">
            {t("profiles.default_deny_short", { defaultValue: "Allowed only" })}
          </Tag>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
        <span className={meta}>
          <Users size={11} className="shrink-0" />
          {names.length + unseen === 0 ? (
            <span className="text-warn">
              {t("profiles.summary_nobody", { defaultValue: "no devices" })}
            </span>
          ) : names.length === 0 ? (
            // Named by address only, none seen lately: a count says more than "+1".
            <span className="text-body">
              {t("profiles.devices_n", { count: unseen, defaultValue: "devices: {{count}}" })}
            </span>
          ) : (
            <span className="text-body">
              {names.slice(0, 3).join(", ")}
              {extra > 0 && ` +${extra}`}
            </span>
          )}
        </span>
        <span className={meta}>
          <CalendarClock size={11} className="shrink-0" />
          {pr.schedule.length === 0
            ? t("profiles.schedule_always_short", { defaultValue: "always" })
            : pr.schedule.map((w) => describeWindow(w, dayNames, everyDay)).join("; ")}
        </span>
        {services.length > 0 && (
          <span className={meta} title={services.map((s) => s.name).join(", ")}>
            <LayoutGrid size={11} className="shrink-0" />
            <span className="flex items-center gap-1 text-blocked">
              {services.slice(0, 6).map((s) => (
                <ServiceIcon key={s.id} service={s} size={11} />
              ))}
            </span>
            {services.length > 6 && `+${services.length - 6}`}
          </span>
        )}
        {pr.lists.length > 0 && (
          <span className={meta}>
            <ListFilter size={11} className="shrink-0" />
            {t("profiles.lists_n", { count: pr.lists.length, defaultValue: "lists: {{count}}" })}
          </span>
        )}
        {(pr.block.length > 0 || pr.allow.length > 0) && (
          <span className={meta}>
            <Ban size={11} className="shrink-0" />
            {t("profiles.own_rules_n", {
              count: pr.block.length + pr.allow.length,
              defaultValue: "own rules: {{count}}",
            })}
          </span>
        )}
        {(pr.safe_search || pr.youtube_restricted !== "off") && (
          <span className={meta}>
            <SearchCheck size={11} className="shrink-0" />
            {[
              pr.safe_search && "SafeSearch",
              pr.youtube_restricted !== "off" &&
                `YouTube ${t(`safesearch.level_${pr.youtube_restricted}`).toLowerCase()}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Per-device profiles: which services to block, which subscription lists to
 * apply, and what to block or allow on top, for chosen devices. Devices in no
 * profile follow the network-wide rules. The page edits a draft of the whole
 * set; Save replaces it on the server in one PUT.
 */
export default function Profiles() {
  const { t } = useTranslation();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [profiles, setProfiles] = useState<BlocklistProfile[]>([]);
  const [availableLists, setAvailableLists] = useState<string[]>([]);
  const [availableAllowlists, setAvailableAllowlists] = useState<string[]>([]);
  const [knownClients, setKnownClients] = useState<ClientEntry[]>([]);
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [networkSafe, setNetworkSafe] = useState<SafeSearchSettings | undefined>(undefined);
  const [clock, setClock] = useState<{ minute: number; at: number; offset: string } | null>(null);
  const boxMinute = useBoxMinute(clock);
  const dayNames = useWeekdayNames();
  const [savedJson, setSavedJson] = useState("[]");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const keys = useRowKeys(profiles.length);
  // One profile's editor open at a time; the rest stay as one-line summaries.
  const [openKey, setOpenKey] = useState<number | null>(null);

  const load = useCallback(() => {
    return api
      .getProfiles()
      .then((d) => {
        const list = (d.profiles ?? []).map(withDefaults);
        setProfiles(list);
        setAvailableLists(d.available_lists ?? []);
        setAvailableAllowlists(d.available_allowlists ?? []);
        setSavedJson(JSON.stringify(list));
        keys.reset(list.length);
        setOpenKey(null);
        if (d.clock)
          setClock({ minute: d.clock.minute_of_week, at: Date.now(), offset: d.clock.utc_offset });
        setErr("");
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [keys]);

  useEffect(() => {
    void load();
    api
      .clients(200)
      .then((r) => setKnownClients(r.clients))
      .catch(() => {});
    api
      .serviceCatalog()
      .then(setCatalog)
      .catch(() => {});
    api
      .getSafeSearch()
      .then(setNetworkSafe)
      .catch(() => {});
  }, [load]);

  const dirty = savedJson !== JSON.stringify(profiles);

  const update = (i: number, fn: (p: BlocklistProfile) => BlocklistProfile) =>
    setProfiles((ps) => ps.map((p, idx) => (idx === i ? fn(p) : p)));

  const addProfile = () => {
    keys.add();
    setOpenKey(keys.keyAt(profiles.length));
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
        services: [],
        default_deny: false,
        schedule: [],
        safe_search: false,
        youtube_restricted: "off",
      },
    ]);
  };

  const moveProfile = (i: number, to: number) => {
    keys.move(i, to);
    setProfiles((ps) => {
      const next = [...ps];
      const [p] = next.splice(i, 1);
      next.splice(to, 0, p);
      return next;
    });
  };

  const removeProfile = async (i: number) => {
    if (
      profiles[i].name &&
      !(await confirm(t("profiles.remove_confirm", { name: profiles[i].name })))
    )
      return;
    keys.remove(i);
    setProfiles((p) => p.filter((_, idx) => idx !== i));
  };

  const toggleDevice = (i: number, c: ClientEntry) => {
    const tokens = deviceTokens(c).map((x) => x.toLowerCase());
    update(i, (pr) => {
      const cur = pr.clients.map((x) => x.toLowerCase());
      const on = tokens.some((tok) => cur.includes(tok));
      const next = on
        ? cur.filter((x) => !tokens.includes(x))
        : [...cur, ...tokens.filter((tok) => !cur.includes(tok))];
      return { ...pr, clients: next };
    });
  };

  const addManual = (i: number, kind: "block" | "allow", domain: string) => {
    const d = normalizeEntry(domain);
    if (!d) return;
    update(i, (pr) => (pr[kind].includes(d) ? pr : { ...pr, [kind]: [...pr[kind], d] }));
  };
  const removeManual = (i: number, kind: "block" | "allow", domain: string) =>
    update(i, (pr) => ({ ...pr, [kind]: pr[kind].filter((d) => d !== domain) }));

  function reset() {
    const restored = (JSON.parse(savedJson) as BlocklistProfile[]).map(withDefaults);
    setProfiles(restored);
    keys.reset(restored.length);
    setOpenKey(null);
  }

  async function save() {
    if (profiles.some((p) => !slug(p.name))) {
      toast(t("profiles.name_required", { defaultValue: "Give every profile a name." }), "error");
      return;
    }
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
    <PageContainer>
      {ConfirmDialog}
      <PageHeader
        title={t("profiles.page_title", { defaultValue: "Profiles" })}
        subtitle={t("profiles.page_subtitle", {
          defaultValue:
            "Rules for chosen devices: services to block, lists to apply, what to allow. Devices in no profile follow the network-wide rules.",
        })}
        action={
          <Btn variant="ghost" onClick={addProfile} disabled={loading}>
            <Plus size={12} /> {t("profiles.add", { defaultValue: "Add profile" })}
          </Btn>
        }
      />
      {err && <Err msg={err} />}

      {loading ? (
        <Card>
          <div className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </Card>
      ) : profiles.length === 0 ? (
        <Card>
          <p className="text-sm text-heading">
            {t("profiles.empty_title", { defaultValue: "No profiles yet" })}
          </p>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted">
            {t("profiles.empty_help", {
              defaultValue:
                "Every device follows the network-wide rules. Add a profile to give some devices their own: block TikTok and games on a child's tablet, or allow only a short list on a smart TV.",
            })}
          </p>
          <Btn className="mt-4" onClick={addProfile}>
            <Plus size={12} /> {t("profiles.add", { defaultValue: "Add profile" })}
          </Btn>
        </Card>
      ) : (
        <div className="space-y-4">
          {profiles.map((pr, i) => {
            const scoped = pr.clients.map((x) => x.toLowerCase());
            const deviceCount = knownClients.filter((c) =>
              deviceTokens(c).some((tok) => scoped.includes(tok.toLowerCase())),
            ).length;
            const rowKey = keys.keyAt(i);
            const isOpen = openKey === rowKey;
            const onNow =
              pr.schedule.length > 0 && boxMinute !== null
                ? scheduleActive(pr.schedule, boxMinute)
                : null;
            const order = profiles.length > 1 && (
              <>
                <IconBtn
                  onClick={() => moveProfile(i, i - 1)}
                  disabled={i === 0}
                  title={t("profiles.move_up", { defaultValue: "Move up" })}
                >
                  <ChevronUp size={13} />
                </IconBtn>
                <IconBtn
                  onClick={() => moveProfile(i, i + 1)}
                  disabled={i === profiles.length - 1}
                  title={t("profiles.move_down", { defaultValue: "Move down" })}
                >
                  <ChevronDown size={13} />
                </IconBtn>
              </>
            );
            const remove = (
              <IconBtn
                danger
                onClick={() => void removeProfile(i)}
                title={t("profiles.remove", { defaultValue: "Remove profile" })}
              >
                <Trash2 size={13} />
              </IconBtn>
            );
            if (!isOpen) {
              return (
                <Card key={rowKey} className="py-4">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenKey(rowKey)}
                      className="group min-w-0 flex-1 text-left"
                    >
                      <ProfileSummary
                        pr={pr}
                        knownClients={knownClients}
                        catalog={catalog}
                        on={onNow}
                        dayNames={dayNames}
                      />
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Btn variant="ghost" size="sm" onClick={() => setOpenKey(rowKey)}>
                        <Pencil size={11} /> {t("profiles.edit", { defaultValue: "Edit" })}
                      </Btn>
                      {order}
                      {remove}
                    </div>
                  </div>
                </Card>
              );
            }
            return (
              <Card key={rowKey} className="space-y-5 border-ember/30">
                {/* Name */}
                <div className="flex items-center gap-2">
                  <Input
                    value={pr.name}
                    onChange={(e) =>
                      update(i, (p) => ({ ...p, name: e.target.value, id: slug(e.target.value) }))
                    }
                    placeholder={t("profiles.name_placeholder", { defaultValue: "Kids' devices" })}
                    className="w-full text-sm font-medium"
                    autoFocus={!pr.name && !pr.id}
                  />
                  {pr.id && (
                    <span className="hidden shrink-0 font-mono text-[10px] text-muted opacity-60 sm:inline">
                      {pr.id}
                    </span>
                  )}
                  {onNow !== null && (
                    <span
                      className={cn(
                        "shrink-0 rounded-xs border px-2 py-0.5 font-mono text-[10px]",
                        onNow
                          ? "border-cached/40 bg-cached/10 text-cached"
                          : "border-bdr/70 text-muted",
                      )}
                    >
                      {onNow
                        ? t("profiles.on_now", { defaultValue: "On now" })
                        : t("profiles.off_now", { defaultValue: "Off now" })}
                    </span>
                  )}
                  <Btn variant="ghost" size="sm" onClick={() => setOpenKey(null)}>
                    <ChevronUp size={11} /> {t("profiles.collapse", { defaultValue: "Done" })}
                  </Btn>
                  {order}
                  {remove}
                </div>

                {/* Devices */}
                <div>
                  <Field
                    icon={Users}
                    label={t("profiles.devices", { defaultValue: "Devices" })}
                    aside={
                      deviceCount > 0
                        ? t("profiles.n_devices", {
                            count: deviceCount,
                            defaultValue: "{{count}} selected",
                          })
                        : undefined
                    }
                  />
                  {knownClients.length === 0 ? (
                    <p className="text-xs text-muted">
                      {t("profiles.no_devices", {
                        defaultValue: "No devices seen yet — they appear once they query.",
                      })}
                    </p>
                  ) : (
                    <DevicePicker
                      clients={knownClients}
                      scoped={scoped}
                      onToggle={(c) => toggleDevice(i, c)}
                    />
                  )}
                  {pr.clients.length === 0 && knownClients.length > 0 && (
                    <p className="mt-1.5 text-[11px] text-warn">
                      {t("profiles.no_devices_selected", {
                        defaultValue: "No devices selected — this profile applies to nobody yet.",
                      })}
                    </p>
                  )}
                </div>

                {/* Schedule */}
                <div>
                  <Field
                    icon={CalendarClock}
                    label={t("profiles.schedule", { defaultValue: "Schedule" })}
                    aside={
                      boxMinute !== null && clock
                        ? t("profiles.box_time", {
                            time: formatWeekMinute(boxMinute, dayNames),
                            offset: clock.offset,
                            defaultValue: "Box time {{time}} (UTC{{offset}})",
                          })
                        : undefined
                    }
                  />
                  {pr.schedule.length === 0 && (
                    <p className="mb-2 text-[11px] text-muted">
                      {t("profiles.schedule_always", {
                        defaultValue:
                          "Always on. Add a time window to apply this profile only at certain hours.",
                      })}
                    </p>
                  )}
                  <ScheduleEditor
                    windows={pr.schedule}
                    onChange={(next) => update(i, (p) => ({ ...p, schedule: next }))}
                  />
                  {pr.schedule.length > 0 && (
                    <p className="mt-2 text-[11px] leading-relaxed text-muted/80">
                      {t("profiles.schedule_hint", {
                        defaultValue:
                          "Outside these hours its devices follow the next profile they are in, or the network-wide rules. When several profiles include a device, the first one that is on wins — the arrows set the order.",
                      })}
                    </p>
                  )}
                </div>

                {/* Services */}
                <div>
                  <Field
                    icon={LayoutGrid}
                    label={t("profiles.services", { defaultValue: "Blocked services" })}
                    aside={
                      pr.services.length > 0
                        ? t("services.blocked_count", {
                            count: pr.services.length,
                            defaultValue: "{{count}} blocked",
                          })
                        : undefined
                    }
                  />
                  {catalog ? (
                    <ServicePicker
                      catalog={catalog}
                      selected={pr.services}
                      onToggle={(s) =>
                        update(i, (p) => ({ ...p, services: flip(p.services, s.id) }))
                      }
                    />
                  ) : (
                    <Skeleton className="h-16 w-full" />
                  )}
                </div>

                {/* Safe search */}
                <div>
                  <Field
                    icon={SearchCheck}
                    label={t("safesearch.title", { defaultValue: "Safe search" })}
                  />
                  <SafeSearchControls
                    value={{
                      safe_search: pr.safe_search,
                      youtube_restricted: pr.youtube_restricted,
                    }}
                    floor={networkSafe}
                    onChange={(v) => update(i, (p) => ({ ...p, ...v }))}
                  />
                </div>

                {/* Own block/allow entries */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ManualRuleBox
                    kind="block"
                    domains={pr.block}
                    onAdd={(d) => addManual(i, "block", d)}
                    onRemove={(d) => removeManual(i, "block", d)}
                  />
                  <ManualRuleBox
                    kind="allow"
                    domains={pr.allow}
                    onAdd={(d) => addManual(i, "allow", d)}
                    onRemove={(d) => removeManual(i, "allow", d)}
                  />
                </div>

                {/* Subscription subsets */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Field
                      icon={ListFilter}
                      label={t("profiles.lists", { defaultValue: "Lists applied" })}
                    />
                    {availableLists.length === 0 ? (
                      <p className="text-[11px] text-muted">
                        {t("profiles.no_lists_short", {
                          defaultValue: "No blocklists subscribed yet.",
                        })}
                      </p>
                    ) : (
                      <ListChips
                        names={availableLists}
                        selected={pr.lists}
                        onToggle={(l) => update(i, (p) => ({ ...p, lists: flip(p.lists, l) }))}
                        tone="blocked"
                      />
                    )}
                  </div>
                  {availableAllowlists.length > 0 && (
                    <div>
                      <Field
                        icon={CheckCircle2}
                        label={t("profiles.allowlists", { defaultValue: "Allowlists applied" })}
                      />
                      <ListChips
                        names={availableAllowlists}
                        selected={pr.allowlists}
                        onToggle={(l) =>
                          update(i, (p) => ({ ...p, allowlists: flip(p.allowlists, l) }))
                        }
                        tone="cached"
                      />
                      {pr.allowlists.length === 0 && (
                        <p className="mt-1.5 text-[11px] text-muted">
                          {t("profiles.allowlists_inherit", {
                            defaultValue: "None selected — all enabled allowlists apply.",
                          })}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Default-deny mode */}
                <div className="flex items-start justify-between gap-3 border-t border-bdr/50 pt-4">
                  <div className="min-w-0">
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-[13px]",
                        pr.default_deny ? "text-warn" : "text-muted",
                      )}
                    >
                      <ShieldBan size={11} />{" "}
                      {t("profiles.default_deny", {
                        defaultValue: "Block everything except allowed",
                      })}
                    </span>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">
                      {t("profiles.default_deny_hint", {
                        defaultValue:
                          "Only allowed domains resolve for these devices: manual allows plus the allowlists above. Local network names (PTR, .lan, .local, your zones) keep working.",
                      })}
                    </p>
                    {pr.default_deny &&
                      pr.allow.length === 0 &&
                      availableAllowlists.length === 0 && (
                        <p className="mt-1 text-[11px] text-warn">
                          {t("profiles.default_deny_warn", {
                            defaultValue:
                              "Nothing is allowed yet — these devices will effectively lose DNS. Add allow entries or an allowlist first.",
                          })}
                        </p>
                      )}
                  </div>
                  <Switch
                    checked={!!pr.default_deny}
                    onCheckedChange={() =>
                      update(i, (p) => ({ ...p, default_deny: !p.default_deny }))
                    }
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {dirty && (
        <div className="control-surface sticky bottom-4 z-10 mt-4 flex animate-fade-up flex-col gap-3 rounded-xs border border-bdr/85 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 text-xs">
            <span className="h-1.5 w-1.5 animate-pulse bg-warn" />
            <span className="font-medium text-heading">
              {t("tunnels.unsaved_changes", { defaultValue: "Unsaved changes" })}
            </span>
          </div>
          <div className="flex gap-2">
            <Btn type="button" variant="ghost" onClick={reset} disabled={saving}>
              {t("common.reset", { defaultValue: "Reset" })}
            </Btn>
            <Btn type="button" onClick={() => void save()} disabled={saving}>
              <Save size={13} /> {t("profiles.save", { defaultValue: "Save profiles" })}
            </Btn>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
