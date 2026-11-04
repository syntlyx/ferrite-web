import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Lock } from "lucide-react";
import { api } from "@/api";
import { ApiClientError } from "@/api/client";
import type { SetupInfo, SetupResult } from "@/api/types";
import { FerriteMark } from "@/components/layout/Brand";
import { FieldLabel } from "@/components/layout/SettingsPanel";
import { Copyable } from "@/components/SecureDnsDevice";
import { Btn, Input, Skeleton } from "@/components/ui";

const APPLE = /iPhone|iPad|Macintosh/i;

/**
 * `/setup`, opened on a phone at home: sets that device up for encrypted
 * DNS without the panel's password, where the owner lets it (Settings →
 * Encrypted DNS). No sign-in and no app shell around it.
 */
export default function Setup() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [name, setName] = useState("");
  const [done, setDone] = useState<SetupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .setupInfo()
      .then((i) => {
        setInfo(i);
        if (i.state === "ready") setName(i.name ?? "");
      })
      .catch((e) =>
        setInfo(
          e instanceof ApiClientError && e.status === 403 ? { state: "away" } : { state: "off" },
        ),
      );
  }, []);

  async function claim() {
    setBusy(true);
    setError("");
    try {
      setDone(await api.setupClaim(name.trim() || undefined));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const apple = APPLE.test(navigator.userAgent);
  const say = (text: string) => <p className="text-xs leading-relaxed text-body">{text}</p>;

  let body: React.ReactNode;
  if (!info) {
    body = <Skeleton className="h-24 w-full" />;
  } else if (done) {
    const appleBlock = done.profile_url && (
      <div className="space-y-2">
        <FieldLabel>{t("setup.apple", { defaultValue: "iPhone, iPad, Mac" })}</FieldLabel>
        <a
          href={done.profile_url}
          className="flex w-full items-center justify-center gap-1.5 rounded-xs bg-ember px-3 py-2.5 text-xs font-medium text-white"
        >
          <Download size={13} /> {t("setup.install", { defaultValue: "Install the profile" })}
        </a>
        <ol className="list-decimal space-y-1 pl-4 text-[11px] text-muted">
          <li>{t("setup.step_allow", { defaultValue: "Allow the download." })}</li>
          <li>
            {t("setup.step_install", {
              defaultValue: "Settings → Profile Downloaded → Install.",
            })}
          </li>
          <li>
            {t("setup.step_pick", {
              defaultValue: "Settings → General → VPN & Device Management → DNS: pick ferrite.",
            })}
          </li>
        </ol>
      </div>
    );
    const androidBlock = done.android && (
      <div className="space-y-1.5">
        <FieldLabel>
          {t("setup.android", {
            defaultValue: "Android · Settings → Network & internet → Private DNS → hostname",
          })}
        </FieldLabel>
        <Copyable value={done.android} />
      </div>
    );
    body = (
      <div className="space-y-5">
        <p className="flex items-center gap-1.5 text-xs text-heading">
          <Lock size={13} className="shrink-0 text-cached" />
          {t("setup.done", {
            id: done.id,
            defaultValue: "This device is {{id}}. It's answered at home and away.",
          })}
        </p>
        {apple ? (
          <>
            {appleBlock}
            {androidBlock}
          </>
        ) : (
          <>
            {androidBlock}
            {appleBlock}
          </>
        )}
        {done.doh_url && (
          <details className="text-[11px] text-muted">
            <summary className="cursor-pointer">
              {t("setup.other", { defaultValue: "Something else: a browser, a computer" })}
            </summary>
            <div className="mt-2 space-y-1.5">
              <FieldLabel>{t("setup.doh", { defaultValue: "DNS over HTTPS address" })}</FieldLabel>
              <Copyable value={done.doh_url} />
            </div>
          </details>
        )}
      </div>
    );
  } else if (info.state === "away") {
    body = say(
      t("setup.away", {
        defaultValue: "Open this page at home, on the home Wi-Fi.",
      }),
    );
  } else if (info.state === "off") {
    body = say(
      t("setup.off", {
        defaultValue: "Encrypted DNS isn't set up on this network yet.",
      }),
    );
  } else if (info.state === "closed") {
    body = say(
      t("setup.closed", {
        defaultValue:
          "Devices aren't set up here on their own. Ask whoever runs the network to set this one up.",
      }),
    );
  } else if (info.state === "unnamed") {
    body = (
      <div className="space-y-3">
        {say(
          t("setup.unnamed", {
            defaultValue:
              "ferrite doesn't know this device by name yet. Ask whoever runs the network to name it under Clients, then come back here.",
          }),
        )}
        <p className="font-mono text-[11px] text-muted">
          {[info.ip, info.mac].filter(Boolean).join(" · ")}
        </p>
      </div>
    );
  } else if (info.state === "ready") {
    const ask = info.mode === "anyone" && !info.named;
    body = (
      <div className="space-y-4">
        {ask ? (
          <label className="block space-y-1.5">
            <FieldLabel>{t("setup.name", { defaultValue: "What to call this device" })}</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("setup.name_placeholder", { defaultValue: "e.g. Anna's phone" })}
              className="w-full"
              autoComplete="off"
            />
          </label>
        ) : (
          info.name &&
          say(
            t("setup.this_device", {
              name: info.name,
              defaultValue: "This device: {{name}}.",
            }),
          )
        )}
        {info.id &&
          say(
            t("setup.has", {
              id: info.id,
              defaultValue: "It's set up already, as {{id}}. Here are its settings again.",
            }),
          )}
        <Btn
          type="button"
          block
          disabled={busy || (ask && !name.trim())}
          onClick={() => void claim()}
        >
          <Lock size={12} />{" "}
          {info.id
            ? t("setup.again", { defaultValue: "Show its settings" })
            : t("setup.go", { defaultValue: "Set up encrypted DNS" })}
        </Btn>
        {error && <p className="text-xs text-blocked">{error}</p>}
      </div>
    );
  }

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center bg-void p-5">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <FerriteMark className="mb-4 h-12 w-12" />
          <h1 className="text-sm font-medium text-heading">
            {t("setup.title", { defaultValue: "Encrypted DNS for this device" })}
          </h1>
          <p className="mt-1.5 text-[11px] text-muted">
            {t("setup.sub", {
              defaultValue:
                "Your network's filtering, on this device wherever it goes: ads and trackers stay blocked on mobile data too.",
            })}
          </p>
        </div>
        <div className="control-surface space-y-4 rounded-xs border border-bdr/85 p-5">{body}</div>
      </div>
    </div>
  );
}
