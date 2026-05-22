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
  Plus,
  Clock3,
  Database,
  KeyRound,
  ListFilter,
  RadioTower,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/layout/Card";
import { Spinner } from "@/components/feedback/Spinner";
import { Err } from "@/components/feedback/Err";
import { Input, Btn, Switch } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import type {
  PatchSettingsBody,
  Settings as SettingsType,
  UpdateApplyResponse,
  UpdateCheckResponse,
} from "@/api/types";

type ClearableSecretField = "api_key" | "password";
type RestartSettingsPatch = Pick<
  PatchSettingsBody,
  "dns_bind_addr" | "dns_cache_size" | "blocklist_decision_cache_size" | "api_bind_addr"
>;

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
          <span className="border-teal/15 bg-teal/10 text-teal shrink-0 rounded-md border p-2">
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
    <span className="bg-teal/10 text-teal rounded-full px-2 py-0.5 text-[10px] font-medium">
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
  tone = "teal",
}: {
  icon: SettingsIcon;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "teal" | "upstream" | "warn" | "muted";
}) {
  const toneClass = {
    teal: "text-teal bg-teal/10 border-teal/15",
    upstream: "text-upstream bg-upstream/10 border-upstream/15",
    warn: "text-warn bg-warn/10 border-warn/20",
    muted: "text-muted bg-white/5 border-bdr/70",
  }[tone];

  return (
    <div className="control-surface border-bdr/75 rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-muted text-[10px] font-semibold uppercase tracking-wider">{label}</p>
        <span className={cn("rounded-md border p-1.5", toneClass)}>
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
        tone={passwordSet ? "teal" : "warn"}
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
        tone={blockingEnabled ? "teal" : "warn"}
      />
    </div>
  );
}

// ── Config dump ───────────────────────────────────────────────────────────────

