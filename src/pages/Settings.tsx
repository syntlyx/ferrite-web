import { useEffect, useState, useCallback } from "react";
import type { ChangeEvent, ComponentType, FormEvent, InputHTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/layout/Card";
import { Spinner } from "@/components/feedback/Spinner";
import { Err } from "@/components/feedback/Err";
import { Input, Btn, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import type {
  PatchSettingsBody,
  Settings as SettingsType,
  UpdateApplyResponse,
  UpdateCheckResponse,
  UpstreamConfig,
  ZoneConfig,
} from "@/api/types";

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

type UpstreamDraft = {
  type: string;
  address: string;
  port: string;
  tls_name: string;
  url: string;
  bootstrap_ip: string;
};

type ZoneDraft = {
  name: string;
  upstream: string;
};

const DEFAULT_UPSTREAM_DRAFT: UpstreamDraft = {
  type: "plain",
  address: "1.1.1.1",
  port: "53",
  tls_name: "",
  url: "",
  bootstrap_ip: "",
};

const UPSTREAM_PRESETS: { label: string; draft: UpstreamDraft }[] = [
  {
    label: "Cloudflare DoT",
    draft: {
      type: "tls",
      address: "1.1.1.1",
      port: "853",
      tls_name: "cloudflare-dns.com",
      url: "",
      bootstrap_ip: "",
    },
  },
  {
    label: "Google DoT",
    draft: {
      type: "tls",
      address: "8.8.8.8",
      port: "853",
      tls_name: "dns.google",
      url: "",
      bootstrap_ip: "",
    },
  },
  {
    label: "Quad9 DoT",
    draft: {
      type: "tls",
      address: "9.9.9.9",
      port: "853",
      tls_name: "dns.quad9.net",
      url: "",
      bootstrap_ip: "",
    },
  },
  {
    label: "Cloudflare DoH",
    draft: {
      type: "https",
      address: "",
      port: "443",
      tls_name: "",
      url: "https://cloudflare-dns.com/dns-query",
      bootstrap_ip: "1.1.1.1",
    },
  },
];

function defaultPort(type: string): string {
  if (type === "tls" || type === "quic") return "853";
  return "53";
}

function upstreamToDraft(upstream: UpstreamConfig): UpstreamDraft {
  return {
    ...DEFAULT_UPSTREAM_DRAFT,
    type: upstream.type || "plain",
    address: upstream.address ?? "",
    port: String(upstream.port ?? Number(defaultPort(upstream.type))),
    tls_name: upstream.tls_name ?? "",
    url: upstream.url ?? "",
    bootstrap_ip: upstream.bootstrap_ip ?? "",
  };
}

function draftToUpstream(draft: UpstreamDraft): UpstreamConfig {
  const type = draft.type || "plain";
  if (type === "https") {
    const upstream: UpstreamConfig = { type, url: draft.url.trim() };
    const bootstrap = draft.bootstrap_ip.trim();
    if (bootstrap) upstream.bootstrap_ip = bootstrap;
    return upstream;
  }

  const upstream: UpstreamConfig = {
    type,
    address: draft.address.trim(),
    port: Number(draft.port),
  };
  if (type === "tls" || type === "quic") upstream.tls_name = draft.tls_name.trim();
  return upstream;
}

function upstreamsToDraft(upstreams: UpstreamConfig[] | undefined): UpstreamDraft[] {
  return upstreams?.length ? upstreams.map(upstreamToDraft) : [{ ...DEFAULT_UPSTREAM_DRAFT }];
}

function zonesToDraft(zones: ZoneConfig[] | undefined): ZoneDraft[] {
  return zones?.map((z) => ({ name: z.name, upstream: z.upstream })) ?? [];
}

function draftToZone(draft: ZoneDraft): ZoneConfig {
  return {
    name: draft.name.trim(),
    upstream: draft.upstream.trim(),
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

type HotForm = {
  dns_min_ttl: string;
  dns_max_ttl: string;
  log_retention_days: string;
  web_dir: string;
  api_key: string;
  password: string;
  blocklist_enabled: boolean;
};

type RestartForm = {
  dns_bind_addr: string;
  dns_cache_size: string;
  blocklist_decision_cache_size: string;
  api_bind_addr: string;
  upstream: UpstreamDraft[];
  zones: ZoneDraft[];
  panel_enabled: boolean;
  panel_domain: string;
  panel_ipv4: string;
  panel_url: string;
};

function hotFormFromSettings(s: SettingsType): Omit<HotForm, "api_key" | "password"> {
  return {
    dns_min_ttl: String(s.dns?.min_ttl ?? ""),
    dns_max_ttl: String(s.dns?.max_ttl ?? ""),
    log_retention_days: String(s.storage?.log_retention_days ?? ""),
    web_dir: String(s.web_dir ?? ""),
    blocklist_enabled: s.blocklist?.enabled ?? true,
  };
}

/** Build the restart-form draft from a settings payload. Shared by the initial
 *  load and the post-restart poll so the two stay in sync. */
function restartFormFromSettings(s: SettingsType): RestartForm {
  return {
    dns_bind_addr: s.dns?.bind_addr ?? "",
    dns_cache_size: String(s.dns?.cache_size ?? ""),
    blocklist_decision_cache_size: String(s.blocklist?.decision_cache_size ?? ""),
    api_bind_addr: s.api?.bind_addr ?? "",
    upstream: upstreamsToDraft(s.upstream),
    zones: zonesToDraft(s.zones),
    panel_enabled: s.panel?.enabled ?? true,
    panel_domain: s.panel?.domain ?? "fe.te",
    panel_ipv4: s.panel?.ipv4 ?? "",
    panel_url: s.panel?.url ?? "",
  };
}

/** Diff the live-applied fields against the loaded settings. */
function buildHotPatch(
  form: HotForm,
  logIgnore: string[],
  settings: SettingsType,
): PatchSettingsBody {
  const patch: PatchSettingsBody = {};
  if (form.dns_min_ttl !== "" && Number(form.dns_min_ttl) !== settings.dns?.min_ttl)
    patch.dns_min_ttl = Number(form.dns_min_ttl);
  if (form.dns_max_ttl !== "" && Number(form.dns_max_ttl) !== settings.dns?.max_ttl)
    patch.dns_max_ttl = Number(form.dns_max_ttl);
  if (
    form.log_retention_days !== "" &&
    Number(form.log_retention_days) !== settings.storage?.log_retention_days
  )
    patch.log_retention_days = Number(form.log_retention_days);
  const nextWebDir = form.web_dir.trim();
  const currentWebDir = settings.web_dir ?? "";
  if (nextWebDir !== currentWebDir) patch.web_dir = nextWebDir === "" ? null : nextWebDir;
  if (form.api_key.trim() !== "") patch.api_key = form.api_key.trim();
  if (form.password !== "") patch.password = form.password;
  if (form.blocklist_enabled !== (settings.blocklist?.enabled ?? true))
    patch.blocklist_enabled = form.blocklist_enabled;
  const originalIgnore = settings.dns?.log_ignore ?? [];
  if (JSON.stringify(logIgnore) !== JSON.stringify(originalIgnore))
    patch.dns_log_ignore = logIgnore;
  return patch;
}

/** Diff the restart-required fields against the loaded settings. */
function buildRestartPatch(form: RestartForm, settings: SettingsType): PatchSettingsBody {
  const patch: PatchSettingsBody = {};
  if (form.dns_bind_addr !== (settings.dns?.bind_addr ?? ""))
    patch.dns_bind_addr = form.dns_bind_addr;
  if (form.dns_cache_size !== String(settings.dns?.cache_size ?? ""))
    patch.dns_cache_size = Number(form.dns_cache_size);
  if (form.blocklist_decision_cache_size !== String(settings.blocklist?.decision_cache_size ?? ""))
    patch.blocklist_decision_cache_size = Number(form.blocklist_decision_cache_size);
  if (form.api_bind_addr !== (settings.api?.bind_addr ?? ""))
    patch.api_bind_addr = form.api_bind_addr;

  const nextUpstreams = form.upstream.map(draftToUpstream);
  const currentUpstreams = (settings.upstream ?? []).map(upstreamToDraft).map(draftToUpstream);
  if (stableJson(nextUpstreams) !== stableJson(currentUpstreams)) patch.upstream = nextUpstreams;

  const nextZones = form.zones.map(draftToZone).filter((z) => z.name || z.upstream);
  const currentZones = zonesToDraft(settings.zones).map(draftToZone);
  if (stableJson(nextZones) !== stableJson(currentZones)) patch.zones = nextZones;

  if (form.panel_enabled !== (settings.panel?.enabled ?? true))
    patch.panel_enabled = form.panel_enabled;
  const nextPanelDomain = form.panel_domain.trim() || "fe.te";
  if (nextPanelDomain !== (settings.panel?.domain ?? "fe.te")) patch.panel_domain = nextPanelDomain;
  const nextPanelIpv4 = form.panel_ipv4.trim();
  if (nextPanelIpv4 !== (settings.panel?.ipv4 ?? ""))
    patch.panel_ipv4 = nextPanelIpv4 === "" ? null : nextPanelIpv4;
  const nextPanelUrl = form.panel_url.trim();
  if (nextPanelUrl !== (settings.panel?.url ?? ""))
    patch.panel_url = nextPanelUrl === "" ? null : nextPanelUrl;
  return patch;
}

// ── Layout primitives ─────────────────────────────────────────────────────────

type SettingsIcon = ComponentType<{ size?: number; className?: string }>;

function SettingsPanel({
  title,
  sub,
  icon: Icon,
  badge,
  footer,
  children,
}: {
  title: string;
  sub?: string;
  icon: SettingsIcon;
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-bdr/60 flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="border-ember/15 bg-ember/10 text-ember rounded-xs shrink-0 border p-2">
            <Icon size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-heading text-sm font-semibold">{title}</p>
            {sub && <p className="text-muted mt-0.5 text-xs leading-relaxed">{sub}</p>}
          </div>
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      <div className="divide-bdr/55 divide-y px-4">{children}</div>
      {footer && <div className="border-bdr/55 bg-void/20 border-t px-4 py-3">{footer}</div>}
    </Card>
  );
}

function SettingRow({
  label,
  sub,
  badge,
  children,
  align = "center",
}: {
  label: string;
  sub?: string;
  badge?: ReactNode;
  children: ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div
      className={cn(
        "grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]",
        align === "center" ? "sm:items-center" : "sm:items-start",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-heading text-sm font-medium">{label}</p>
          {badge}
        </div>
        {sub && <p className="text-muted mt-0.5 text-xs leading-relaxed">{sub}</p>}
      </div>
      <div className="flex min-w-0 items-center gap-2 sm:justify-end">{children}</div>
    </div>
  );
}

/** Full-width row for editors that need the whole panel width. */
function SettingBlock({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 py-4">
      <div className="min-w-0">
        <p className="text-heading text-sm font-medium">{label}</p>
        {sub && <p className="text-muted mt-0.5 text-xs leading-relaxed">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({
  set,
  labelSet,
  labelUnset,
}: {
  set: boolean;
  labelSet: string;
  labelUnset: string;
}) {
  return set ? (
    <span className="bg-ember/10 text-ember rounded-full px-2 py-0.5 text-[10px] font-medium">
      {labelSet}
    </span>
  ) : (
    <span className="bg-bdr text-muted rounded-full px-2 py-0.5 text-[10px] font-medium">
      {labelUnset}
    </span>
  );
}

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
          "w-full font-mono tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          unit ? "pr-28" : "pr-16",
          className,
        )}
        {...props}
      />
      {unit && (
        <span className="text-muted/60 pointer-events-none absolute right-16 top-1/2 -translate-y-1/2 text-[10px]">
          {unit}
        </span>
      )}
      <div className="border-bdr/70 bg-panel/80 absolute right-1.5 top-1/2 grid h-6 -translate-y-1/2 grid-cols-2 overflow-hidden rounded border opacity-40 shadow-[0_6px_16px_rgba(0,0,0,0.18)] transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => changeBy(-1)}
          disabled={props.disabled}
          className="hover:bg-white/7 text-muted hover:text-heading border-bdr/60 flex w-6 items-center justify-center border-r transition-colors disabled:opacity-30"
          aria-label="Decrease"
        >
          <Minus size={10} />
        </button>
        <button
          type="button"
          onClick={() => changeBy(1)}
          disabled={props.disabled}
          className="hover:bg-white/7 text-muted hover:text-heading flex w-6 items-center justify-center transition-colors disabled:opacity-30"
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
        className="text-muted hover:text-heading absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
        onClick={onToggle}
        aria-label={shown ? "Hide" : "Show"}
      >
        {shown ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
    </div>
  );
}

function StatusTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "ember",
}: {
  icon: SettingsIcon;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "ember" | "upstream" | "warn" | "muted";
}) {
  const toneClass = {
    ember: "text-ember bg-ember/10 border-ember/15",
    upstream: "text-upstream bg-upstream/10 border-upstream/15",
    warn: "text-warn bg-warn/10 border-warn/20",
    muted: "text-muted bg-white/5 border-bdr/70",
  }[tone];

  return (
    <div className="control-surface border-bdr/75 rounded-xs border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-muted font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
          {label}
        </p>
        <span className={cn("rounded-xs border p-1.5", toneClass)}>
          <Icon size={13} />
        </span>
      </div>
      <p className="text-heading text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-muted mt-1 truncate text-[11px]">{sub}</p>}
    </div>
  );
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        sub={settings.storage?.backend ?? "storage"}
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

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-muted block text-[10px] uppercase tracking-wider">{children}</span>;
}

function RestartBadge() {
  const { t } = useTranslation();
  return (
    <span className="bg-warn/10 text-warn flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
      <AlertTriangle size={9} /> {t("settings.requires_restart")}
    </span>
  );
}

// ── Upstream resolvers ────────────────────────────────────────────────────────

const UPSTREAM_TYPES = ["plain", "tls", "https", "quic"] as const;

function TypeSegments({ value, onChange }: { value: string; onChange: (type: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="border-bdr/80 rounded-xs flex w-fit overflow-hidden border">
      {UPSTREAM_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={cn(
            "border-bdr/60 not-last:border-r px-2.5 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] transition-colors",
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
          className="control-surface-muted border-bdr/70 rounded-xs border p-3"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-ember font-mono text-[11px] font-semibold tabular-nums">
                #{index + 1}
              </span>
              <TypeSegments value={item.type} onChange={(type) => update(index, { type })} />
            </div>
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={value.length <= 1}
              className="text-muted hover:text-blocked transition-colors disabled:opacity-30"
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
        <span className="text-muted/70 font-mono text-[10px] uppercase tracking-[0.12em]">
          {t("settings.quick_add")}:
        </span>
        {UPSTREAM_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange([...value, { ...preset.draft }])}
            className="border-bdr/80 text-muted hover:border-ember/40 hover:text-ember rounded-xs border px-2 py-1 font-mono text-[10px] transition-colors"
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

  function update(index: number, patch: Partial<ZoneDraft>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="w-full space-y-2">
      {value.length === 0 ? (
        <p className="border-bdr/70 bg-sidebar/60 text-muted rounded-xs border px-3 py-3 text-xs">
          {t("settings.zones_empty")}
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="text-muted grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)_1.5rem] items-center gap-2 px-1">
            <FieldLabel>{t("settings.zone_name")}</FieldLabel>
            <span />
            <FieldLabel>{t("settings.zone_upstream")}</FieldLabel>
            <span />
          </div>
          {value.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)_1.5rem] items-center gap-2"
            >
              <Input
                value={item.name}
                onChange={(e) => update(index, { name: e.target.value })}
                placeholder="lan.home.arpa"
                className="w-full font-mono"
              />
              <MoveRight size={13} className="text-ember/70 justify-self-center" />
              <Input
                value={item.upstream}
                onChange={(e) => update(index, { upstream: e.target.value })}
                placeholder="192.168.1.1:53"
                className="w-full font-mono"
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                className="text-muted hover:text-blocked justify-self-center transition-colors"
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
        onClick={() =>
          onChange([...value, { name: "1.168.192.in-addr.arpa", upstream: "192.168.1.1:53" }])
        }
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
      <p className="text-ember mb-1.5 text-xs font-medium">{title}</p>
      <div className="border-bdr space-y-1 border-l pl-2">
        {entries.map(([k, v]) => (
          <div key={String(k)} className="flex justify-between gap-4 text-xs">
            <span className="text-muted shrink-0 font-mono">{String(k)}</span>
            <span className="text-body truncate text-right font-mono">{formatConfigValue(v)}</span>
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
          <span className="text-heading block text-sm font-semibold">
            {t("settings.current_config")}
          </span>
          <span className="text-muted mt-0.5 block text-xs">
            {t("settings.current_config_sub")}
          </span>
        </span>
        {open ? (
          <ChevronUp size={13} className="text-muted shrink-0" />
        ) : (
          <ChevronDown size={13} className="text-muted shrink-0" />
        )}
      </button>
      {open && (
        <div className="border-bdr/55 max-h-120 overflow-auto border-t px-4 py-4">
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
          <span className="text-muted w-20">{label}</span>
          <span className="text-heading font-mono">{component.current}</span>
          {component.update_available ? (
            <span className="bg-ember/10 text-ember flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
              → {component.latest}
            </span>
          ) : component.blocked ? (
            <span className="bg-upstream/10 text-upstream flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
              {t("settings.update_blocked")} {component.blocked.version}
            </span>
          ) : (
            <span className="text-muted/60">{t("settings.up_to_date")}</span>
          )}
        </div>
        {component.blocked && (
          <p className="text-muted/70 ml-23 text-[11px] leading-relaxed">
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

      {!info && !msg && <p className="text-muted py-4 text-xs">{t("settings.updates_empty")}</p>}

      {msg && <p className="text-upstream py-4 text-xs">{msg}</p>}
    </SettingsPanel>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { t } = useTranslation();
  const toast = useToast();

  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [form, setForm] = useState<HotForm>({
    dns_min_ttl: "",
    dns_max_ttl: "",
    log_retention_days: "",
    web_dir: "",
    api_key: "",
    password: "",
    blocklist_enabled: true,
  });
  const [logIgnore, setLogIgnore] = useState<string[]>([]);
  const [logIgnoreInput, setLogIgnoreInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);

  const [restartForm, setRestartForm] = useState<RestartForm>({
    dns_bind_addr: "",
    dns_cache_size: "",
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

  async function handleSave(e: FormEvent) {
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

  type TextFormField = Exclude<keyof HotForm, "blocklist_enabled">;
  const setF = (key: TextFormField) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));
  type RestartTextField = Exclude<keyof RestartForm, "upstream" | "zones" | "panel_enabled">;
  const setR = (key: RestartTextField) => (e: ChangeEvent<HTMLInputElement>) =>
    setRestartForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="p-6">
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
        <div className="border-warn/30 bg-warn/5 text-warn rounded-xs mb-4 flex items-center gap-2.5 border px-4 py-3 text-xs">
          <RefreshCw size={13} className="shrink-0 animate-spin" />
          {t("settings.restarting")}
        </div>
      )}

      {settings && (
        <form onSubmit={handleSave} className="space-y-4">
          <SettingsOverview settings={settings} apiKeySet={apiKeySet} passwordSet={passwordSet} />

          <Tabs defaultValue="general">
            <TabsList className="flex-wrap">
              <TabsTrigger value="general">{t("settings.general")}</TabsTrigger>
              <TabsTrigger value="resolvers">{t("settings.upstream_resolvers")}</TabsTrigger>
              <TabsTrigger value="network">{t("settings.network")}</TabsTrigger>
              <TabsTrigger value="panel">{t("settings.panel")}</TabsTrigger>
              <TabsTrigger value="access">{t("settings.access")}</TabsTrigger>
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
                    min={60}
                    max={3600}
                    unit="s"
                    value={form.dns_min_ttl}
                    onChange={setF("dns_min_ttl")}
                  />
                </SettingRow>
                <SettingRow label={t("settings.max_ttl")} sub={t("settings.max_ttl_sub")}>
                  <UnitInput
                    type="number"
                    min={60}
                    max={3600}
                    unit="s"
                    value={form.dns_max_ttl}
                    onChange={setF("dns_max_ttl")}
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
                  label={t("settings.log_ignore")}
                  sub={t("settings.log_ignore_sub")}
                  align="start"
                >
                  <div className="w-full space-y-3">
                    <div className="border-bdr/70 bg-sidebar/60 min-h-18 rounded-xs border p-2">
                      {logIgnore.length === 0 ? (
                        <span className="text-muted/60 block px-1 py-1 text-xs italic">
                          {t("settings.no_patterns")}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {logIgnore.map((pattern) => (
                            <span
                              key={pattern}
                              className="border-bdr/80 bg-panel text-body rounded-xs flex max-w-full items-center gap-1.5 border px-2 py-1 font-mono text-[11px]"
                            >
                              <span className="truncate">{pattern}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setLogIgnore((prev) => prev.filter((x) => x !== pattern))
                                }
                                className="text-muted hover:text-blocked shrink-0 transition-colors"
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
            </TabsContent>

            <TabsContent value="system" className="space-y-4 pt-4">
              <UpdatesCard />
              <CollapsibleConfig settings={settings} />
            </TabsContent>
          </Tabs>

          {dirty && (
            <div className="control-surface plate-ticks border-bdr/85 rounded-xs animate-fade-up sticky bottom-4 z-10 flex flex-col gap-3 border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5 text-xs">
                <span className="bg-warn h-1.5 w-1.5 animate-pulse" />
                <span className="text-heading font-medium">{t("settings.unsaved_changes")}</span>
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
    </div>
  );
}
