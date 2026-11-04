import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Copy, Lock, Save } from "lucide-react";
import { api } from "@/api";
import type { SecureDnsSettings, SecureDnsView } from "@/api/types";
import { cn, copyToClipboard } from "@/lib/utils";
import { relTime } from "@/lib/format";
import { FieldLabel, SettingRow, SettingsPanel } from "@/components/layout/SettingsPanel";
import { Tag } from "@/components/feedback/Badge";
import { Btn, Input, Skeleton, Switch } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";

/** A client ID as the server takes it: one DNS label. */
function toLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function Copyable({ value }: { value: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-bdr bg-void/50 px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-heading">{value}</code>
      <button
        type="button"
        title={t("common.copy", { defaultValue: "Copy" })}
        onClick={() =>
          void copyToClipboard(value).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          })
        }
        className="shrink-0 text-muted transition-colors hover:text-ember"
      >
        {done ? <Check size={13} className="text-cached" /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function Problem({ children }: { children: string }) {
  return (
    <div className="my-4 flex items-start gap-2 rounded-xs border border-warn/35 bg-warn/10 px-3 py-2.5 text-xs text-warn">
      <AlertTriangle size={13} className="mt-px shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/**
 * DNS over TLS / HTTPS for devices: the name and certificate, the ports, what
 * the listeners are doing, and what to type into a phone — with the device's
 * own client ID, so it is known by name wherever it connects from.
 * It sits inside the Settings form, so every button here is `type="button"`.
 */
export function SecureDnsCard() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [view, setView] = useState<SecureDnsView | null>(null);
  const [form, setForm] = useState<SecureDnsSettings | null>(null);
  const [saved, setSaved] = useState("");
  const [device, setDevice] = useState("");
  const [busy, setBusy] = useState(false);

  const adopt = useCallback((v: SecureDnsView) => {
    const f = {
      ...v.config,
      cert_file: v.config.cert_file ?? "",
      key_file: v.config.key_file ?? "",
    };
    setView(v);
    setForm(f);
    setSaved(JSON.stringify(f));
  }, []);

  useEffect(() => {
    api
      .getSecureDns()
      .then(adopt)
      .catch(() => {});
  }, [adopt]);

  if (!view || !form) return <Skeleton className="h-40 w-full" />;

  const dirty = JSON.stringify(form) !== saved;
  const set = <K extends keyof SecureDnsSettings>(k: K, v: SecureDnsSettings[K]) =>
    setForm({ ...form, [k]: v });
  const st = view.status;
  const on = view.config.enabled;
  const id = toLabel(device);
  const host = view.config.hostname;
  const dotHost = view.setup.dot_host
    ? id
      ? `${id}.${view.setup.dot_host}`
      : view.setup.dot_host
    : null;
  const dohUrl = view.setup.doh_url
    ? id
      ? `${view.setup.doh_url}/${id}`
      : view.setup.doh_url
    : null;

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      const v = await api.putSecureDns({
        ...form,
        cert_file: form.cert_file?.trim() || null,
        key_file: form.key_file?.trim() || null,
      });
      adopt(v);
      if (v.config.enabled && v.status.error) toast(v.status.error, "error");
      else toast(t("secure.saved", { defaultValue: "Saved and applied" }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const listening = (ok: boolean, err: string | null, port: number) =>
    port === 0 ? (
      <Tag>{t("common.disabled", { defaultValue: "Disabled" })}</Tag>
    ) : ok ? (
      <Tag tone="cached">
        {t("secure.listening", { port, defaultValue: "listening on {{port}}" })}
      </Tag>
    ) : (
      <Tag tone="blocked">
        {err ?? t("secure.not_listening", { defaultValue: "not listening" })}
      </Tag>
    );

  return (
    <SettingsPanel
      title={t("secure.title", { defaultValue: "Encrypted DNS" })}
      sub={t("secure.sub", {
        defaultValue:
          "DNS over TLS for Android's Private DNS, DNS over HTTPS for iPhones and browsers. A device can carry its own name, and is that device wherever it connects from.",
      })}
      icon={Lock}
      footer={
        dirty && (
          <div className="flex justify-end">
            <Btn type="button" onClick={() => void save()} disabled={busy}>
              <Save size={12} /> {t("secure.save", { defaultValue: "Save and apply" })}
            </Btn>
          </div>
        )
      }
    >
      {on && st.error && <Problem>{st.error}</Problem>}
      {on && !st.error && st.cert_warning && <Problem>{st.cert_warning}</Problem>}
      <SettingRow
        label={t("secure.enabled", { defaultValue: "Serve encrypted DNS" })}
        sub={t("secure.enabled_sub", {
          defaultValue: "Needs a name of your own and a certificate for it. Applies at once.",
        })}
      >
        <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
      </SettingRow>
      <SettingRow
        label={t("secure.hostname", { defaultValue: "Name" })}
        sub={t("secure.hostname_sub", {
          defaultValue:
            "What devices connect to; it must point at this box. Devices' own names go in front of it.",
        })}
      >
        <Input
          value={form.hostname}
          onChange={(e) => set("hostname", e.target.value)}
          placeholder="dns.example.com"
          className="w-full font-mono"
          spellCheck={false}
        />
      </SettingRow>
      <SettingRow
        label={t("secure.cert", { defaultValue: "Certificate" })}
        sub={t("secure.cert_sub", {
          defaultValue:
            "PEM files on this box, for the name and *.name. Renewals are picked up by themselves.",
        })}
        align="start"
      >
        <div className="grid w-full gap-2">
          <Input
            value={form.cert_file ?? ""}
            onChange={(e) => set("cert_file", e.target.value)}
            placeholder="/etc/letsencrypt/live/…/fullchain.pem"
            className="w-full font-mono"
            spellCheck={false}
          />
          <Input
            value={form.key_file ?? ""}
            onChange={(e) => set("key_file", e.target.value)}
            placeholder="/etc/letsencrypt/live/…/privkey.pem"
            className="w-full font-mono"
            spellCheck={false}
          />
          {st.cert && (
            <p className="text-[11px] text-muted">
              {st.cert.names.join(", ")} ·{" "}
              {t("secure.cert_expires", {
                when: relTime(st.cert.not_after, i18n.language),
                defaultValue: "expires {{when}}",
              })}
            </p>
          )}
        </div>
      </SettingRow>
      <SettingRow
        label={t("secure.ports", { defaultValue: "Ports" })}
        sub={t("secure.ports_sub", {
          defaultValue: "Android needs DNS over TLS on 853. 0 switches one off.",
        })}
        align="start"
      >
        <div className="grid w-full grid-cols-2 gap-2">
          <label className="space-y-1">
            <FieldLabel>{t("secure.dot", { defaultValue: "DNS over TLS" })}</FieldLabel>
            <Input
              type="number"
              min={0}
              max={65535}
              value={form.dot_port}
              onChange={(e) => set("dot_port", Number(e.target.value))}
              className="w-full font-mono"
            />
          </label>
          <label className="space-y-1">
            <FieldLabel>{t("secure.doh", { defaultValue: "DNS over HTTPS" })}</FieldLabel>
            <Input
              type="number"
              min={0}
              max={65535}
              value={form.doh_port}
              onChange={(e) => set("doh_port", Number(e.target.value))}
              className="w-full font-mono"
            />
          </label>
          {on && (
            <>
              <div>{listening(st.dot, st.dot_error, view.config.dot_port)}</div>
              <div>{listening(st.doh, st.doh_error, view.config.doh_port)}</div>
            </>
          )}
        </div>
      </SettingRow>

      {on && host && (st.dot || st.doh) && (
        <div
          className="space-y-3 py-4"
          data-search={t("secure.setup", { defaultValue: "Set up a device" })}
        >
          <div>
            <p className="text-sm font-medium text-heading">
              {t("secure.setup", { defaultValue: "Set up a device" })}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {t("secure.setup_sub", {
                defaultValue:
                  "Give it a name and it shows up under that name in Clients — at home or away — and can have its own profile.",
              })}
            </p>
          </div>
          <Input
            value={device}
            onChange={(e) => setDevice(e.target.value)}
            placeholder={t("secure.device_placeholder", {
              defaultValue: "Device name, e.g. pixel",
            })}
            className={cn("w-full sm:w-72")}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {dotHost && (
              <div className="space-y-1">
                <FieldLabel>
                  {t("secure.android", {
                    defaultValue: "Android · Settings → Network → Private DNS",
                  })}
                </FieldLabel>
                <Copyable value={dotHost} />
              </div>
            )}
            {dohUrl && (
              <div className="space-y-1">
                <FieldLabel>
                  {t("secure.ios", { defaultValue: "iPhone, Mac, browsers · DNS over HTTPS" })}
                </FieldLabel>
                <Copyable value={dohUrl} />
              </div>
            )}
          </div>
        </div>
      )}
    </SettingsPanel>
  );
}