function ConfigSection({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;
  const entries = isPlainObject(value) ? Object.entries(value) : [["value", value]];

  return (
    <div className="mb-3 last:mb-0">
      <p className="text-teal mb-1.5 text-xs font-medium">{title}</p>
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
            <span className="bg-teal/10 text-teal flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
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

  const [form, setForm] = useState({
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

  const [restartForm, setRestartForm] = useState({
    dns_bind_addr: "",
    dns_cache_size: "",
    blocklist_decision_cache_size: "",
    api_bind_addr: "",
  });
  const [savingRestart, setSavingRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const s = await api.getSettings();
      setSettings(s);
      setApiKeySet(s.api?.api_key === "***");
      setPasswordSet(s.api?.password_hash === "***");
      setForm((p) => ({
        ...p,
        dns_min_ttl: String(s.dns?.min_ttl ?? ""),
        dns_max_ttl: String(s.dns?.max_ttl ?? ""),
        log_retention_days: String(s.storage?.log_retention_days ?? ""),
        web_dir: String(s.web_dir ?? ""),
        blocklist_enabled: s.blocklist?.enabled ?? true,
      }));
      setLogIgnore(s.dns?.log_ignore ?? []);
      setRestartForm({
        dns_bind_addr: s.dns?.bind_addr ?? "",
        dns_cache_size: String(s.dns?.cache_size ?? ""),
        blocklist_decision_cache_size: String(s.blocklist?.decision_cache_size ?? ""),
        api_bind_addr: s.api?.bind_addr ?? "",
      });
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
    const attempt = () => {
      api
        .getSettings()
        .then((s) => {
          setRestarting(false);
          setSettings(s);
          setRestartForm({
            dns_bind_addr: s.dns?.bind_addr ?? "",
            dns_cache_size: String(s.dns?.cache_size ?? ""),
            blocklist_decision_cache_size: String(s.blocklist?.decision_cache_size ?? ""),
            api_bind_addr: s.api?.bind_addr ?? "",
          });
          toast(t("settings.restarted"));
        })
        .catch(() => setTimeout(attempt, 2000));
    };
    setTimeout(attempt, 1000);
  }

  function addLogIgnorePattern() {
    const p = logIgnoreInput.trim();
    if (p && !logIgnore.includes(p)) setLogIgnore((prev) => [...prev, p]);
    setLogIgnoreInput("");
  }

  async function handleHotSave(e: FormEvent) {
    e.preventDefault();
    const patch: PatchSettingsBody = {};
    if (form.dns_min_ttl !== "" && Number(form.dns_min_ttl) !== settings?.dns?.min_ttl)
      patch.dns_min_ttl = Number(form.dns_min_ttl);
    if (form.dns_max_ttl !== "" && Number(form.dns_max_ttl) !== settings?.dns?.max_ttl)
      patch.dns_max_ttl = Number(form.dns_max_ttl);
    if (
      form.log_retention_days !== "" &&
      Number(form.log_retention_days) !== settings?.storage?.log_retention_days
    )
      patch.log_retention_days = Number(form.log_retention_days);
    const nextWebDir = form.web_dir.trim();
    const currentWebDir = settings?.web_dir ?? "";
    if (nextWebDir !== currentWebDir) patch.web_dir = nextWebDir === "" ? null : nextWebDir;
    if (form.api_key.trim() !== "") patch.api_key = form.api_key.trim();
    if (form.password !== "") patch.password = form.password;
    if (form.blocklist_enabled !== (settings?.blocklist?.enabled ?? true))
      patch.blocklist_enabled = form.blocklist_enabled;
    const originalIgnore = settings?.dns?.log_ignore ?? [];
    if (JSON.stringify(logIgnore) !== JSON.stringify(originalIgnore))
      patch.dns_log_ignore = logIgnore;
    if (Object.keys(patch).length === 0) {
      toast(t("settings.no_changes"));
      return;
    }
    setSaving(true);
    try {
      await api.patchSettings(patch);
      window.dispatchEvent(new Event("ferrite:settings-changed"));
      toast(t("settings.settings_saved"));
      await loadSettings();
      setForm((p) => ({ ...p, api_key: "", password: "" }));
      if (patch.api_key) setApiKeySet(true);
      if (patch.password) setPasswordSet(true);
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

  async function handleRestartSave(e: FormEvent) {
    e.preventDefault();
    const patch: RestartSettingsPatch = {};
    if (restartForm.dns_bind_addr !== (settings?.dns?.bind_addr ?? ""))
      patch.dns_bind_addr = restartForm.dns_bind_addr;
    if (restartForm.dns_cache_size !== String(settings?.dns?.cache_size ?? ""))
      patch.dns_cache_size = Number(restartForm.dns_cache_size);
    if (
      restartForm.blocklist_decision_cache_size !==
      String(settings?.blocklist?.decision_cache_size ?? "")
    )
      patch.blocklist_decision_cache_size = Number(restartForm.blocklist_decision_cache_size);
    if (restartForm.api_bind_addr !== (settings?.api?.bind_addr ?? ""))
      patch.api_bind_addr = restartForm.api_bind_addr;
    if (Object.keys(patch).length === 0) {
      toast(t("settings.no_changes"));
      return;
    }
    setSavingRestart(true);
    try {
      const res = await api.patchSettings(patch);
      window.dispatchEvent(new Event("ferrite:settings-changed"));
      if (res.restart_required) {
        setRestarting(true);
        pollUntilBack();
      } else {
        toast(t("settings.settings_saved"));
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSavingRestart(false);
    }
  }

  type TextFormField = Exclude<keyof typeof form, "blocklist_enabled">;
  const setF = (key: TextFormField) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));
  const setR = (key: keyof typeof restartForm) => (e: ChangeEvent<HTMLInputElement>) =>
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
        <div className="border-warn/30 bg-warn/5 text-warn mb-4 flex items-center gap-2.5 rounded-xl border px-4 py-3 text-xs">
          <RefreshCw size={13} className="shrink-0 animate-spin" />
          {t("settings.restarting")}
        </div>
      )}

      {settings && (
        <div className="space-y-4">
          <SettingsOverview settings={settings} apiKeySet={apiKeySet} passwordSet={passwordSet} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="space-y-4">
              <form onSubmit={handleHotSave} className="space-y-4">
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
                      <div className="border-bdr/70 bg-sidebar/60 min-h-18 rounded-md border p-2">
                        {logIgnore.length === 0 ? (
                          <span className="text-muted/60 block px-1 py-1 text-xs italic">
                            {t("settings.no_patterns")}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {logIgnore.map((pattern) => (
                              <span
                                key={pattern}
                                className="border-bdr/80 bg-panel text-body flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px]"
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

                <SettingsPanel
                  title={t("settings.access")}
                  sub={t("settings.access_sub")}
                  icon={KeyRound}
                  footer={
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-muted text-xs">{t("settings.live_changes")}</p>
                      <Btn type="submit" disabled={saving}>
                        <Save size={12} /> {t("settings.save")}
                      </Btn>
                    </div>
                  }
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
              </form>

              <form onSubmit={handleRestartSave}>
                <SettingsPanel
                  title={t("settings.network")}
                  sub={t("settings.restart_changes_sub")}
                  icon={RadioTower}
                  badge={
                    <span className="bg-warn/10 text-warn flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
                      <AlertTriangle size={9} /> {t("settings.requires_restart")}
                    </span>
                  }
                  footer={
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-muted text-xs">{t("settings.restart_changes")}</p>
                      <Btn type="submit" disabled={savingRestart || restarting}>
                        <Save size={12} /> {t("settings.save_restart")}
                      </Btn>
                    </div>
                  }
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
              </form>
            </div>

            <div className="space-y-4">
              <UpdatesCard />
              <CollapsibleConfig settings={settings} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
