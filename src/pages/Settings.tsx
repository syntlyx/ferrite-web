import { useEffect, useState, useCallback } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
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
} from "lucide-react";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/layout/Card";
import { Spinner } from "@/components/feedback/Spinner";
import { Err } from "@/components/feedback/Err";
import { Input, Btn, SectionLabel } from "@/components/ui";
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

function SectionHeader({ children, badge }: { children: ReactNode; badge?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="bg-teal h-4 w-0.5 rounded-full" />
      <SectionLabel className="mb-0">{children}</SectionLabel>
      {badge}
    </div>
  );
}

function SettingRow({
  label,
  sub,
  badge,
  children,
}: {
  label: string;
  sub?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-bdr flex items-center justify-between gap-6 border-b py-4 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-heading text-sm font-medium">{label}</p>
          {badge}
        </div>
        {sub && <p className="text-muted mt-0.5 text-xs leading-relaxed">{sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
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
    <Card>
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((p) => !p)}
      >
        <SectionLabel className="mb-0 select-none">{t("settings.current_config")}</SectionLabel>
        {open ? (
          <ChevronUp size={13} className="text-muted shrink-0" />
        ) : (
          <ChevronDown size={13} className="text-muted shrink-0" />
        )}
      </button>
      {open && (
        <div className="max-h-120 mt-4 overflow-auto">
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
    component: { current: string; latest: string; update_available: boolean };
  }) {
    return (
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted w-20">{label}</span>
        <span className="text-heading font-mono">{component.current}</span>
        {component.update_available ? (
          <span className="bg-teal/10 text-teal flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
            → {component.latest}
          </span>
        ) : (
          <span className="text-muted/60">{t("settings.up_to_date")}</span>
        )}
      </div>
    );
  }

  return (
    <Card>
      <SectionHeader>{t("settings.updates")}</SectionHeader>

      {info && (
        <div className="border-bdr bg-sidebar mb-4 space-y-2 rounded-lg border px-4 py-3">
          <VersionRow label={t("settings.server")} component={info.server} />
          <VersionRow label={t("settings.web_ui")} component={info.web} />
        </div>
      )}

      {msg && <p className="text-upstream mb-3 text-xs">{msg}</p>}

      <div className="flex flex-wrap gap-2">
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
    </Card>
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
    if (form.dns_min_ttl !== "") patch.dns_min_ttl = Number(form.dns_min_ttl);
    if (form.dns_max_ttl !== "") patch.dns_max_ttl = Number(form.dns_max_ttl);
    if (form.log_retention_days !== "") patch.log_retention_days = Number(form.log_retention_days);
    if (form.web_dir.trim() !== "") patch.web_dir = form.web_dir.trim();
    if (form.api_key.trim() !== "") patch.api_key = form.api_key.trim();
    if (form.password !== "") patch.password = form.password;
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
      toast(t("settings.settings_saved"));
      setForm((p) => ({ ...p, api_key: "", password: "" }));
      if (patch.api_key) setApiKeySet(true);
      if (patch.password) setPasswordSet(true);
      if (patch.dns_log_ignore) {
        setSettings((current) =>
          current?.dns ? { ...current, dns: { ...current.dns, log_ignore: logIgnore } } : current,
        );
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

  const setF = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));
  const setR = (key: keyof typeof restartForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setRestartForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="p-6">
      <PageHeader title={t("settings.title")} />
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
          {/* ── General ─────────────────────────────────────────────────────── */}
          <Card>
            <SectionHeader>{t("settings.general")}</SectionHeader>
            <form onSubmit={handleHotSave}>
              {/* TTL */}
              <SettingRow label={t("settings.min_ttl")} sub={t("settings.min_ttl_sub")}>
                <Input
                  type="number"
                  min={60}
                  max={3600}
                  value={form.dns_min_ttl}
                  onChange={setF("dns_min_ttl")}
                  className="w-28 text-right font-mono"
                />
              </SettingRow>
              <SettingRow label={t("settings.max_ttl")} sub={t("settings.max_ttl_sub")}>
                <Input
                  type="number"
                  min={60}
                  max={3600}
                  value={form.dns_max_ttl}
                  onChange={setF("dns_max_ttl")}
                  className="w-28 text-right font-mono"
                />
              </SettingRow>
              <SettingRow label={t("settings.log_retention")} sub={t("settings.log_retention_sub")}>
                <Input
                  type="number"
                  value={form.log_retention_days}
                  onChange={setF("log_retention_days")}
                  className="w-28 text-right font-mono"
                />
              </SettingRow>

              {/* API key */}
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
                <button
                  type="button"
                  onClick={() => {
                    const key = generateKey();
                    setForm((p) => ({ ...p, api_key: key }));
                    setShowApiKey(true);
                  }}
                  className="text-muted hover:text-teal flex items-center gap-1.5 text-xs transition-colors"
                  title={t("settings.generate")}
                >
                  <Shuffle size={12} />
                  {t("settings.generate")}
                </button>
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={form.api_key}
                    onChange={setF("api_key")}
                    placeholder={apiKeySet ? "••••••••" : t("settings.api_key_placeholder")}
                    className="w-44 pr-8 font-mono"
                  />
                  <button
                    type="button"
                    className="text-muted hover:text-heading absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                    onClick={() => setShowApiKey((p) => !p)}
                  >
                    {showApiKey ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                {apiKeySet && (
                  <button
                    type="button"
                    onClick={() => clearField("api_key")}
                    className="text-muted hover:text-blocked transition-colors"
                    title={t("settings.api_key_clear_title")}
                  >
                    <X size={13} />
                  </button>
                )}
              </SettingRow>

              {/* Password */}
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
                <div className="relative">
                  <Input
                    type={showPwd ? "text" : "password"}
                    value={form.password}
                    onChange={setF("password")}
                    placeholder={t("settings.password_new_placeholder")}
                    className="w-44 pr-8"
                  />
                  <button
                    type="button"
                    className="text-muted hover:text-heading absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors"
                    onClick={() => setShowPwd((p) => !p)}
                  >
                    {showPwd ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                {passwordSet && (
                  <button
                    type="button"
                    onClick={() => clearField("password")}
                    className="text-muted hover:text-blocked transition-colors"
                    title={t("settings.password_disable_title")}
                  >
                    <X size={13} />
                  </button>
                )}
              </SettingRow>

              {/* Web dir */}
              <SettingRow label={t("settings.web_dir")} sub={t("settings.web_dir_sub")}>
                <Input
                  value={form.web_dir}
                  onChange={setF("web_dir")}
                  placeholder="~/.local/share/ferrite/web"
                  className="w-56 font-mono"
                />
              </SettingRow>

              {/* Log ignore patterns — full-width */}
              <div className="border-bdr border-b py-4 last:border-0">
                <p className="text-heading text-sm font-medium">{t("settings.log_ignore")}</p>
                <p className="text-muted mb-3 mt-0.5 text-xs leading-relaxed">
                  {t("settings.log_ignore_sub")}
                </p>
                <div className="min-h-7 mb-3 flex flex-wrap gap-1.5">
                  {logIgnore.length === 0 ? (
                    <span className="text-muted/60 text-xs italic">
                      {t("settings.no_patterns")}
                    </span>
                  ) : (
                    logIgnore.map((pattern) => (
                      <span
                        key={pattern}
                        className="border-bdr bg-sidebar text-body flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px]"
                      >
                        {pattern}
                        <button
                          type="button"
                          onClick={() => setLogIgnore((prev) => prev.filter((x) => x !== pattern))}
                          className="text-muted hover:text-blocked transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
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
                    className="w-44 font-mono"
                  />
                  <Btn type="button" variant="ghost" onClick={addLogIgnorePattern}>
                    {t("settings.add_pattern")}
                  </Btn>
                </div>
              </div>

              <div className="pt-2">
                <Btn type="submit" disabled={saving}>
                  <Save size={12} /> {t("settings.save")}
                </Btn>
              </div>
            </form>
          </Card>

          {/* ── Network ─────────────────────────────────────────────────────── */}
          <Card>
            <SectionHeader
              badge={
                <span className="bg-warn/10 text-warn flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
                  <AlertTriangle size={9} /> {t("settings.requires_restart")}
                </span>
              }
            >
              {t("settings.network")}
            </SectionHeader>
            <form onSubmit={handleRestartSave}>
              <SettingRow label={t("settings.dns_bind")} sub={t("settings.dns_bind_sub")}>
                <Input
                  value={restartForm.dns_bind_addr}
                  onChange={setR("dns_bind_addr")}
                  placeholder="0.0.0.0:53"
                  className="w-40 font-mono"
                />
              </SettingRow>
              <SettingRow label={t("settings.cache_size")} sub={t("settings.cache_size_sub")}>
                <Input
                  type="number"
                  value={restartForm.dns_cache_size}
                  onChange={setR("dns_cache_size")}
                  className="w-28 text-right font-mono"
                />
              </SettingRow>
              <SettingRow
                label={t("settings.blocklist_cache_size")}
                sub={t("settings.blocklist_cache_size_sub")}
              >
                <Input
                  type="number"
                  min={1}
                  value={restartForm.blocklist_decision_cache_size}
                  onChange={setR("blocklist_decision_cache_size")}
                  className="w-28 text-right font-mono"
                />
              </SettingRow>
              <SettingRow label={t("settings.api_bind")} sub={t("settings.api_bind_sub")}>
                <Input
                  value={restartForm.api_bind_addr}
                  onChange={setR("api_bind_addr")}
                  placeholder="127.0.0.1:8080"
                  className="w-40 font-mono"
                />
              </SettingRow>
              <div className="pt-2">
                <Btn type="submit" disabled={savingRestart || restarting}>
                  <Save size={12} /> {t("settings.save_restart")}
                </Btn>
              </div>
            </form>
          </Card>

          <CollapsibleConfig settings={settings} />
          <UpdatesCard />
        </div>
      )}
    </div>
  );
}
