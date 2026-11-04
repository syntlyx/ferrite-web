import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Radio, Save } from "lucide-react";
import { api } from "@/api";
import type { RelaySettings, RelayView } from "@/api/types";
import { relTime } from "@/lib/format";
import { SettingRow, SettingsPanel } from "@/components/layout/SettingsPanel";
import { Tag } from "@/components/feedback/Badge";
import { Btn, Input, Skeleton, Switch } from "@/components/ui";
import { Copyable } from "@/components/SecureDnsDevice";
import { useToast } from "@/hooks/use-toast";

/**
 * This box reached through a relay: it keeps a connection out to the relay,
 * and devices away from home get to its encrypted DNS through it — no port
 * opened on the router. The relay never sees inside: it passes connections
 * on by the name they ask for. It sits inside the Settings form, so every
 * button here is `type="button"`.
 */
export function RelayCard() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [view, setView] = useState<RelayView | null>(null);
  const [form, setForm] = useState<RelaySettings | null>(null);
  const [busy, setBusy] = useState(false);

  const adopt = (v: RelayView) => {
    setView(v);
    setForm(v.config);
  };

  useEffect(() => {
    api
      .getRelay()
      .then(adopt)
      .catch(() => {});
  }, []);

  // While it's on and not connected yet, follow along.
  const waiting = !!view?.config.enabled && !view.status?.connected;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => {
      api
        .getRelay()
        .then((v) => setView(v))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(id);
  }, [waiting]);

  if (!view || !form) return <Skeleton className="h-40 w-full" />;
  // Until there is a relay to offer, only a box already set up for one (in
  // config.toml) shows the card: an address and a pin of nothing would only
  // puzzle everyone else.
  if (!view.config.enabled && !view.config.server) return null;

  const dirty = JSON.stringify(form) !== JSON.stringify(view.config);
  const st = view.status;

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      adopt(await api.putRelay(form));
      toast(t("relay.saved", { defaultValue: "Saved and applied" }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsPanel
      icon={Radio}
      title={t("relay.title", { defaultValue: "Relay" })}
      sub={t("relay.sub", {
        defaultValue:
          "Devices away from home reach this box's encrypted DNS through a relay, with no port opened on the router. The relay passes connections on by the name they ask for and never sees inside them.",
      })}
      footer={
        dirty && (
          <div className="flex justify-end">
            <Btn type="button" onClick={() => void save()} disabled={busy}>
              <Save size={12} /> {t("relay.save", { defaultValue: "Save and apply" })}
            </Btn>
          </div>
        )
      }
    >
      <SettingRow
        label={t("relay.enabled", { defaultValue: "Connect to a relay" })}
        sub={
          view.config.enabled && st
            ? st.connected
              ? t("relay.connected", {
                  name: st.name ?? "",
                  when: st.since ? relTime(st.since, i18n.language) : "",
                  defaultValue: "Connected as {{name}}, since {{when}}.",
                })
              : t("relay.not_connected", {
                  error: st.error ?? "…",
                  defaultValue: "Not connected: {{error}}",
                })
            : undefined
        }
      >
        <div className="flex items-center gap-2">
          {view.config.enabled &&
            st &&
            (st.connected ? (
              <Tag tone="cached">{t("relay.up", { defaultValue: "connected" })}</Tag>
            ) : (
              <Tag tone="blocked">{t("relay.down", { defaultValue: "not connected" })}</Tag>
            ))}
          <Switch
            checked={form.enabled}
            onCheckedChange={(v) => setForm({ ...form, enabled: v })}
          />
        </div>
      </SettingRow>
      <SettingRow
        label={t("relay.server", { defaultValue: "Relay" })}
        sub={t("relay.server_sub", {
          defaultValue: "Its address for boxes, host:port (UDP).",
        })}
      >
        <Input
          value={form.server}
          onChange={(e) => setForm({ ...form, server: e.target.value })}
          placeholder="relay.example.net:4433"
          className="w-full font-mono"
          spellCheck={false}
        />
      </SettingRow>
      <SettingRow
        label={t("relay.pin", { defaultValue: "Its key" })}
        sub={t("relay.pin_sub", {
          defaultValue:
            "What the box knows the relay by, so nothing else can pose as it. A relay of your own prints it: ferrite-relay pin.",
        })}
      >
        <Input
          value={form.pin}
          onChange={(e) => setForm({ ...form, pin: e.target.value })}
          placeholder="sha256:…"
          className="w-full font-mono"
          spellCheck={false}
        />
      </SettingRow>
      {view.id && (
        <SettingRow
          label={t("relay.id", { defaultValue: "This box's ID" })}
          sub={t("relay.id_sub", {
            defaultValue:
              "What any relay knows this box by: it comes from a key made here that never leaves. Give it to a relay's owner to let the box in.",
          })}
        >
          <Copyable value={view.id} />
        </SettingRow>
      )}
    </SettingsPanel>
  );
}
