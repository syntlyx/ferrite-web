import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Download, Lock, QrCode as QrIcon } from "lucide-react";
import { encode } from "uqr";
import { api } from "@/api";
import type { SecureDnsDevice } from "@/api/types";
import { cn, copyToClipboard } from "@/lib/utils";
import { FieldLabel } from "@/components/layout/SettingsPanel";
import { Btn, IconBtn, Skeleton } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";

export function Copyable({ value }: { value: string }) {
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

/** A QR code, black on white in either theme: cameras want the contrast. */
export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const { n, d } = useMemo(() => {
    const { data } = encode(value, { ecc: "M", border: 2 });
    let path = "";
    data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) path += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { n: data.length, d: path };
  }, [value]);
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={value}
      className="shrink-0 rounded-xs"
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/**
 * What to type into a device for `id`: Android's Private DNS name, an Apple
 * profile (on this device, or as a QR code for another), the DNS over HTTPS
 * address. `grid` lays the three side by side where there's room.
 */
export function DeviceHowTo({
  id,
  android,
  doh,
  apple = true,
  grid,
}: {
  id: string;
  android?: string | null;
  doh?: string | null;
  apple?: boolean;
  grid?: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);

  async function link() {
    const { url } = await api.secureDnsProfileLink(id);
    return url;
  }

  async function install() {
    try {
      // A download on a computer; on an iPhone, Safari offers to install it.
      window.location.href = await link();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function toggleQr() {
    if (qr) return setQr(null);
    try {
      setQr(new URL(await link(), window.location.origin).toString());
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className={cn("grid gap-2.5", grid)}>
      {android && (
        <div className="min-w-0 space-y-1">
          <FieldLabel>
            {t("secure.android", { defaultValue: "Android · Settings → Network → Private DNS" })}
          </FieldLabel>
          <Copyable value={android} />
        </div>
      )}
      {apple && (
        <div className="min-w-0 space-y-1">
          <FieldLabel>{t("secure.apple", { defaultValue: "iPhone, iPad, Mac" })}</FieldLabel>
          <div className="flex gap-1.5">
            <Btn
              type="button"
              variant="ghost"
              className="min-w-0 flex-1"
              title={t("secure.apple_hint", {
                defaultValue:
                  "Open this on the device itself; then Settings → Profile Downloaded → Install.",
              })}
              onClick={() => void install()}
            >
              <Download size={12} />{" "}
              {t("secure.apple_profile", { defaultValue: "Install profile" })}
            </Btn>
            <IconBtn
              title={t("secure.qr", { defaultValue: "QR code for another device" })}
              aria-pressed={qr !== null}
              className="px-2.5"
              onClick={() => void toggleQr()}
            >
              <QrIcon size={13} />
            </IconBtn>
          </div>
          {qr && (
            <div className="flex flex-col items-center gap-2.5 rounded-xs border border-bdr/70 bg-void/40 p-4 text-center">
              <div className="rounded-xs bg-white p-2">
                <QrCode value={qr} />
              </div>
              <p className="max-w-64 text-[11px] text-muted">
                {t("secure.qr_hint", {
                  defaultValue:
                    "Point the iPhone's camera at it, at home, and open the link; then Settings → Profile Downloaded → Install. The code works for 15 minutes.",
                })}
              </p>
            </div>
          )}
        </div>
      )}
      {doh && (
        <div className="min-w-0 space-y-1">
          <FieldLabel>
            {t("secure.doh_url", { defaultValue: "Browsers · DNS over HTTPS" })}
          </FieldLabel>
          <Copyable value={doh} />
        </div>
      )}
    </div>
  );
}

/**
 * The device panel's encrypted DNS: the device name this client goes by,
 * or a button to give it one. Nothing at all while encrypted DNS is off.
 */
export function SecureDnsSection({
  name,
  client,
  heading,
}: {
  /** The client's name, or its device name in encrypted DNS. */
  name: string;
  /** The client's key (MAC or IP): the device made is its. */
  client?: string;
  heading: (text: string) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [dev, setDev] = useState<SecureDnsDevice | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDev(undefined);
    api
      .secureDnsDevice(name, client)
      .then((d) => !cancelled && setDev(d))
      .catch(() => !cancelled && setDev(null));
    return () => {
      cancelled = true;
    };
  }, [name, client]);

  if (dev === null || (dev && !dev.enabled)) return null;

  async function make() {
    setBusy(true);
    try {
      setDev(await api.makeSecureDnsDevice(name, client));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {heading(t("secure.title", { defaultValue: "Encrypted DNS" }))}
      {dev === undefined ? (
        <Skeleton className="h-9 w-full" />
      ) : dev.id ? (
        <div className="space-y-2.5">
          <p className="flex items-center gap-1.5 text-xs text-body">
            <Lock size={12} className="shrink-0 text-cached" />
            {t("secure.device_is", {
              id: dev.id,
              defaultValue: "Set up as {{id}}; answered away from home too.",
            })}
          </p>
          <DeviceHowTo id={dev.id} android={dev.android} doh={dev.doh_url} apple={dev.apple} />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted">
            {t("secure.device_none", {
              defaultValue:
                "Not set up. It gets a device name of its own, answered at home and away.",
            })}
          </p>
          <Btn type="button" variant="ghost" disabled={busy} onClick={() => void make()}>
            <Lock size={12} /> {t("secure.device_make", { defaultValue: "Set up encrypted DNS" })}
          </Btn>
        </div>
      )}
    </div>
  );
}
