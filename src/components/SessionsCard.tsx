import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, Monitor, MonitorSmartphone, Smartphone, X } from "lucide-react";
import { api } from "@/api";
import type { PanelSession } from "@/api/types";
import { describeAgent, relTime } from "@/lib/format";
import { SettingsPanel } from "@/components/layout/SettingsPanel";
import { Btn, IconBtn, Skeleton } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";

/**
 * The browsers signed in to the panel, with a way to sign any of them out —
 * or every one but this. It sits inside the Settings form, so every button
 * here is `type="button"`. Only meaningful with a password; sessions live seven
 * days since last use and survive restarts, so this is how a lost phone or a
 * borrowed laptop stops being signed in.
 */
export function SessionsCard() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<PanelSession[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .sessions()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useEffect(load, [load]);

  async function signOut(s: PanelSession) {
    setBusy(s.id);
    try {
      if (s.current) {
        await api.logout();
        window.location.reload();
        return;
      }
      await api.revokeSession(s.id);
      toast(t("sessions.signed_out", { defaultValue: "Signed out" }));
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function signOutOthers() {
    setBusy("others");
    try {
      const { removed } = await api.revokeOtherSessions();
      toast(
        t("sessions.others_signed_out", {
          count: removed,
          defaultValue: "Signed out {{count}} other session(s)",
        }),
      );
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  const others = (rows ?? []).filter((s) => !s.current).length;

  return (
    <SettingsPanel
      icon={MonitorSmartphone}
      title={t("sessions.title", { defaultValue: "Signed-in browsers" })}
      sub={t("sessions.sub", {
        defaultValue:
          "Where the panel is signed in. A session lasts 7 days since it was last used and survives restarts and updates.",
      })}
      footer={
        others > 0 ? (
          <div className="flex justify-end">
            <Btn
              type="button"
              variant="ghost"
              onClick={() => void signOutOthers()}
              disabled={busy !== null}
            >
              <LogOut size={12} />{" "}
              {t("sessions.sign_out_others", { defaultValue: "Sign out all others" })}
            </Btn>
          </div>
        ) : undefined
      }
    >
      {!rows ? (
        <Skeleton className="my-3 h-16 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-3 text-xs text-muted">
          {t("sessions.none", {
            defaultValue: "No browser is signed in with the password — only the API key is used.",
          })}
        </p>
      ) : (
        <ul className="divide-y divide-bdr/40">
          {rows.map((s) => {
            const { browser, os, mobile } = describeAgent(s.agent);
            const Icon = mobile ? Smartphone : Monitor;
            const what =
              browser && os
                ? t("sessions.browser_on", {
                    browser,
                    os,
                    defaultValue: "{{browser}} on {{os}}",
                  })
                : browser || os || t("sessions.unknown", { defaultValue: "Unknown browser" });
            const where = s.device ? `${s.device} · ${s.ip}` : s.ip;
            return (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <Icon size={16} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-heading">
                    {what}
                    {s.current && (
                      <span className="rounded-xs border border-cached/25 bg-cached/10 px-1.5 py-px font-mono text-[10px] text-cached">
                        {t("sessions.this", { defaultValue: "This browser" })}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    {[
                      where,
                      s.created
                        ? t("sessions.signed_in", {
                            when: relTime(s.created, i18n.language),
                            defaultValue: "signed in {{when}}",
                          })
                        : null,
                      s.last_seen && !s.current && s.last_seen - s.created >= 60
                        ? t("sessions.active", {
                            when: relTime(s.last_seen, i18n.language),
                            defaultValue: "active {{when}}",
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <IconBtn
                  type="button"
                  onClick={() => void signOut(s)}
                  disabled={busy !== null}
                  title={
                    s.current
                      ? t("sessions.sign_out_here", { defaultValue: "Sign out here" })
                      : t("sessions.sign_out", { defaultValue: "Sign out" })
                  }
                >
                  {s.current ? <LogOut size={13} /> : <X size={13} />}
                </IconBtn>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsPanel>
  );
}
