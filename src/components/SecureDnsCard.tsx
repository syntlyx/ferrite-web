import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Lock, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { api } from "@/api";
import type { CertSource, SecureDnsSettings, SecureDnsView, SelfSetup } from "@/api/types";
import { relTime } from "@/lib/format";
import { FieldLabel, SettingRow, SettingsPanel } from "@/components/layout/SettingsPanel";
import { Tag } from "@/components/feedback/Badge";
import { Btn, IconBtn, Input, Skeleton, Switch } from "@/components/ui";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/hooks/use-toast";
import { Copyable, DeviceHowTo } from "@/components/SecureDnsDevice";

/** A client ID as the server takes it: one DNS label. */
function toLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function Problem({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <div className="my-4 flex items-start gap-2 rounded-xs border border-warn/35 bg-warn/10 px-3 py-2.5 text-xs text-warn">
      <AlertTriangle size={13} className="mt-px shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

/** The form as edited: the token is typed fresh, never loaded. */
type Form = SecureDnsSettings & { token: string; proxyText: string };

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
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState("");
  const [device, setDevice] = useState("");
  const [busy, setBusy] = useState(false);

  const adopt = useCallback((v: SecureDnsView) => {
    const c = v.config;
    // Nothing set up yet: Let's Encrypt is the easy road, so start there.
    const fresh = !c.enabled && !c.hostname && !c.cert_file && !v.token_set;
    const f: Form = {
      ...c,
      certificate: fresh ? "letsencrypt" : c.certificate,
      cert_file: c.cert_file ?? "",
      key_file: c.key_file ?? "",
      acme: { email: c.acme?.email ?? "", staging: c.acme?.staging ?? false },
      devices: c.devices ?? [],
      token: "",
      proxyText: (c.proxies ?? []).join(", "),
    };
    setView(v);
    setForm(f);
    setSaved(JSON.stringify(f));
  }, []);

  /** Status only: the form being edited stays as it is. */
  const refresh = useCallback(() => {
    api
      .getSecureDns()
      .then((v) => setView(v))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api
      .getSecureDns()
      .then(adopt)
      .catch(() => {});
  }, [adopt]);

  // While a certificate is being fetched, follow along.
  const working = view?.status.acme?.state === "working";
  useEffect(() => {
    if (!working) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [working, refresh]);

  if (!view || !form) return <Skeleton className="h-40 w-full" />;

  const dirty = JSON.stringify(form) !== saved;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const setAcme = (patch: Partial<NonNullable<Form["acme"]>>) =>
    setForm({ ...form, acme: { ...form.acme, ...patch } });
  const st = view.status;
  const on = view.config.enabled;
  const le = form.certificate === "letsencrypt";
  const acme = view.config.certificate === "letsencrypt" ? st.acme : null;
  const host = view.config.hostname;
  const devices = view.config.devices ?? [];
  const newId = toLabel(device);

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      const { token, proxyText, ...rest } = form;
      const v = await api.putSecureDns({
        ...rest,
        proxies: proxyText.split(/[\s,]+/).filter(Boolean),
        cert_file: form.cert_file?.trim() || null,
        key_file: form.key_file?.trim() || null,
        acme: { ...form.acme, cloudflare_token: token.trim() || null },
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

  /** The device list saves at once, apart from the rest of the form. */
  async function saveDevices(next: string[]) {
    if (!view) return;
    setBusy(true);
    try {
      const v = await api.putSecureDns({
        ...view.config,
        acme: { ...view.config.acme, cloudflare_token: null },
        devices: next,
      });
      const list = v.config.devices ?? [];
      setView(v);
      setForm((f) => (f ? { ...f, devices: list } : f));
      setSaved((prev) => JSON.stringify({ ...JSON.parse(prev), devices: list }));
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addDevice() {
    if (!newId || devices.includes(newId)) return;
    if (await saveDevices([...devices, newId])) setDevice("");
  }

  async function retry() {
    try {
      setView(await api.renewSecureDns());
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const listening = (ok: boolean, shared: boolean, err: string | null, port: number) =>
    port === 0 ? (
      <Tag>{t("common.disabled", { defaultValue: "Disabled" })}</Tag>
    ) : ok ? (
      <Tag tone="cached">
        {shared
          ? t("secure.shared", { port, defaultValue: "on {{port}}, shared with Tunnels" })
          : t("secure.listening", { port, defaultValue: "listening on {{port}}" })}
      </Tag>
    ) : (
      <Tag tone="blocked">
        {err ?? t("secure.not_listening", { defaultValue: "not listening" })}
      </Tag>
    );

  const setupUrl = `${window.location.origin}/setup`;
  const selfSetupModes: { value: SelfSetup; label: string }[] = [
    { value: "off", label: t("secure.self_off", { defaultValue: "Off" }) },
    { value: "named", label: t("secure.self_named", { defaultValue: "Named devices" }) },
    { value: "anyone", label: t("secure.self_anyone", { defaultValue: "Anyone at home" }) },
  ];
  const selfSetupHint: Record<SelfSetup, string> = {
    off: t("secure.self_off_hint", {
      defaultValue: "Devices are added here, and profiles handed over from here or from Clients.",
    }),
    named: t("secure.self_named_hint", {
      defaultValue:
        "Only devices you've named in Clients. A guest is told to ask you, and shown its address so you can find it.",
    }),
    anyone: t("secure.self_anyone_hint", {
      defaultValue:
        "Any device on your network, guests too. Remove the ones that shouldn't be in the list below.",
    }),
  };

  const sources: { value: CertSource; label: string }[] = [
    { value: "letsencrypt", label: "Let's Encrypt" },
    { value: "files", label: t("secure.source_files", { defaultValue: "My own files" }) },
  ];

  const stepText = (step: string | null) =>
    step
      ? t(`secure.step.${step.replace(/[^a-z]+/gi, "_")}`, { defaultValue: step })
      : t("secure.step.starting", { defaultValue: "starting" });

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
        sub={
          le
            ? t("secure.cert_le_sub", {
                defaultValue:
                  "ferrite gets it for the name and *.name and renews it, proving the name with a TXT record through Cloudflare. No port has to be open for that.",
              })
            : t("secure.cert_sub", {
                defaultValue:
                  "PEM files on this box, for the name and *.name. Renewals are picked up by themselves.",
              })
        }
        align="start"
      >
        <div className="grid w-full gap-2">
          <Segmented
            value={form.certificate}
            options={sources}
            onChange={(v) => set("certificate", v)}
            ariaLabel={t("secure.cert", { defaultValue: "Certificate" })}
          />
          {le ? (
            <>
              <label className="space-y-1">
                <FieldLabel>
                  {t("secure.cf_token", { defaultValue: "Cloudflare API token" })}
                </FieldLabel>
                <Input
                  type="password"
                  autoComplete="off"
                  value={form.token}
                  onChange={(e) => set("token", e.target.value)}
                  placeholder={
                    view.token_set
                      ? t("secure.cf_token_saved", {
                          defaultValue: "Saved — type a new one to replace it",
                        })
                      : t("secure.cf_token_placeholder", {
                          defaultValue: "Token with “Edit zone DNS” for your zone",
                        })
                  }
                  className="w-full"
                  spellCheck={false}
                />
              </label>
              <p className="text-[11px] text-muted">
                {t("secure.cf_token_help", {
                  defaultValue:
                    "Cloudflare → My Profile → API Tokens → Create token → “Edit zone DNS”, limited to the zone of the name.",
                })}
              </p>
              <label className="space-y-1">
                <FieldLabel>
                  {t("secure.email", { defaultValue: "Email for Let's Encrypt (optional)" })}
                </FieldLabel>
                <Input
                  type="email"
                  value={form.acme?.email ?? ""}
                  onChange={(e) => setAcme({ email: e.target.value })}
                  placeholder="you@example.com"
                  className="w-full"
                  spellCheck={false}
                />
              </label>
              <label className="flex items-center justify-between gap-3 pt-1">
                <span className="min-w-0">
                  <span className="block text-xs text-heading">
                    {t("secure.staging", { defaultValue: "Test certificates" })}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {t("secure.staging_sub", {
                      defaultValue:
                        "Let's Encrypt's staging service, for trying the setup out. Devices won't trust these.",
                    })}
                  </span>
                </span>
                <Switch
                  checked={form.acme?.staging ?? false}
                  onCheckedChange={(v) => setAcme({ staging: v })}
                />
              </label>
            </>
          ) : (
            <>
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
            </>
          )}
          {on && acme?.state === "working" && (
            <p className="flex items-center gap-1.5 text-[11px] text-heading">
              <RefreshCw size={11} className="animate-spin text-ember" />
              {t("secure.acme_working", {
                step: stepText(acme.step),
                defaultValue: "Getting the certificate: {{step}}…",
              })}
            </p>
          )}
          {on && acme?.state === "error" && acme.error && (
            <Problem
              action={
                <button
                  type="button"
                  onClick={() => void retry()}
                  className="shrink-0 font-medium underline-offset-2 hover:underline"
                >
                  {t("secure.retry", { defaultValue: "Try again" })}
                </button>
              }
            >
              {acme.next
                ? t("secure.acme_error", {
                    error: acme.error,
                    when: relTime(acme.next, i18n.language),
                    defaultValue: "{{error}}. Next try {{when}}.",
                  })
                : acme.error}
            </Problem>
          )}
          {st.cert && (
            <p className="text-[11px] text-muted">
              {st.cert.names.join(", ")} · {st.cert.issuer} ·{" "}
              {t("secure.cert_expires", {
                when: relTime(st.cert.not_after, i18n.language),
                defaultValue: "expires {{when}}",
              })}
              {acme?.state === "ok" && acme.next
                ? ` · ${t("secure.renews", {
                    when: relTime(acme.next, i18n.language),
                    defaultValue: "renews {{when}}",
                  })}`
                : ""}
            </p>
          )}
        </div>
      </SettingRow>
      <SettingRow
        label={t("secure.ports", { defaultValue: "Ports" })}
        sub={t("secure.ports_sub", {
          defaultValue:
            "Android needs DNS over TLS on 853. DNS over HTTPS can share 443 with Tunnels. 0 switches one off.",
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
              <div>{listening(st.dot, st.dot_shared, st.dot_error, view.config.dot_port)}</div>
              <div>{listening(st.doh, st.doh_shared, st.doh_error, view.config.doh_port)}</div>
            </>
          )}
        </div>
      </SettingRow>
      {form.doh_port !== 0 && (
        <SettingRow
          label={t("secure.http3", { defaultValue: "DNS over HTTP/3" })}
          sub={t("secure.http3_sub", {
            port: form.doh_port,
            defaultValue:
              "QUIC on UDP {{port}}: quicker on a poor mobile network, and devices move to it on their own. Away from home the router has to send UDP {{port}} straight here — a reverse proxy can't pass QUIC on.",
          })}
          align="start"
        >
          <div className="flex flex-col items-end gap-1.5">
            <Switch checked={form.http3 ?? true} onCheckedChange={(v) => set("http3", v)} />
            {on &&
              (view.config.http3 ?? true) &&
              (st.doh3 ? (
                <Tag tone="cached">
                  {t("secure.http3_on", {
                    port: view.config.doh_port,
                    defaultValue: "listening on {{port}}/udp",
                  })}
                </Tag>
              ) : (
                st.doh3_error && <Tag tone="blocked">{st.doh3_error}</Tag>
              ))}
          </div>
        </SettingRow>
      )}
      {(form.doh_port !== 0 || form.proxyText !== "") && (
        <SettingRow
          label={t("secure.proxies", { defaultValue: "Reverse proxy" })}
          sub={t("secure.proxies_sub", {
            defaultValue:
              "A proxy in front of this box (Nginx Proxy Manager, nginx, Caddy): its address. Then the client it names counts — in X-Real-IP, or a PROXY protocol header for connections it passes on whole — so a phone behind it is still away from home. DNS over TLS on 853 has to come here directly.",
          })}
        >
          <Input
            value={form.proxyText}
            onChange={(e) => set("proxyText", e.target.value)}
            placeholder="192.168.1.5"
            className="w-full font-mono"
            spellCheck={false}
          />
        </SettingRow>
      )}
      <SettingRow
        label={t("secure.self_setup", { defaultValue: "Setting up without the password" })}
        sub={t("secure.self_setup_sub", {
          defaultValue:
            "A device at home opens {{url}} and sets itself up: it gets a device name of its own and its profile. You're told through Notifications.",
          url: setupUrl,
        })}
        align="start"
      >
        <div className="w-full space-y-1.5">
          <Segmented
            value={form.self_setup ?? "named"}
            options={selfSetupModes}
            onChange={(v) => set("self_setup", v)}
            ariaLabel={t("secure.self_setup", { defaultValue: "Setting up without the password" })}
          />
          <p className="text-[11px] text-muted">{selfSetupHint[form.self_setup ?? "named"]}</p>
          {on && (form.self_setup ?? "named") !== "off" && <Copyable value={setupUrl} />}
        </div>
      </SettingRow>

      {on && host && (st.dot || st.doh) && (
        <div
          className="space-y-3 py-4"
          data-search={t("secure.devices", { defaultValue: "Devices" })}
        >
          <div>
            <p className="text-sm font-medium text-heading">
              {t("secure.devices", { defaultValue: "Devices" })}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {t("secure.devices_sub", {
                defaultValue:
                  "Each one shows up under its name in Clients and can have its own profile. Away from home only these devices are answered; at home every device is.",
              })}
            </p>
          </div>

          {devices.length === 0 ? (
            <p className="text-xs text-muted">
              {t("secure.devices_empty", {
                defaultValue: "No devices yet. Add one to use encrypted DNS away from home.",
              })}
            </p>
          ) : (
            <ul className="divide-y divide-bdr rounded-lg border border-bdr">
              {devices.map((d) => {
                const dot = view.setup.dot_host ? `${d}.${view.setup.dot_host}` : null;
                const doh = view.setup.doh_url ? `${view.setup.doh_url}/${d}` : null;
                return (
                  <li key={d} className="space-y-2.5 p-3">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-heading">
                        {d}
                      </span>
                      <IconBtn
                        danger
                        title={t("secure.device_remove", { defaultValue: "Remove" })}
                        disabled={busy}
                        onClick={() => void saveDevices(devices.filter((x) => x !== d))}
                      >
                        <Trash2 size={13} />
                      </IconBtn>
                    </div>
                    <DeviceHowTo id={d} android={dot} doh={doh} grid="lg:grid-cols-3" />
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex gap-2">
            <Input
              value={device}
              onChange={(e) => setDevice(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addDevice();
                }
              }}
              placeholder={t("secure.device_placeholder", {
                defaultValue: "Device name, e.g. pixel",
              })}
              className="w-full sm:w-72"
            />
            <Btn
              type="button"
              variant="ghost"
              disabled={busy || !newId || devices.includes(newId)}
              onClick={() => void addDevice()}
            >
              <Plus size={12} /> {t("secure.device_add", { defaultValue: "Add" })}
            </Btn>
          </div>
          {device && newId && newId !== device.trim() && (
            <p className="text-[11px] text-muted">
              {t("secure.device_as", {
                id: newId,
                defaultValue: "Added as {{id}}: letters, digits and dashes.",
              })}
            </p>
          )}

          {st.turned_away > 0 && st.last_turned_away && (
            <p className="text-[11px] text-muted">
              {st.last_turned_away.device
                ? t("secure.turned_away_named", {
                    count: st.turned_away,
                    device: st.last_turned_away.device,
                    when: relTime(st.last_turned_away.at, i18n.language),
                    defaultValue:
                      "Not answered outside home: {{count}}. The last, {{when}}, came as “{{device}}”, which isn't on the list.",
                  })
                : t("secure.turned_away_unnamed", {
                    count: st.turned_away,
                    when: relTime(st.last_turned_away.at, i18n.language),
                    defaultValue:
                      "Not answered outside home: {{count}}. The last, {{when}}, came with no device name.",
                  })}
            </p>
          )}
        </div>
      )}
    </SettingsPanel>
  );
}
