import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Check, Copy, TriangleAlert } from "lucide-react";
import { api } from "@/api";
import type { McpSettings } from "@/api/types";
import { copyToClipboard } from "@/lib/utils";
import { SettingsPanel, SettingRow } from "@/components/layout/SettingsPanel";
import { Skeleton, Switch } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";

/** A copyable one-liner. */
function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2 rounded-xs border border-bdr/70 bg-void/30 px-2.5 py-2">
      <code className="min-w-0 flex-1 font-mono text-[11px] leading-relaxed break-all text-body">
        {text}
      </code>
      <button
        type="button"
        onClick={() =>
          void copyToClipboard(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
        className="shrink-0 pt-0.5 text-muted transition-colors hover:text-ember"
        title="Copy"
      >
        {copied ? <Check size={12} className="text-ember" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

/**
 * The MCP endpoint for AI assistants: on/off, whether it may change things,
 * and how to connect one. Toggles apply at once; it sits inside the Settings
 * form, so nothing here submits it.
 */
export function McpCard({ apiKeySet }: { apiKeySet: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [value, setValue] = useState<McpSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getMcpSettings()
      .then(setValue)
      .catch(() => setValue({ enabled: false, allow_changes: false }));
  }, []);

  async function change(next: McpSettings) {
    const prev = value;
    setValue(next);
    setBusy(true);
    try {
      await api.putMcpSettings(next);
    } catch (e) {
      setValue(prev);
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!value) return <Skeleton className="h-40 w-full" />;

  const url = `${window.location.origin}/api/mcp`;
  const command = `claude mcp add --transport http ferrite ${url} --header "Authorization: Bearer <API key>"`;

  return (
    <SettingsPanel
      icon={Bot}
      title={t("mcp.title", { defaultValue: "AI assistants (MCP)" })}
      sub={t("mcp.sub", {
        defaultValue:
          "Lets an assistant such as Claude ask ferrite why a site is blocked, what a device looked up, or how the tunnels are doing — over the Model Context Protocol.",
      })}
    >
      <SettingRow
        label={t("mcp.enabled", { defaultValue: "Allow assistants to connect" })}
        sub={t("mcp.enabled_sub", {
          defaultValue:
            "They sign in with the API key and can read the query log, devices and settings.",
        })}
      >
        <Switch
          checked={value.enabled}
          disabled={busy}
          onCheckedChange={(v) => void change({ ...value, enabled: v })}
        />
      </SettingRow>
      <SettingRow
        label={t("mcp.allow_changes", { defaultValue: "Allow changes" })}
        sub={t("mcp.allow_changes_sub", {
          defaultValue:
            "Also let them block or allow domains, block services, pause filtering and refresh lists. Off: they can look but not touch.",
        })}
      >
        <Switch
          checked={value.allow_changes}
          disabled={busy || !value.enabled}
          onCheckedChange={(v) => void change({ ...value, allow_changes: v })}
        />
      </SettingRow>
      {value.enabled && (
        <div className="space-y-2 py-4">
          {!apiKeySet && (
            <p className="flex items-start gap-1.5 text-xs text-warn">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              {t("mcp.no_key", {
                defaultValue:
                  "Set an API key above first — assistants sign in with it. Without one, anyone on the network who finds the endpoint can use it.",
              })}
            </p>
          )}
          <p className="text-[11px] tracking-[0.08em] text-muted uppercase">
            {t("mcp.connect", { defaultValue: "Connect Claude Code" })}
          </p>
          <CopyLine text={command} />
          <p className="text-[11px] text-muted">
            {t("mcp.connect_other", {
              url,
              defaultValue:
                "Other assistants: Streamable HTTP at {{url}}, header Authorization: Bearer <API key>.",
            })}
          </p>
        </div>
      )}
    </SettingsPanel>
  );
}
