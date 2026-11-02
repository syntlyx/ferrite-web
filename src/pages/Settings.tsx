import { useEffect, useState, useCallback } from "react";
import type { ChangeEvent, SubmitEvent, InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { useRowKeys } from "@/hooks/use-row-keys";
import {
  Save,
  RefreshCw,
  Download,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  X,
  Shuffle,
  Minus,
  MoveRight,
  Plus,
  Clock3,
  Database,
  KeyRound,
  ListFilter,
  PanelTop,
  RadioTower,
  Route,
  ServerCog,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/layout/Card";
import {
  SettingsPanel,
  SettingRow,
  SettingBlock,
  StatusBadge,
  StatusTile,
  FieldLabel,
} from "@/components/layout/SettingsPanel";
import { Spinner } from "@/components/feedback/Spinner";
import { Err } from "@/components/feedback/Err";
import {
  Input,
  Select,
  Btn,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { BackupCard } from "@/components/BackupCard";
import { NotificationsCard } from "@/components/NotificationsCard";
import { McpCard } from "@/components/McpCard";
import { SessionsCard } from "@/components/SessionsCard";
import type {
  PatchSettingsBody,
  Settings as SettingsType,
  StorageBackend,
  StorageLocations,
  StorageSuggestion,
  UpdateApplyResponse,
  UpdateCheckResponse,
} from "@/api/types";
import {
  DEFAULT_UPSTREAM_DRAFT,
  UPSTREAM_PRESETS,
  buildHotPatch,
  buildRestartPatch,
  defaultPort,
  hotFormFromSettings,
  restartFormFromSettings,
} from "@/lib/settings-form";
import type { HotForm, RestartForm, UpstreamDraft, ZoneDraft } from "@/lib/settings-form";

type ClearableSecretField = "api_key" | "password";

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function formatConfigValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (isPlainObject(value)) return JSON.stringify(value);
  return String(value);
}

// ── Layout primitives ─────────────────────────────────────────────────────────

function UnitInput({
  unit,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { unit?: string }) {
  const min = props.min != null && props.min !== "" ? Number(props.min) : undefined;
  const max = props.max != null && props.max !== "" ? Number(props.max) : undefined;
  const rawStep = props.step != null && props.step !== "any" ? Number(props.step) : 1;
  const step = Number.isFinite(rawStep) && rawStep > 0 ? rawStep : 1;

  function changeBy(direction: -1 | 1) {
    const rawValue = props.value != null && props.value !== "" ? Number(props.value) : (min ?? 0);
    const current = Number.isFinite(rawValue) ? rawValue : (min ?? 0);
    const next = Math.min(Math.max(current + step * direction, min ?? -Infinity), max ?? Infinity);
    props.onChange?.({ target: { value: String(next) } } as ChangeEvent<HTMLInputElement>);
  }

  return (
    <div className="group relative w-full">
      <Input
        className={cn(
          "w-full [appearance:textfield] font-mono tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          unit ? "pr-28" : "pr-16",
          className,
        )}
        {...props}
      />
      {unit && (
        <span className="pointer-events-none absolute top-1/2 right-16 -translate-y-1/2 text-[10px] text-muted/60">
          {unit}
        </span>
      )}
      <div className="absolute top-1/2 right-1.5 grid h-6 -translate-y-1/2 grid-cols-2 overflow-hidden rounded border border-bdr/70 bg-panel/80 opacity-40 shadow-[0_6px_16px_rgba(0,0,0,0.18)] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => changeBy(-1)}
          disabled={props.disabled}
          className="flex w-6 items-center justify-center border-r border-bdr/60 text-muted transition-colors hover:bg-white/7 hover:text-heading disabled:opacity-30"
          aria-label="Decrease"
        >
          <Minus size={10} />
        </button>
        <button
          type="button"
          onClick={() => changeBy(1)}
          disabled={props.disabled}
          className="flex w-6 items-center justify-center text-muted transition-colors hover:bg-white/7 hover:text-heading disabled:opacity-30"
          aria-label="Increase"
        >
          <Plus size={10} />
        </button>
      </div>
    </div>
  );
}

function SecretInput({
  shown,
  onToggle,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative w-full">
      <Input
        type={shown ? "text" : "password"}
        className={cn("w-full pr-9", className)}
        {...props}
      />
      <button
        type="button"
        className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted transition-colors hover:text-heading"
        onClick={onToggle}
        aria-label={shown ? "Hide" : "Show"}
      >
        {shown ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
    </div>
  );
}

/** The database file's name, for the retention tile's subtitle. The full path
 *  is rarely short enough to read there, and the name alone still tells you
 *  which file the retention setting is pruning. */
function dbFileName(path?: string): string {
  const name = path?.split("/").pop();
  return name && name.length > 0 ? name : "sqlite";
}

function SettingsOverview({
  settings,
  apiKeySet,
  passwordSet,
}: {
  settings: SettingsType;
  apiKeySet: boolean;
  passwordSet: boolean;
}) {
  const { t } = useTranslation();
  const minTtl = settings.dns?.min_ttl;
  const maxTtl = settings.dns?.max_ttl;
  const retention = settings.storage?.log_retention_days;
  const blockingEnabled = settings.blocklist?.enabled ?? true;
  const bypassCount = settings.blocklist?.client_bypass?.length ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatusTile
        icon={Clock3}
        label={t("settings.ttl_window")}
        value={minTtl != null && maxTtl != null ? `${minTtl}-${maxTtl}s` : t("common.no_data")}
        sub={t("settings.live_changes")}
      />
      <StatusTile
        icon={ShieldCheck}
        label={t("settings.auth")}
        value={passwordSet ? t("common.enabled") : t("common.disabled")}
        sub={apiKeySet ? t("settings.api_key_set_short") : t("settings.api_key_not_set")}
        tone={passwordSet ? "ember" : "warn"}
      />
      <StatusTile
        icon={Database}
        label={t("settings.retention")}
        value={
          retention == null
            ? t("common.no_data")
            : retention === 0
              ? t("settings.forever")
              : `${retention}d`
        }
        sub={dbFileName(settings.storage?.path)}
        tone="upstream"
      />
      <StatusTile
        icon={ListFilter}
        label={t("settings.blocking")}
        value={blockingEnabled ? t("common.enabled") : t("common.disabled")}
        sub={t("settings.client_bypass_count", { count: bypassCount })}
        tone={blockingEnabled ? "ember" : "warn"}
      />
    </div>
  );
}

/** Is this path on a RAM-backed mount? Used to warn that a reboot clears it.
 *  Matched by directory prefix, so a hand-typed path under a detected mount is
 *  recognised too, not only the exact suggestion. */
function isRamPath(path: string, locations?: StorageLocations | null): boolean {
  if (!path || !locations) return false;
  const p = path.replace(/\/+$/, "");
  return locations.suggestions.some(
    (s) => s.ram_backed && (p === s.dir || p.startsWith(`${s.dir}/`)),
  );
}

/** One chip per place this box offers, for a path field. `pick` maps a
 *  suggestion to the value the field takes — the database file, or its
 *  directory. */
function LocationChips({
  locations,
  value,
  pick,
  onPick,
}: {
  locations: StorageLocations | null;
  value: string;
  pick: (s: StorageSuggestion) => string;
  onPick: (v: string) => void;
}) {
  const { t } = useTranslation();
  if (!locations || locations.suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {locations.suggestions.map((sug) => {
        const v = pick(sug);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            title={v}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
              value === v
                ? "border-ember/40 bg-ember/10 text-ember"
                : "border-border text-muted-foreground hover:border-ember/30",
            )}
          >
            {sug.ram_backed ? "RAM" : t("settings.storage_disk")} · {sug.dir}
            {sug.available_bytes != null &&
              ` · ${formatBytes(sug.available_bytes)} ${t("settings.storage_free")}`}
          </button>
        );
      })}
    </div>
  );
}

