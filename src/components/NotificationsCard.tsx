import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Save, Send } from "lucide-react";
import { api } from "@/api";
import type { NotificationsSettings } from "@/api/types";
import { SettingsPanel, SettingRow } from "@/components/layout/SettingsPanel";
import { Btn, Input, Skeleton, Switch } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";

const EMPTY: NotificationsSettings = { webhook: null, tunnel_alerts: true, new_device: false };

/**
 * The webhook and which events go to it. Self-contained, with its own save —
 * it sits inside the Settings form, so every button here is `type="button"`.
 */
export function NotificationsCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const [value, setValue] = useState<NotificationsSettings | null>(null);
  const [saved, setSaved] = useState<NotificationsSettings>(EMPTY);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);

  useEffect(() => {
    api
      .getNotifications()
      .then((v) => {
        const full = { ...EMPTY, ...v };
        setValue(full);
        setSaved(full);
      })
      .catch(() => setValue(EMPTY));
  }, []);

  if (!value) {
    return <Skeleton className="h-40 w-full" />;
  }

  const webhook = (value.webhook ?? "").trim();
  const dirty =
    webhook !== (saved.webhook ?? "").trim() ||
    value.tunnel_alerts !== saved.tunnel_alerts ||
    value.new_device !== saved.new_device;

  async function save() {
    if (!value) return;
    setBusy("save");
    const next = { ...value, webhook: webhook || null };
    try {
      await api.putNotifications(next);
      setSaved(next);
      setValue(next);
      toast(t("notifications.saved", { defaultValue: "Notifications saved" }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      await api.testNotification(webhook || undefined);
      toast(t("notifications.test_sent", { defaultValue: "Test notification delivered" }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsPanel
      icon={Bell}
      title={t("notifications.title", { defaultValue: "Notifications" })}
      sub={t("notifications.sub", {
        defaultValue:
          "One webhook, sent a JSON event for each kind switched on. Works with ntfy, Home Assistant or anything that accepts a POST.",
      })}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Btn
            type="button"
            variant="ghost"
            onClick={() => void test()}
            disabled={busy !== null || !webhook}
          >
            <Send size={12} /> {t("notifications.test", { defaultValue: "Send test" })}
          </Btn>
          {dirty && (
            <Btn type="button" onClick={() => void save()} disabled={busy !== null}>
              <Save size={12} /> {t("notifications.save", { defaultValue: "Save" })}
            </Btn>
          )}
        </div>
      }
    >
      <>
        <SettingRow
          label={t("notifications.webhook", { defaultValue: "Webhook URL" })}
          sub={t("notifications.webhook_sub", {
            defaultValue: "Blank turns notifications off.",
          })}
        >
          <Input
            value={value.webhook ?? ""}
            onChange={(e) => setValue({ ...value, webhook: e.target.value })}
            placeholder="https://ntfy.sh/my-ferrite"
            className="w-full font-mono"
          />
        </SettingRow>
        <SettingRow
          label={t("notifications.tunnel_alerts", { defaultValue: "Tunnel alerts" })}
          sub={t("notifications.tunnel_alerts_sub", {
            defaultValue: "A tunnel stays down for over a minute, and when it recovers.",
          })}
        >
          <Switch
            checked={value.tunnel_alerts}
            onCheckedChange={(v) => setValue({ ...value, tunnel_alerts: v })}
          />
        </SettingRow>
        <SettingRow
          label={t("notifications.new_device", { defaultValue: "New devices" })}
          sub={t("notifications.new_device_sub", {
            defaultValue:
              "A device the box has never seen joins the network. What is there when ferrite starts doesn't count. Phones that rotate their Wi-Fi address count as new each time.",
          })}
        >
          <Switch
            checked={value.new_device}
            onCheckedChange={(v) => setValue({ ...value, new_device: v })}
          />
        </SettingRow>
      </>
    </SettingsPanel>
  );
}
