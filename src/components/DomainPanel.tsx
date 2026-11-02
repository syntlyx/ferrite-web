import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Ban, CheckCircle2, ListFilter, Route, ShieldMinus, ShieldPlus, X } from "lucide-react";
import { api } from "@/api";
import type { DomainCheckResult, QueryEntry } from "@/api/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/feedback/Badge";
import { Btn, IconBtn, Skeleton } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";
import { closeDomainPanel, useDomainPanel } from "@/stores/domain-panel";
import { openDevicePanel } from "@/stores/device-panel";

/** Section heading inside the panel. */
function Heading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">{children}</p>
  );
}

/**
 * Everything about one domain in one place: blocked or not and why, what it is
 * for the device it was seen from, where its traffic goes, who asked for it
 * lately — and the actions that follow from that. Opened from anywhere through
 * `openDomainPanel`; mounted once by the shell.
 */
export function DomainPanel() {
  const target = useDomainPanel();
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [check, setCheck] = useState<DomainCheckResult | null>(null);
  const [recent, setRecent] = useState<QueryEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const domain = target?.domain;
  const client = target?.client;

  useEffect(() => {
    if (!domain) return;
    let cancelled = false;
    setCheck(null);
    api
      .checkDomain(domain, client)
      .then((r) => !cancelled && setCheck(r))
      .catch(() => {});
    api
      .queries({ domain, limit: 25 })
      .then((rows) => !cancelled && setRecent(rows))
      .catch(() => !cancelled && setRecent([]));
    return () => {
      cancelled = true;
    };
  }, [domain, client, version]);

  useEffect(() => {
    if (!domain) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDomainPanel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [domain]);

  // A new domain starts from a clean slate rather than the last one's rows.
  useEffect(() => setRecent(null), [domain]);

  if (!target || !domain) return null;

  const devices = new Set((recent ?? []).map((r) => r.client_name || r.client_ip));
  const mine = check?.for_client;
  const blocked = mine ? mine.blocked : check?.blocked;

  async function act(kind: "block" | "allow") {
    if (!domain) return;
    setBusy(true);
    try {
      if (kind === "block") await api.addBlacklist(domain);
      else await api.addWhitelist(domain);
      toast(
        kind === "block"
          ? t("domain.blocked_toast", {
              domain,
              defaultValue: "{{domain}} blocked for every device",
            })
          : t("domain.allowed_toast", {
              domain,
              defaultValue: "{{domain}} allowed for every device",
            }),
      );
      setVersion((v) => v + 1);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={domain}>
      <button
        type="button"
        aria-label={t("common.close", { defaultValue: "Close" })}
        onClick={closeDomainPanel}
        className="absolute inset-0 bg-void/55 backdrop-blur-[2px]"
      />
      <aside className="control-surface absolute inset-y-0 right-0 flex w-full max-w-md animate-fade-up flex-col border-l border-bdr/85 shadow-[-18px_0_44px_rgba(0,0,0,0.3)]">
        <div className="flex items-start gap-3 border-b border-bdr/60 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
              {t("domain.title", { defaultValue: "Domain" })}
            </p>
            <p className="mt-1 font-mono text-sm break-all text-heading">{domain}</p>
          </div>
          <IconBtn onClick={closeDomainPanel} title={t("common.close", { defaultValue: "Close" })}>
            <X size={14} />
          </IconBtn>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Verdict */}
          {!check ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-xs border px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.08em] uppercase",
                    blocked
                      ? "border-blocked/25 bg-blocked/10 text-blocked"
                      : "border-cached/25 bg-cached/10 text-cached",
                  )}
                >
                  {blocked ? <Ban size={12} /> : <CheckCircle2 size={12} />}
                  {blocked ? t("blocklist.status_blocked") : t("blocklist.status_allowed")}
                </span>
                {mine && (
                  <span className="text-xs text-muted">
                    {t("domain.for_client", {
                      client: mine.client,
                      defaultValue: "for {{client}}",
                    })}
                    {mine.profile &&
                      ` · ${t("domain.profile", { id: mine.profile, defaultValue: "profile {{id}}" })}`}
                  </span>
                )}
              </div>
              {mine?.filtering_off && (
                <p className="text-xs text-warn">
                  {t("domain.filtering_off", {
                    defaultValue:
                      "Filtering is off for this device right now (paused or bypassed).",
                  })}
                </p>
              )}
              {mine?.safe_search_answer && (
                <p className="text-xs text-cached">
                  {t("domain.safe_search", {
                    host: mine.safe_search_answer,
                    defaultValue: "Answered with {{host}} — safe search.",
                  })}
                </p>
              )}
              {mine && mine.blocked !== check.blocked && (
                <p className="text-xs text-muted">
                  {check.blocked
                    ? t("domain.differs_allowed", {
                        defaultValue:
                          "Blocked for other devices; this device's profile lets it through.",
                      })
                    : t("domain.differs_blocked", {
                        defaultValue: "Allowed for other devices; this device's profile blocks it.",
                      })}
                </p>
              )}
            </div>
          )}

          {/* Why */}
          {check && (
            <div>
              <Heading>{t("domain.why", { defaultValue: "Why" })}</Heading>
              {check.whitelist_match && (
                <p className="mb-1.5 text-xs text-cached">
                  {t("domain.allowed_by", {
                    entry: check.whitelist_match.list
                      ? `${check.whitelist_match.entry} (${check.whitelist_match.list})`
                      : check.whitelist_match.entry,
                    defaultValue: "Allowed by {{entry}}",
                  })}
                </p>
              )}
              {(check.sources ?? []).length > 0 ? (
                <ul className="space-y-1">
                  {check.sources!.map((s, i) => (
                    <li
                      key={`${s.kind}-${s.name}-${i}`}
                      className="flex items-baseline gap-2 text-xs"
                    >
                      <span className="w-16 shrink-0 font-mono text-[10px] text-muted/70 uppercase">
                        {s.kind}
                      </span>
                      <span className="min-w-0 break-words text-body">{s.name}</span>
                      {s.matched !== domain && (
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">
                          {s.matched}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                !check.whitelist_match && (
                  <p className="text-xs text-muted">
                    {t("domain.no_match", {
                      defaultValue: "No list, rule or service matches it network-wide.",
                    })}
                  </p>
                )
              )}
            </div>
          )}

          {/* Routing */}
          {check?.routing && (
            <div>
              <Heading>{t("domain.routing", { defaultValue: "Routing" })}</Heading>
              <p className="flex items-center gap-1.5 text-xs text-body">
                <Route size={12} className="shrink-0 text-muted" />
                {check.routing.match
                  ? check.routing.enabled
                    ? t("domain.routed", {
                        egress: check.routing.match.egress,
                        defaultValue: "Through tunnel {{egress}}",
                      }) +
                      (check.routing.match.healthy
                        ? ""
                        : ` · ${t("domain.egress_down", { defaultValue: "down" })}`)
                    : t("domain.routing_off", {
                        defaultValue: "A tunnel rule matches, but routing is off.",
                      })
                  : t("domain.direct", { defaultValue: "Direct — no tunnel rule matches." })}
              </p>
            </div>
          )}

          {/* Recent queries */}
          <div>
            <Heading>
              {t("domain.recent", { defaultValue: "Recent queries" })}
              {recent &&
                recent.length > 0 &&
                ` · ${t("domain.devices", { count: devices.size, defaultValue: "devices: {{count}}" })}`}
            </Heading>
            {!recent ? (
              <Skeleton className="h-24 w-full" />
            ) : recent.length === 0 ? (
              <p className="text-xs text-muted">
                {t("domain.no_recent", { defaultValue: "Nothing in the query log." })}
              </p>
            ) : (
              <ul className="divide-y divide-bdr/40">
                {recent.slice(0, 15).map((r) => (
                  <li key={r.id} className="flex items-center gap-2 py-1.5 text-xs">
                    <span className="w-16 shrink-0 text-muted tabular-nums">
                      {new Date(r.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        openDevicePanel({
                          ips: [r.client_ip],
                          name: r.client_name || undefined,
                        })
                      }
                      className="min-w-0 flex-1 truncate text-left text-body transition-colors hover:text-ember"
                    >
                      {r.client_name || r.client_ip}
                    </button>
                    <Badge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 border-t border-bdr/60 px-5 py-3">
          {check && !check.blocked && (
            <Btn variant="ghost" onClick={() => void act("block")} disabled={busy}>
              <ShieldMinus size={12} /> {t("domain.block", { defaultValue: "Block" })}
            </Btn>
          )}
          {check && check.blocked && (
            <Btn variant="ghost" onClick={() => void act("allow")} disabled={busy}>
              <ShieldPlus size={12} /> {t("domain.allow", { defaultValue: "Allow" })}
            </Btn>
          )}
          <Btn
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              closeDomainPanel();
              navigate(`/queries?domain=${encodeURIComponent(domain)}`);
            }}
          >
            <ListFilter size={12} /> {t("domain.show_in_log", { defaultValue: "Query Log" })}
          </Btn>
        </div>
      </aside>
    </div>
  );
}