function RestartBadge() {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-1 rounded-full bg-warn/10 px-2 py-0.5 text-[10px] font-medium text-warn">
      <AlertTriangle size={9} /> {t("settings.requires_restart")}
    </span>
  );
}

// ── Upstream resolvers ────────────────────────────────────────────────────────

const UPSTREAM_TYPES = ["plain", "tls", "https", "quic"] as const;

function TypeSegments({ value, onChange }: { value: string; onChange: (type: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex w-fit overflow-hidden rounded-xs border border-bdr/80">
      {UPSTREAM_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={cn(
            "border-bdr/60 px-2.5 py-1.5 font-mono text-[10px] font-medium tracking-[0.08em] uppercase transition-colors not-last:border-r",
            type === value
              ? "bg-ember-dim text-ember"
              : "text-muted hover:bg-white/4 hover:text-heading",
          )}
        >
          {t(`settings.upstream_${type === "plain" ? "plain" : type}`)}
        </button>
      ))}
    </div>
  );
}

function UpstreamEditor({
  value,
  onChange,
}: {
  value: UpstreamDraft[];
  onChange: (next: UpstreamDraft[]) => void;
}) {
  const { t } = useTranslation();
  // Egresses (tunnels) available to route a resolver through. Best-effort: an
  // empty list just means the "Through tunnel" dropdown offers only "Direct".
  const [egresses, setEgresses] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api
      .getProxy()
      .then((d) => setEgresses(d.proxy.egresses.map((e) => ({ id: e.id, name: e.name }))))
      .catch(() => {});
  }, []);

  function update(index: number, patch: Partial<UpstreamDraft>) {
    onChange(
      value.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, ...patch };
        if (patch.type && patch.type !== item.type) {
          next.port = defaultPort(patch.type);
          if (patch.type === "https" && !next.url) next.url = "https://dns.example/dns-query";
        }
        return next;
      }),
    );
  }

  function remove(index: number) {
    if (value.length <= 1) return;
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="w-full space-y-2">
      {value.map((item, index) => (
        <div
          key={`${index}-${item.type}`}
          className="control-surface-muted rounded-xs border border-bdr/70 p-3"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] font-semibold text-ember tabular-nums">
                #{index + 1}
              </span>
              <TypeSegments value={item.type} onChange={(type) => update(index, { type })} />
            </div>
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={value.length <= 1}
              className="text-muted transition-colors hover:text-blocked disabled:opacity-30"
              title={t("common.delete")}
            >
              <Trash2 size={13} />
            </button>
          </div>

          {item.type === "https" ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <label className="min-w-0 space-y-1">
                <FieldLabel>{t("settings.upstream_url")}</FieldLabel>
                <Input
                  value={item.url}
                  onChange={(e) => update(index, { url: e.target.value })}
                  placeholder="https://cloudflare-dns.com/dns-query"
                  className="w-full font-mono"
                />
              </label>
              <label className="min-w-0 space-y-1">
                <FieldLabel>{t("settings.upstream_bootstrap")}</FieldLabel>
                <Input
                  value={item.bootstrap_ip}
                  onChange={(e) => update(index, { bootstrap_ip: e.target.value })}
                  placeholder="1.1.1.1"
                  className="w-full font-mono"
                />
              </label>
            </div>
          ) : (
            <div
              className={cn(
                "grid grid-cols-1 gap-2",
                item.type === "plain"
                  ? "sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
                  : "sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,4fr)]",
              )}
            >
              <label className="min-w-0 space-y-1">
                <FieldLabel>{t("settings.upstream_address")}</FieldLabel>
                <Input
                  value={item.address}
                  onChange={(e) => update(index, { address: e.target.value })}
                  placeholder="1.1.1.1"
                  className="w-full font-mono"
                />
              </label>
              <label className="min-w-0 space-y-1">
                <FieldLabel>{t("settings.upstream_port")}</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  value={item.port}
                  onChange={(e) => update(index, { port: e.target.value })}
                  placeholder={defaultPort(item.type)}
                  className="w-full font-mono tabular-nums"
                />
              </label>
              {item.type !== "plain" && (
                <label className="min-w-0 space-y-1">
                  <FieldLabel>{t("settings.upstream_tls_name")}</FieldLabel>
                  <Input
                    value={item.tls_name}
                    onChange={(e) => update(index, { tls_name: e.target.value })}
                    placeholder="cloudflare-dns.com"
                    className="w-full font-mono"
                  />
                </label>
              )}
            </div>
          )}

          {/* Through-tunnel routing: plain & DoT only (both ride a byte stream),
              and only when a tunnel exists (or this upstream already names one). */}
          {(item.type === "plain" || item.type === "tls") &&
            (egresses.length > 0 || item.egress) && (
              <label className="mt-2 block min-w-0 space-y-1">
                <FieldLabel>
                  {t("settings.upstream_egress", { defaultValue: "Through tunnel" })}
                </FieldLabel>
                <Select
                  value={item.egress}
                  onChange={(e) => update(index, { egress: e.target.value })}
                  className="w-full"
                >
                  <option value="">
                    {t("settings.upstream_egress_direct", { defaultValue: "Direct (no tunnel)" })}
                  </option>
                  {egresses.map((eg) => (
                    <option key={eg.id} value={eg.id}>
                      {eg.name || eg.id}
                    </option>
                  ))}
                </Select>
                <span className="block text-[10px] leading-snug text-muted">
                  {t("settings.upstream_egress_help", {
                    defaultValue:
                      "Send this resolver's queries through the tunnel. Falls back to direct if the tunnel is down.",
                  })}
                </span>
              </label>
            )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Btn
          type="button"
          variant="ghost"
          onClick={() => onChange([...value, { ...DEFAULT_UPSTREAM_DRAFT }])}
        >
          <Plus size={12} /> {t("settings.add_upstream")}
        </Btn>
        <span className="font-mono text-[10px] tracking-[0.12em] text-muted/70 uppercase">
          {t("settings.quick_add")}:
        </span>
        {UPSTREAM_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange([...value, { ...preset.draft }])}
            className="rounded-xs border border-bdr/80 px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-ember/40 hover:text-ember"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Zone routing ──────────────────────────────────────────────────────────────

function ZonesEditor({
  value,
  onChange,
}: {
  value: ZoneDraft[];
  onChange: (next: ZoneDraft[]) => void;
}) {
  const { t } = useTranslation();
  // Rows are deleted by index and their name field is editable, so neither can
  // serve as the key — see `useRowKeys`.
  const rowKeys = useRowKeys(value.length);

  function update(index: number, patch: Partial<ZoneDraft>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="w-full space-y-2">
      {value.length === 0 ? (
        <p className="rounded-xs border border-bdr/70 bg-sidebar/60 px-3 py-3 text-xs text-muted">
          {t("settings.zones_empty")}
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)_1.5rem] items-center gap-2 px-1 text-muted">
            <FieldLabel>{t("settings.zone_name")}</FieldLabel>
            <span />
            <FieldLabel>{t("settings.zone_upstream")}</FieldLabel>
            <span />
          </div>
          {value.map((item, index) => (
            <div
              key={rowKeys.keyAt(index)}
              className="grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)_1.5rem] items-center gap-2"
            >
              <Input
                value={item.name}
                onChange={(e) => update(index, { name: e.target.value })}
                placeholder="lan.home.arpa"
                className="w-full font-mono"
              />
              <MoveRight size={13} className="justify-self-center text-ember/70" />
              <Input
                value={item.upstream}
                onChange={(e) => update(index, { upstream: e.target.value })}
                placeholder="192.168.1.1:53"
                className="w-full font-mono"
              />
              <button
                type="button"
                onClick={() => {
                  rowKeys.remove(index);
                  onChange(value.filter((_, i) => i !== index));
                }}
                className="justify-self-center text-muted transition-colors hover:text-blocked"
                title={t("common.delete")}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <Btn
        type="button"
        variant="ghost"
        onClick={() => {
          rowKeys.add();
          onChange([...value, { name: "1.168.192.in-addr.arpa", upstream: "192.168.1.1:53" }]);
        }}
      >
        <Plus size={12} /> {t("settings.add_zone")}
      </Btn>
    </div>
  );
}

// ── Config dump ───────────────────────────────────────────────────────────────

function ConfigSection({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;
  const entries = isPlainObject(value) ? Object.entries(value) : [["value", value]];

  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 text-xs font-medium text-ember">{title}</p>
      <div className="space-y-1 border-l border-bdr pl-2">
        {entries.map(([k, v]) => (
          <div key={String(k)} className="flex justify-between gap-4 text-xs">
            <span className="shrink-0 font-mono text-muted">{String(k)}</span>
            <span className="truncate text-right font-mono text-body">{formatConfigValue(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CollapsibleConfig({ settings }: { settings: SettingsType }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden p-0">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
        onClick={() => setOpen((p) => !p)}
      >
        <span>
          <span className="block text-sm font-semibold text-heading">
            {t("settings.current_config")}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            {t("settings.current_config_sub")}
          </span>
        </span>
        {open ? (
          <ChevronUp size={13} className="shrink-0 text-muted" />
        ) : (
          <ChevronDown size={13} className="shrink-0 text-muted" />
        )}
      </button>
      {open && (
        <div className="max-h-120 overflow-auto border-t border-bdr/55 px-4 py-4">
          {Object.entries(settings).map(([k, v]) => (
            <ConfigSection key={k} title={k} value={v} />
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Updates ───────────────────────────────────────────────────────────────────

function UpdatesCard() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<UpdateCheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [updatingServer, setUpdatingServer] = useState(false);
  const [updatingWeb, setUpdatingWeb] = useState(false);
  const [msg, setMsg] = useState("");

  // Prefill from the server's CACHED check on mount so installed versions and any
  // available-update info show immediately, without the user pressing "Check".
  // Stay quiet on failure — the "Check" button still surfaces real errors.
  useEffect(() => {
    let alive = true;
    api
      .checkUpdate(false)
      .then((d) => {
        if (alive) setInfo(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function checkUpdate() {
    setChecking(true);
    setMsg("");
    try {
      setInfo(await api.checkUpdate(true));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function doUpdate(fn: () => Promise<UpdateApplyResponse>, setter: (v: boolean) => void) {
    setter(true);
    setMsg("");
    try {
      const d = await fn();
      setMsg(
        d.status === "updated"
          ? t("settings.updated_to", { version: d.version })
          : t("settings.already_up_to_date", { version: d.version }),
      );
      try {
        setInfo(await api.checkUpdate(true));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setter(false);
    }
  }

  function VersionRow({
    label,
    component,
  }: {
    label: string;
    component: {
      current: string;
      latest: string;
      update_available: boolean;
      blocked?: { version: string; required_server: string; reason: string } | null;
    };
  }) {
    return (
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-3">
          <span className="w-20 text-muted">{label}</span>
          <span className="font-mono text-heading">{component.current}</span>
          {component.update_available ? (
            <span className="flex items-center gap-1 rounded-full bg-ember/10 px-2 py-0.5 text-[10px] font-medium text-ember">
              → {component.latest}
            </span>
          ) : component.blocked ? (
            <span className="flex items-center gap-1 rounded-full bg-upstream/10 px-2 py-0.5 text-[10px] font-medium text-upstream">
              {t("settings.update_blocked")} {component.blocked.version}
            </span>
          ) : (
            <span className="text-muted/60">{t("settings.up_to_date")}</span>
          )}
        </div>
        {component.blocked && (
          <p className="ml-23 text-[11px] leading-relaxed text-muted/70">
            {component.blocked.reason}
          </p>
        )}
      </div>
    );
  }

  return (
    <SettingsPanel
      title={t("settings.updates")}
      sub={t("settings.updates_sub")}
      icon={Download}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Btn variant="ghost" onClick={checkUpdate} disabled={checking}>
            <RefreshCw size={12} className={checking ? "animate-spin" : ""} />
            {t("settings.check_updates")}
          </Btn>
          {info?.server?.update_available && (
            <Btn
              onClick={() => doUpdate(api.updateServer, setUpdatingServer)}
              disabled={updatingServer}
            >
              <Download size={12} /> {t("settings.update_server")}
            </Btn>
          )}
          {info?.web?.update_available && (
            <Btn
              variant="ghost"
              onClick={() => doUpdate(api.updateWeb, setUpdatingWeb)}
              disabled={updatingWeb}
            >
              <Download size={12} /> {t("settings.update_web")}
            </Btn>
          )}
        </div>
      }
    >
      {info && (
        <div className="space-y-2 py-4">
          <VersionRow label={t("settings.server")} component={info.server} />
          <VersionRow label={t("settings.web_ui")} component={info.web} />
        </div>
      )}

      {!info && !msg && <p className="py-4 text-xs text-muted">{t("settings.updates_empty")}</p>}

      {msg && <p className="py-4 text-xs text-upstream">{msg}</p>}
    </SettingsPanel>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { t } = useTranslation();
  // `/settings?tab=notifications` opens that tab — other pages link here.
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "general";
  const toast = useToast();

  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [form, setForm] = useState<HotForm>({
    dns_min_ttl: "",
    dns_max_ttl: "",
    dns_client_ttl: "",
    log_retention_days: "",
    log_max_mb: "",
    web_dir: "",
    api_key: "",
    password: "",
    blocklist_enabled: true,
    debug_logging: false,
    log_queries: true,
    keep_stats: true,
  });
  const [logIgnore, setLogIgnore] = useState<string[]>([]);
  const [logIgnoreInput, setLogIgnoreInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);

  const [restartForm, setRestartForm] = useState<RestartForm>({
    storage_backend: "sqlite",
    storage_path: "",
    blocklist_cache_dir: "",
    dns_bind_addr: "",
    dns_cache_size: "",
    dns_strip_ecs: true,
    dns_dnssec: true,
    blocklist_decision_cache_size: "",
    api_bind_addr: "",
    upstream: [],
    zones: [],
    panel_enabled: true,
    panel_domain: "",
    panel_ipv4: "",
    panel_url: "",
  });
  const [restarting, setRestarting] = useState(false);
  const [storageLocations, setStorageLocations] = useState<StorageLocations | null>(null);
  const [purging, setPurging] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  /** Delete every stored query, rollup and counter, then vacuum the database.
   *  Switching recording off stops new data; this is what removes the old. */
  async function handlePurge() {
    if (!(await confirm(t("settings.purge_data_confirm")))) return;
    setPurging(true);
    try {
      const res = await api.purgeQueryLog();
      // The rows are gone either way; only the disk space is in question, so
      // don't claim it came back until the rebuild says so.
      toast(
        res.vacuum === "failed"
          ? t("settings.purged_no_vacuum")
          : res.vacuum === "running"
            ? t("settings.purged_vacuum_running")
            : t("settings.purged"),
      );
    } catch (e) {
      // A toast, not the page-level error banner: that banner renders at the very
      // top, and this button sits far below the fold inside a tab — the failure
      // would land where nobody is looking, and the button flipping back from
      // "Deleting…" reads as success.
      toast((e as Error).message);
    } finally {
      setPurging(false);
    }
  }

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const s = await api.getSettings();
      setSettings(s);
      setApiKeySet(s.api?.api_key === "***");
      setPasswordSet(s.api?.password_hash === "***");
      setForm((p) => ({ ...p, ...hotFormFromSettings(s) }));
      setLogIgnore(s.dns?.log_ignore ?? []);
      setRestartForm(restartFormFromSettings(s));
      // Check if password is set
      api
        .checkAuth()
        .then((a) => setPasswordSet(a.password_set))
        .catch(() => {});
      // Best-effort: the path field works without the suggestions, so a
      // failure here leaves the operator typing rather than stuck.
      api
        .storageLocations()
        .then(setStorageLocations)
        .catch(() => {});
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function pollUntilBack() {
    // Give up after ~2 minutes (60 tries, 2s apart) so a server that never
    // comes back doesn't leave the UI polling and showing "restarting…" forever.
    const maxAttempts = 60;
    let attempts = 0;
    const attempt = () => {
      attempts += 1;
      api
        .getSettings()
        .then((s) => {
          setRestarting(false);
          setSettings(s);
          setForm((p) => ({ ...p, ...hotFormFromSettings(s) }));
          setLogIgnore(s.dns?.log_ignore ?? []);
          setRestartForm(restartFormFromSettings(s));
          toast(t("settings.restarted"));
        })
        .catch(() => {
          if (attempts >= maxAttempts) {
            setRestarting(false);
            toast(t("settings.restart_timeout"), "error");
            return;
          }
          setTimeout(attempt, 2000);
        });
    };
    setTimeout(attempt, 1000);
  }

  function addLogIgnorePattern() {
    const p = logIgnoreInput.trim();
    if (p && !logIgnore.includes(p)) setLogIgnore((prev) => [...prev, p]);
    setLogIgnoreInput("");
  }

  function resetForms() {
    if (!settings) return;
    setForm((p) => ({ ...p, ...hotFormFromSettings(settings), api_key: "", password: "" }));
    setLogIgnore(settings.dns?.log_ignore ?? []);
    setRestartForm(restartFormFromSettings(settings));
  }

  const hotPatch = settings ? buildHotPatch(form, logIgnore, settings) : {};
  const restartPatch = settings ? buildRestartPatch(restartForm, settings) : {};
  const restartNeeded = Object.keys(restartPatch).length > 0;
  const dirty = Object.keys(hotPatch).length > 0 || restartNeeded;

  async function handleSave(e: SubmitEvent) {
    e.preventDefault();
    const patch: PatchSettingsBody = { ...hotPatch, ...restartPatch };
    if (Object.keys(patch).length === 0) {
      toast(t("settings.no_changes"));
      return;
    }
    setSaving(true);
    try {
      const res = await api.patchSettings(patch);
      window.dispatchEvent(new Event("ferrite:settings-changed"));
      if (patch.api_key) setApiKeySet(true);
      if (patch.password) setPasswordSet(true);
      if (res.restart_required) {
        setRestarting(true);
        setForm((p) => ({ ...p, api_key: "", password: "" }));
        pollUntilBack();
      } else {
        toast(t("settings.settings_saved"));
        await loadSettings();
        setForm((p) => ({ ...p, api_key: "", password: "" }));
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function clearField(field: ClearableSecretField) {
    try {
      await api.patchSettings({ [field]: null });
      window.dispatchEvent(new Event("ferrite:settings-changed"));
      if (field === "api_key") setApiKeySet(false);
      if (field === "password") setPasswordSet(false);
      toast(field === "api_key" ? t("settings.api_key_cleared") : t("settings.password_cleared"));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  // Every boolean field, not just the first one that existed: `setF` assigns
  // `e.target.value`, so letting a boolean through would silently store a string
  // in it.
  type TextFormField = Exclude<
    keyof HotForm,
    "blocklist_enabled" | "debug_logging" | "log_queries" | "keep_stats"
  >;
  const setF = (key: TextFormField) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));
  type RestartTextField = Exclude<
    keyof RestartForm,
    "upstream" | "zones" | "panel_enabled" | "dns_strip_ecs" | "dns_dnssec"
  >;
  const setR = (key: RestartTextField) => (e: ChangeEvent<HTMLInputElement>) =>
    setRestartForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <PageContainer>
      {ConfirmDialog}
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        action={
          <Btn variant="ghost" onClick={loadSettings} disabled={loading}>
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {t("common.refresh")}
          </Btn>
        }
      />
      {err && <Err msg={err} />}
      {loading && <Spinner />}

      {restarting && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xs border border-warn/30 bg-warn/5 px-4 py-3 text-xs text-warn">
          <RefreshCw size={13} className="shrink-0 animate-spin" />
          {t("settings.restarting")}
        </div>
      )}

      {settings && (
        <form onSubmit={handleSave} className="space-y-4">
          <SettingsOverview settings={settings} apiKeySet={apiKeySet} passwordSet={passwordSet} />

          <Tabs defaultValue={initialTab}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="general">{t("settings.general")}</TabsTrigger>
              <TabsTrigger value="resolvers">{t("settings.upstream_resolvers")}</TabsTrigger>
              <TabsTrigger value="network">{t("settings.network")}</TabsTrigger>
              <TabsTrigger value="panel">{t("settings.panel")}</TabsTrigger>
              <TabsTrigger value="access">{t("settings.access")}</TabsTrigger>
              <TabsTrigger value="notifications">
                {t("notifications.title", { defaultValue: "Notifications" })}
              </TabsTrigger>
              <TabsTrigger value="system">{t("settings.system")}</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 pt-4">
              <SettingsPanel
                title={t("settings.general")}
                sub={t("settings.live_changes_sub")}
                icon={ServerCog}
              >
                <SettingRow label={t("settings.min_ttl")} sub={t("settings.min_ttl_sub")}>
                  <UnitInput
                    type="number"
                    min={0}
                    max={3600}
                    unit="s"
                    value={form.dns_min_ttl}
                    onChange={setF("dns_min_ttl")}
                  />
                </SettingRow>
                <SettingRow label={t("settings.max_ttl")} sub={t("settings.max_ttl_sub")}>
                  <UnitInput
                    type="number"
                    min={0}
                    max={3600}
                    unit="s"
                    value={form.dns_max_ttl}
                    onChange={setF("dns_max_ttl")}
                  />
                </SettingRow>
                <SettingRow label={t("settings.client_ttl")} sub={t("settings.client_ttl_sub")}>
                  <UnitInput
                    type="number"
                    min={0}
                    max={3600}
                    unit="s"
                    value={form.dns_client_ttl}
                    onChange={setF("dns_client_ttl")}
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.log_retention")}
                  sub={t("settings.log_retention_sub")}
                >
                  <UnitInput
                    type="number"
                    min={0}
                    unit="d"
                    value={form.log_retention_days}
                    onChange={setF("log_retention_days")}
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.storage_backend")}
                  sub={
                    restartForm.storage_backend === "memory"
                      ? t("settings.storage_backend_memory_sub")
                      : t("settings.storage_backend_sqlite_sub")
                  }
                  badge={<RestartBadge />}
                >
                  <Select
                    value={restartForm.storage_backend}
                    onChange={(e) =>
                      setRestartForm((f) => ({
                        ...f,
                        storage_backend: e.target.value as StorageBackend,
                      }))
                    }
                    className="w-full"
                  >
                    <option value="sqlite">{t("settings.storage_backend_sqlite")}</option>
                    <option value="memory">{t("settings.storage_backend_memory")}</option>
                  </Select>
                </SettingRow>
                {restartForm.storage_backend === "sqlite" && (
                  <SettingRow
                    label={t("settings.storage_path")}
                    sub={t("settings.storage_path_sub")}
                    badge={<RestartBadge />}
                  >
                    <div className="w-full space-y-1.5">
                      <Input
                        value={restartForm.storage_path}
                        onChange={(e) =>
                          setRestartForm((f) => ({ ...f, storage_path: e.target.value }))
                        }
                        placeholder={storageLocations?.default ?? "/var/lib/ferrite/ferrite.db"}
                        className="w-full font-mono"
                      />
                      <LocationChips
                        locations={storageLocations}
                        value={restartForm.storage_path}
                        pick={(sug) => sug.path}
                        onPick={(v) => setRestartForm((f) => ({ ...f, storage_path: v }))}
                      />
                      {isRamPath(restartForm.storage_path, storageLocations) && (
                        <p className="text-[11px] text-warn">{t("settings.storage_ram_warning")}</p>
                      )}
                    </div>
                  </SettingRow>
                )}
                <SettingRow
                  label={t("settings.blocklist_cache_dir")}
                  sub={t("settings.blocklist_cache_dir_sub")}
                  badge={<RestartBadge />}
                >
                  <div className="w-full space-y-1.5">
                    <Input
                      value={restartForm.blocklist_cache_dir}
                      onChange={(e) =>
                        setRestartForm((f) => ({ ...f, blocklist_cache_dir: e.target.value }))
                      }
                      placeholder={
                        storageLocations?.blocklist_cache?.default ?? "~/.local/share/ferrite"
                      }
                      className="w-full font-mono"
                    />
                    <LocationChips
                      locations={storageLocations}
                      value={restartForm.blocklist_cache_dir.replace(/\/+$/, "")}
                      pick={(sug) => sug.dir}
                      onPick={(v) => setRestartForm((f) => ({ ...f, blocklist_cache_dir: v }))}
                    />
                    {isRamPath(restartForm.blocklist_cache_dir, storageLocations) && (
                      <p className="text-[11px] text-warn">
                        {t("settings.blocklist_cache_ram_warning")}
                      </p>
                    )}
                  </div>
                </SettingRow>
                <SettingRow label={t("settings.log_max_mb")} sub={t("settings.log_max_mb_sub")}>
                  <UnitInput
                    type="number"
                    min={0}
                    unit="MB"
                    value={form.log_max_mb}
                    onChange={setF("log_max_mb")}
                  />
                </SettingRow>
                <SettingRow label={t("settings.web_dir")} sub={t("settings.web_dir_sub")}>
                  <Input
                    value={form.web_dir}
                    onChange={setF("web_dir")}
                    placeholder="~/.local/share/ferrite/web"
                    className="w-full font-mono"
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.blocking_enabled")}
                  sub={t("settings.blocking_enabled_sub")}
                  badge={
                    <StatusBadge
                      set={form.blocklist_enabled}
                      labelSet={t("common.enabled")}
                      labelUnset={t("common.disabled")}
                    />
                  }
                >
                  <Switch
                    checked={form.blocklist_enabled}
                    onCheckedChange={(checked) =>
                      setForm((p) => ({ ...p, blocklist_enabled: checked }))
                    }
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.debug_logging", { defaultValue: "Debug logging" })}
                  sub={t("settings.debug_logging_sub", {
                    defaultValue:
                      "Verbose logs for diagnosing issues. On by default; turn off if too noisy. Applied immediately.",
                  })}
                  badge={
                    <StatusBadge
                      set={form.debug_logging}
                      labelSet={t("common.enabled")}
                      labelUnset={t("common.disabled")}
                    />
                  }
                >
                  <Switch
                    checked={form.debug_logging}
                    onCheckedChange={(checked) =>
                      setForm((p) => ({ ...p, debug_logging: checked }))
                    }
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.log_ignore")}
                  sub={t("settings.log_ignore_sub")}
                  align="start"
                >
                  <div className="w-full space-y-3">
                    <div className="min-h-18 rounded-xs border border-bdr/70 bg-sidebar/60 p-2">
                      {logIgnore.length === 0 ? (
                        <span className="block px-1 py-1 text-xs text-muted/60 italic">
                          {t("settings.no_patterns")}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {logIgnore.map((pattern) => (
                            <span
                              key={pattern}
                              className="flex max-w-full items-center gap-1.5 rounded-xs border border-bdr/80 bg-panel px-2 py-1 font-mono text-[11px] text-body"
                            >
                              <span className="truncate">{pattern}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setLogIgnore((prev) => prev.filter((x) => x !== pattern))
                                }
                                className="shrink-0 text-muted transition-colors hover:text-blocked"
                                aria-label={t("common.delete")}
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <Input
                        value={logIgnoreInput}
                        onChange={(e) => setLogIgnoreInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addLogIgnorePattern();
                          }
                        }}
                        placeholder="*.arpa"
                        className="w-full font-mono"
                      />
                      <Btn type="button" variant="ghost" onClick={addLogIgnorePattern}>
                        {t("settings.add_pattern")}
                      </Btn>
                    </div>
                  </div>
                </SettingRow>
              </SettingsPanel>

              <SettingsPanel
                title={t("settings.privacy")}
                sub={t("settings.privacy_sub")}
                icon={EyeOff}
              >
                <SettingRow
                  label={t("settings.log_queries")}
                  sub={t("settings.log_queries_sub")}
                  badge={
                    <StatusBadge
                      set={form.log_queries}
                      labelSet={t("common.enabled")}
                      labelUnset={t("common.disabled")}
                    />
                  }
                >
                  <Switch
                    checked={form.log_queries}
                    onCheckedChange={(checked) => setForm((p) => ({ ...p, log_queries: checked }))}
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.keep_stats")}
                  sub={t("settings.keep_stats_sub")}
                  badge={
                    <StatusBadge
                      set={form.keep_stats}
                      labelSet={t("common.enabled")}
                      labelUnset={t("common.disabled")}
                    />
                  }
                >
                  <Switch
                    checked={form.keep_stats}
                    onCheckedChange={(checked) => setForm((p) => ({ ...p, keep_stats: checked }))}
                  />
                </SettingRow>
                {!form.log_queries && !form.keep_stats && (
                  <SettingRow
                    label={t("settings.record_nothing")}
                    sub={t("settings.record_nothing_sub")}
                  >
                    <span />
                  </SettingRow>
                )}
                <SettingRow label={t("settings.purge_data")} sub={t("settings.purge_data_sub")}>
                  <Btn type="button" variant="danger" onClick={handlePurge} disabled={purging}>
                    <Trash2 size={12} />
                    {purging ? t("settings.purging") : t("settings.purge_data_action")}
                  </Btn>
                </SettingRow>
              </SettingsPanel>
            </TabsContent>

            <TabsContent value="resolvers" className="space-y-4 pt-4">
              <SettingsPanel
                title={t("settings.upstream_resolvers")}
                sub={t("settings.upstream_resolvers_sub")}
                icon={RadioTower}
                badge={<RestartBadge />}
              >
                <SettingBlock label={t("settings.upstream")} sub={t("settings.upstream_sub")}>
                  <UpstreamEditor
                    value={restartForm.upstream}
                    onChange={(upstream) => setRestartForm((p) => ({ ...p, upstream }))}
                  />
                </SettingBlock>
              </SettingsPanel>

              <SettingsPanel
                title={t("settings.zone_routing")}
                sub={t("settings.zone_routing_sub")}
                icon={Route}
                badge={<RestartBadge />}
              >
                <SettingBlock label={t("settings.zones")} sub={t("settings.zones_sub")}>
                  <ZonesEditor
                    value={restartForm.zones}
                    onChange={(zones) => setRestartForm((p) => ({ ...p, zones }))}
                  />
                </SettingBlock>
              </SettingsPanel>
            </TabsContent>

            <TabsContent value="network" className="space-y-4 pt-4">
              <SettingsPanel
                title={t("settings.network")}
                sub={t("settings.restart_changes_sub")}
                icon={RadioTower}
                badge={<RestartBadge />}
              >
                <SettingRow label={t("settings.dns_bind")} sub={t("settings.dns_bind_sub")}>
                  <Input
                    value={restartForm.dns_bind_addr}
                    onChange={setR("dns_bind_addr")}
                    placeholder="0.0.0.0:53"
                    className="w-full font-mono"
                  />
                </SettingRow>
                <SettingRow label={t("settings.cache_size")} sub={t("settings.cache_size_sub")}>
                  <UnitInput
                    type="number"
                    unit={t("settings.entries_unit")}
                    value={restartForm.dns_cache_size}
                    onChange={setR("dns_cache_size")}
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.dns_dnssec", { defaultValue: "Request DNSSEC" })}
                  sub={t("settings.dns_dnssec_sub", {
                    defaultValue:
                      "Set the DO bit and forward signatures. Enforcement needs a validating resolver over DoT/DoH.",
                  })}
                  badge={
                    <StatusBadge
                      set={restartForm.dns_dnssec}
                      labelSet={t("common.enabled")}
                      labelUnset={t("common.disabled")}
                    />
                  }
                >
                  <Switch
                    checked={restartForm.dns_dnssec}
                    onCheckedChange={(checked) =>
                      setRestartForm((p) => ({ ...p, dns_dnssec: checked }))
                    }
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.dns_strip_ecs", { defaultValue: "Don't send client subnet" })}
                  sub={t("settings.dns_strip_ecs_sub", {
                    defaultValue:
                      "Strip EDNS Client Subnet from upstream queries so the resolver never learns the client's subnet.",
                  })}
                  badge={
                    <StatusBadge
                      set={restartForm.dns_strip_ecs}
                      labelSet={t("common.enabled")}
                      labelUnset={t("common.disabled")}
                    />
                  }
                >
                  <Switch
                    checked={restartForm.dns_strip_ecs}
                    onCheckedChange={(checked) =>
                      setRestartForm((p) => ({ ...p, dns_strip_ecs: checked }))
                    }
                  />
                </SettingRow>
                <SettingRow
                  label={t("settings.blocklist_cache_size")}
                  sub={t("settings.blocklist_cache_size_sub")}
                >
                  <UnitInput
                    type="number"
                    min={1}
                    unit={t("settings.entries_unit")}
                    value={restartForm.blocklist_decision_cache_size}
                    onChange={setR("blocklist_decision_cache_size")}
                  />
                </SettingRow>
                <SettingRow label={t("settings.api_bind")} sub={t("settings.api_bind_sub")}>
                  <Input
                    value={restartForm.api_bind_addr}
                    onChange={setR("api_bind_addr")}
                    placeholder="127.0.0.1:8080"
                    className="w-full font-mono"
                  />
                </SettingRow>
              </SettingsPanel>
            </TabsContent>

            <TabsContent value="panel" className="space-y-4 pt-4">
              <SettingsPanel
                title={t("settings.panel")}
                sub={t("settings.panel_sub")}
                icon={PanelTop}
                badge={<RestartBadge />}
              >
                <SettingRow
                  label={t("settings.panel_enabled")}
                  sub={t("settings.panel_enabled_sub")}
                  badge={
                    <StatusBadge
                      set={restartForm.panel_enabled}
                      labelSet={t("common.enabled")}
                      labelUnset={t("common.disabled")}
                    />
                  }
                >
                  <Switch
                    checked={restartForm.panel_enabled}
                    onCheckedChange={(checked) =>
                      setRestartForm((p) => ({ ...p, panel_enabled: checked }))
                    }
                  />
                </SettingRow>
                <SettingRow label={t("settings.panel_domain")} sub={t("settings.panel_domain_sub")}>
                  <Input
                    value={restartForm.panel_domain}
                    onChange={setR("panel_domain")}
                    placeholder="fe.te"
                    className="w-full font-mono"
                  />
                </SettingRow>
                <SettingRow label={t("settings.panel_ipv4")} sub={t("settings.panel_ipv4_sub")}>
                  <Input
                    value={restartForm.panel_ipv4}
                    onChange={setR("panel_ipv4")}
                    placeholder="192.168.1.10"
                    className="w-full font-mono"
                  />
                </SettingRow>
                <SettingRow label={t("settings.panel_url")} sub={t("settings.panel_url_sub")}>
                  <Input
                    value={restartForm.panel_url}
                    onChange={setR("panel_url")}
                    placeholder="http://fe.te:8031"
                    className="w-full font-mono"
                  />
                </SettingRow>
              </SettingsPanel>
            </TabsContent>

            <TabsContent value="access" className="space-y-4 pt-4">
              <SettingsPanel
                title={t("settings.access")}
                sub={t("settings.access_sub")}
                icon={KeyRound}
              >
                <SettingRow
                  label={t("settings.api_key")}
                  badge={
                    <StatusBadge
                      set={apiKeySet}
                      labelSet={t("common.enabled")}
                      labelUnset={t("settings.api_key_not_set")}
                    />
                  }
                >
                  <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-2">
                    <Btn
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        const key = generateKey();
                        setForm((p) => ({ ...p, api_key: key }));
                        setShowApiKey(true);
                      }}
                      title={t("settings.generate")}
                      className="px-2.5"
                    >
                      <Shuffle size={12} />
                    </Btn>
                    <SecretInput
                      shown={showApiKey}
                      onToggle={() => setShowApiKey((p) => !p)}
                      value={form.api_key}
                      onChange={setF("api_key")}
                      placeholder={apiKeySet ? "••••••••" : t("settings.api_key_placeholder")}
                      className="font-mono"
                    />
                    <Btn
                      type="button"
                      variant="danger"
                      onClick={() => clearField("api_key")}
                      disabled={!apiKeySet}
                      title={t("settings.api_key_clear_title")}
                      className="px-2.5"
                    >
                      <X size={13} />
                    </Btn>
                  </div>
                </SettingRow>

                <SettingRow
                  label={t("settings.password")}
                  sub={t("settings.password_sub")}
                  badge={
                    <StatusBadge
                      set={passwordSet}
                      labelSet={t("common.enabled")}
                      labelUnset={t("common.disabled")}
                    />
                  }
                >
                  <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <SecretInput
                      shown={showPwd}
                      onToggle={() => setShowPwd((p) => !p)}
                      value={form.password}
                      onChange={setF("password")}
                      placeholder={t("settings.password_new_placeholder")}
                    />
                    <Btn
                      type="button"
                      variant="danger"
                      onClick={() => clearField("password")}
                      disabled={!passwordSet}
                      title={t("settings.password_disable_title")}
                      className="px-2.5"
                    >
                      <X size={13} />
                    </Btn>
                  </div>
                </SettingRow>
              </SettingsPanel>
              {passwordSet && <SessionsCard />}
              <McpCard apiKeySet={apiKeySet} />
            </TabsContent>

            <TabsContent value="notifications" className="space-y-4 pt-4">
              <NotificationsCard />
            </TabsContent>

            <TabsContent value="system" className="space-y-4 pt-4">
              <UpdatesCard />
              <BackupCard
                confirm={confirm}
                onRestored={() => {
                  setRestarting(true);
                  pollUntilBack();
                }}
              />
              <CollapsibleConfig settings={settings} />
            </TabsContent>
          </Tabs>

          {dirty && (
            <div className="control-surface plate-ticks sticky bottom-4 z-10 flex animate-fade-up flex-col gap-3 rounded-xs border border-bdr/85 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5 text-xs">
                <span className="h-1.5 w-1.5 animate-pulse bg-warn" />
                <span className="font-medium text-heading">{t("settings.unsaved_changes")}</span>
                {restartNeeded && <RestartBadge />}
              </div>
              <div className="flex gap-2">
                <Btn type="button" variant="ghost" onClick={resetForms} disabled={saving}>
                  {t("common.reset")}
                </Btn>
                <Btn type="submit" disabled={saving || restarting}>
                  <Save size={12} />
                  {restartNeeded ? t("settings.save_restart") : t("settings.save")}
                </Btn>
              </div>
            </div>
          )}
        </form>
      )}
    </PageContainer>
  );
}
