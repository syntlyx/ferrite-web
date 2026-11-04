import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Save, Server } from "lucide-react";
import { api } from "@/api";
import type { SyncSection, SyncView } from "@/api/types";
import { cn } from "@/lib/utils";
import { relTime } from "@/lib/format";
import { SettingsPanel, SettingRow } from "@/components/layout/SettingsPanel";
import { Btn, Input, Skeleton } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";

const SECTIONS: SyncSection[] = ["filtering", "records", "devices", "dns", "tunnels"];

/**
 * Make this box a secondary that follows a primary ferrite: the primary's URL
 * and API key, how often, and which parts of its configuration to take. A
 * sync that changes something restarts this box to apply it, so a "sync now"
 * that answers `restarting` hands over to the page's restart wait.
 * It sits inside the Settings form, so every button here is `type="button"`.
 */
export function SyncCard({ onRestarting }: { onRestarting: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [view, setView] = useState<SyncView | null>(null);
  const [primary, setPrimary] = useState("");
  const [key, setKey] = useState("");
  const [minutes, setMinutes] = useState("5");
  const [sections, setSections] = useState<SyncSection[]>([]);
  const [busy, setBusy] = useState<"save" | "now" | null>(null);

  const load = (raw: SyncView) => {
    // Every field defaulted: an older server, or a stand-in API, may leave
    // some out, and one missing string shouldn't take the Settings page down.
    const v: SyncView = {
      ...raw,
      primary: raw.primary ?? "",
      api_key_set: raw.api_key_set ?? false,
      interval: raw.interval ?? 300,
      sections: raw.sections ?? [],
      status: raw.status ?? {
        last_attempt: null,
        last_ok: null,
        last_change: null,
        changed: [],
        error: null,
      },
    };
    setView(v);
    setPrimary(v.primary);
    setKey("");
    setMinutes(String(Math.round(v.interval / 60)));
    setSections(v.sections);
  };

  useEffect(() => {
    api
      .getSync()
      .then(load)
      .catch(() => {});
  }, []);

  if (!view) return <Skeleton className="h-40 w-full" />;

  const dirty =
    primary.trim().replace(/\/+$/, "") !== view.primary ||
    key.trim() !== "" ||
    Number(minutes) * 60 !== view.interval ||
    JSON.stringify([...sections].sort()) !== JSON.stringify([...view.sections].sort());
  const following = view.primary !== "";

  async function save() {
    setBusy("save");
    try {
      const v = await api.putSync({
        primary: primary.trim(),
        ...(key.trim() ? { api_key: key.trim() } : {}),
        interval: Math.max(1, Number(minutes) || 5) * 60,
        sections,
      });
      load(v);
      toast(
        v.primary
          ? t("sync.saved", { defaultValue: "Following {{primary}}", primary: v.primary })
          : t("sync.stopped", { defaultValue: "This box follows nobody now" }),
      );
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function syncNow() {
    setBusy("now");
    try {
      const v = await api.syncNow();
      load(v);
      if (v.restarting) {
        toast(t("sync.applied", { defaultValue: "Changes taken from the primary — restarting…" }));
        onRestarting();
      } else {
        toast(t("sync.same", { defaultValue: "Already the same as the primary" }));
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  const sectionLabel: Record<SyncSection, string> = {
    filtering: t("sync.s_filtering", { defaultValue: "Filtering" }),
    records: t("sync.s_records", { defaultValue: "Local records" }),
    devices: t("sync.s_devices", { defaultValue: "Device names" }),
    dns: t("sync.s_dns", { defaultValue: "DNS settings" }),
    tunnels: t("sync.s_tunnels", { defaultValue: "Tunnels" }),
  };
  const s = view.status;

  return (
    <SettingsPanel
      icon={Server}
      title={t("sync.title", { defaultValue: "Follow another ferrite" })}
      sub={t("sync.sub", {
        defaultValue:
          "Run two resolvers that answer alike: this box takes the chosen parts of a primary's configuration every few minutes, and restarts in place when something changed, without dropping a query. Edit on the primary.",
      })}
      // No footer bar at all until there is something to put in it.
      footer={
        (following || dirty) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {following && (
              <Btn
                type="button"
                variant="ghost"
                onClick={() => void syncNow()}
                disabled={busy !== null}
              >
                <RefreshCw size={12} className={cn(busy === "now" && "animate-spin")} />{" "}
                {t("sync.now", { defaultValue: "Sync now" })}
              </Btn>
            )}
            {dirty && (
              <Btn type="button" onClick={() => void save()} disabled={busy !== null}>
                <Save size={12} /> {t("common.save", { defaultValue: "Save" })}
              </Btn>
            )}
          </div>
        )
      }
    >
      <SettingRow
        label={t("sync.primary", { defaultValue: "Primary" })}
        sub={t("sync.primary_sub", {
          defaultValue: "The primary's panel address. Empty — this box follows nobody.",
        })}
      >
        <Input
          value={primary}
          onChange={(e) => setPrimary(e.target.value)}
          placeholder="http://192.168.1.10"
          className="w-full font-mono"
          spellCheck={false}
        />
      </SettingRow>
      {primary.trim() !== "" && (
        <>
          <SettingRow
            label={t("sync.key", { defaultValue: "Primary's API key" })}
            sub={t("sync.key_sub", {
              defaultValue: "Set one on the primary under Access control.",
            })}
          >
            <Input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={view.api_key_set ? "••••••••" : ""}
              className="w-full font-mono"
              autoComplete="off"
            />
          </SettingRow>
          <SettingRow label={t("sync.every", { defaultValue: "Every" })}>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1440}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="w-20"
              />
              <span className="text-xs text-muted">
                {t("sync.minutes", { defaultValue: "min" })}
              </span>
            </div>
          </SettingRow>
          <SettingRow
            label={t("sync.take", { defaultValue: "Take" })}
            sub={t("sync.take_sub", {
              defaultValue:
                "Tunnels only if this box should route too — one WireGuard key on two boxes makes both tunnels flap.",
            })}
          >
            <div className="flex flex-wrap gap-1.5">
              {SECTIONS.map((sec) => {
                const on = sections.includes(sec);
                return (
                  <button
                    key={sec}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setSections((cur) => (on ? cur.filter((x) => x !== sec) : [...cur, sec]))
                    }
                    className={cn(
                      "rounded-xs border px-2.5 py-1 text-[11px] transition-colors",
                      on
                        ? "border-ember/40 bg-ember/10 text-ember"
                        : "border-bdr/70 text-muted hover:border-ember/40 hover:text-ember",
                    )}
                  >
                    {sectionLabel[sec]}
                  </button>
                );
              })}
            </div>
          </SettingRow>
        </>
      )}
      {following && (
        <p className={cn("py-3 text-[11px]", s.error ? "text-blocked" : "text-muted")}>
          {s.error
            ? t("sync.failed", { defaultValue: "Last try failed: {{error}}", error: s.error })
            : s.last_ok
              ? [
                  t("sync.checked", {
                    defaultValue: "Checked {{when}}",
                    when: relTime(s.last_ok, i18n.language),
                  }),
                  s.last_change
                    ? t("sync.changed", {
                        defaultValue: "last change {{when}} ({{what}})",
                        when: relTime(s.last_change, i18n.language),
                        what: s.changed.join(", "),
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : t("sync.pending", {
                  defaultValue: "Not synced yet — the first sync runs shortly.",
                })}
        </p>
      )}
    </SettingsPanel>
  );
}
