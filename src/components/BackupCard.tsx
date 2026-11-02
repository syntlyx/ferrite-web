import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { DatabaseBackup, Download, Upload } from "lucide-react";
import { api } from "@/api";
import { SettingsPanel } from "@/components/layout/SettingsPanel";
import { Btn } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";

/**
 * Download the whole configuration as `config.toml`, or restore one. A restore
 * restarts the service, so the page hands that part back through `onRestored`
 * to show its "restarting…" state and wait for the box to return.
 */
export function BackupCard({
  confirm,
  onRestored,
}: {
  confirm: (message: string) => Promise<boolean>;
  onRestored: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  async function download() {
    setBusy("export");
    try {
      const toml = await api.exportConfig();
      const url = URL.createObjectURL(new Blob([toml], { type: "application/toml" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `ferrite-config-${new Date().toISOString().slice(0, 10)}.toml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function restore(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires a change.
    e.target.value = "";
    if (!file) return;
    const ok = await confirm(
      t("backup.restore_confirm", {
        name: file.name,
        defaultValue:
          "Restore \"{{name}}\"? It replaces the whole configuration and restarts ferrite. The current file is kept as config.toml.bak.",
      }),
    );
    if (!ok) return;
    setBusy("import");
    try {
      await api.importConfig(await file.text());
      toast(t("backup.restored", { defaultValue: "Configuration restored — restarting…" }));
      onRestored();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SettingsPanel
      title={t("backup.title", { defaultValue: "Backup & restore" })}
      sub={t("backup.sub", {
        defaultValue: "The whole configuration as one config.toml — to keep, or to move to another box.",
      })}
      icon={DatabaseBackup}
    >
      <div className="space-y-3 py-4">
        <div className="flex flex-wrap gap-2">
          <Btn variant="ghost" onClick={download} disabled={busy !== null}>
            <Download size={12} />
            {t("backup.download", { defaultValue: "Download config" })}
          </Btn>
          <Btn variant="ghost" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
            <Upload size={12} />
            {busy === "import"
              ? t("backup.restoring", { defaultValue: "Restoring…" })
              : t("backup.restore", { defaultValue: "Restore from file…" })}
          </Btn>
          <input
            ref={fileInput}
            type="file"
            accept=".toml,application/toml,text/plain"
            onChange={restore}
            className="hidden"
          />
        </div>
        <p className="text-muted text-[11px] leading-relaxed">
          {t("backup.secrets_hint", {
            defaultValue:
              "The file holds secrets — the API key, the password hash, WireGuard private keys. Keep it somewhere safe. A restored file brings its own password: log back in with that one.",
          })}
        </p>
      </div>
    </SettingsPanel>
  );
}
