import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bell, Save, Send } from "lucide-react";
import { api } from "@/api";
import type { NotificationsSettings, WebhookFormat } from "@/api/types";
import { cn } from "@/lib/utils";
import { SettingsPanel, SettingRow } from "@/components/layout/SettingsPanel";
import { Btn, Input, Skeleton, Switch } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";

const EMPTY: NotificationsSettings = {
  webhook: null,
  format: "json",
  chat_id: null,
  tunnel_alerts: true,
  new_device: false,
};

const FORMATS: { id: WebhookFormat; label: string; placeholder: string }[] = [
  { id: "ntfy", label: "ntfy", placeholder: "https://ntfy.sh/my-ferrite" },
  { id: "telegram", label: "Telegram", placeholder: "" },
  { id: "discord", label: "Discord", placeholder: "https://discord.com/api/webhooks/…" },
  { id: "slack", label: "Slack", placeholder: "https://hooks.slack.com/services/…" },
  { id: "gotify", label: "Gotify", placeholder: "https://gotify.lan/message?token=…" },
  { id: "json", label: "JSON", placeholder: "http://homeassistant.lan:8123/api/webhook/ferrite" },
];

const TELEGRAM_URL = /^https:\/\/api\.telegram\.org\/bot([^/]+)\/sendMessage$/;

/** The bot token inside a Telegram sendMessage URL. */
function telegramToken(url: string | null | undefined): string {
  return TELEGRAM_URL.exec((url ?? "").trim())?.[1] ?? "";
}

/** The receiver a pasted URL is plainly for, if any. */
function detectFormat(url: string): WebhookFormat | null {
  const u = url.trim().toLowerCase();
  if (u.startsWith("https://ntfy.sh/")) return "ntfy";
  if (/^https:\/\/(\w+\.)?discord(app)?\.com\/api\/webhooks\//.test(u)) return "discord";
  if (u.startsWith("https://hooks.slack.com/")) return "slack";
  if (u.startsWith("https://api.telegram.org/")) return "telegram";
  if (/\/message\?token=/.test(u)) return "gotify";
  return null;
}

/**
 * The webhook, the receiver it talks to, and which events go to it.
 * Self-contained, with its own save — it sits inside the Settings form, so
 * every button here is `type="button"`.
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

  const format = value.format ?? "json";
  const webhook = (value.webhook ?? "").trim();
  const chatId = (value.chat_id ?? "").trim();
  const dirty =
    webhook !== (saved.webhook ?? "").trim() ||
    format !== (saved.format ?? "json") ||
    chatId !== (saved.chat_id ?? "").trim() ||
    value.tunnel_alerts !== saved.tunnel_alerts ||
    value.new_device !== saved.new_device;
  const ready = !!webhook && (format !== "telegram" || !!chatId);
  const current: NotificationsSettings = {
    ...value,
    webhook: webhook || null,
    chat_id: format === "telegram" ? chatId || null : null,
  };

  function pickFormat(next: WebhookFormat) {
    if (!value || next === format) return;
    // A Telegram URL is built from the token; it means nothing to the others,
    // and theirs nothing to it.
    const crossesTelegram = next === "telegram" || format === "telegram";
    setValue({ ...value, format: next, webhook: crossesTelegram ? null : value.webhook });
  }

  function setUrl(url: string) {
    if (!value) return;
    const detected = detectFormat(url);
    setValue({
      ...value,
      webhook: url,
      // A pasted ntfy/Discord/Slack link picks its own format, so nobody gets
      // raw JSON in a chat by leaving the picker alone.
      format: detected && detected !== "telegram" ? detected : value.format,
    });
  }

  async function save() {
    setBusy("save");
    try {
      await api.putNotifications(current);
      setSaved(current);
      setValue(current);
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
      await api.testNotification(current);
      toast(t("notifications.test_sent", { defaultValue: "Test notification delivered" }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  const spec = FORMATS.find((f) => f.id === format) ?? FORMATS[FORMATS.length - 1];
  const hints: Record<WebhookFormat, string> = {
    json: t("notifications.hint_json", {
      defaultValue: "Each event as JSON fields — for Home Assistant, n8n or a script of your own.",
    }),
    ntfy: t("notifications.hint_ntfy", {
      defaultValue: "The topic URL. On your own server with access control, add ?auth=<token>.",
    }),
    discord: t("notifications.hint_discord", {
      defaultValue: "Channel settings → Integrations → Webhooks → Copy Webhook URL.",
    }),
    slack: t("notifications.hint_slack", {
      defaultValue: "An incoming-webhook URL. Mattermost and Rocket.Chat take the same.",
    }),
    telegram: t("notifications.hint_telegram", {
      defaultValue:
        "Create a bot with @BotFather and send it a message first. The chat id is your user id, or a group's id (negative).",
    }),
    gotify: t("notifications.hint_gotify", {
      defaultValue: "Your server's /message URL with an application token.",
    }),
  };

  return (
    <SettingsPanel
      icon={Bell}
      title={t("notifications.title", { defaultValue: "Notifications" })}
      sub={t("notifications.sub_formats", {
        defaultValue:
          "Tunnel outages and new devices, sent where you'll see them — a phone push, a chat, or your own automation.",
      })}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Btn
            type="button"
            variant="ghost"
            onClick={() => void test()}
            disabled={busy !== null || !ready}
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
          label={t("notifications.send_to", { defaultValue: "Send to" })}
          sub={hints[format]}
        >
          <div className="flex flex-wrap gap-1.5" role="radiogroup">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={format === f.id}
                onClick={() => pickFormat(f.id)}
                className={cn(
                  "rounded-xs border px-2.5 py-1 text-[11px] transition-colors",
                  format === f.id
                    ? "border-ember/40 bg-ember/10 text-ember"
                    : "border-bdr/70 text-muted hover:border-ember/40 hover:text-ember",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </SettingRow>
        {format === "telegram" ? (
          <>
            <SettingRow
              label={t("notifications.bot_token", { defaultValue: "Bot token" })}
              sub={t("notifications.webhook_sub", {
                defaultValue: "Blank turns notifications off.",
              })}
            >
              <Input
                value={telegramToken(value.webhook)}
                onChange={(e) => {
                  const token = e.target.value.trim();
                  setValue({
                    ...value,
                    webhook: token ? `https://api.telegram.org/bot${token}/sendMessage` : null,
                  });
                }}
                placeholder="123456789:AA…"
                className="w-full font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </SettingRow>
            <SettingRow label={t("notifications.chat_id", { defaultValue: "Chat id" })}>
              <Input
                value={value.chat_id ?? ""}
                onChange={(e) => setValue({ ...value, chat_id: e.target.value })}
                placeholder="123456789"
                className="w-full font-mono"
                spellCheck={false}
              />
            </SettingRow>
          </>
        ) : (
          <SettingRow
            label={t("notifications.webhook", { defaultValue: "Webhook URL" })}
            sub={t("notifications.webhook_sub", {
              defaultValue: "Blank turns notifications off.",
            })}
          >
            <Input
              value={value.webhook ?? ""}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={spec.placeholder}
              className="w-full font-mono"
              spellCheck={false}
            />
          </SettingRow>
        )}
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
