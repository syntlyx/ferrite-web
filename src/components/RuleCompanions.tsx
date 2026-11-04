import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Radar } from "lucide-react";
import { api } from "@/api";
import type { ProxyCompanions } from "@/api/types";
import { cn } from "@/lib/utils";
import { Btn } from "@/components/ui";
import { Tag } from "@/components/feedback/Badge";
import { useToast } from "@/hooks/use-toast";

/**
 * What else a routed site pulls in — a CDN, a bot check, fonts — found from
 * what devices asked right after opening it, each name tried straight and
 * through the rule's tunnel. The ones that need the tunnel and work through
 * it come ticked; adding them makes rules on the same tunnel.
 */
export function RuleCompanions({
  ruleKey,
  egressName,
  saved,
  existing,
  onAdd,
}: {
  /** The rule's key: its pattern, or `service:<id>`. */
  ruleKey: string;
  egressName: string;
  /** The rule is saved (the server looks it up) and nothing else is pending. */
  saved: boolean;
  /** Patterns that already have a rule. */
  existing: Set<string>;
  onAdd: (sites: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [result, setResult] = useState<ProxyCompanions | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"look" | "add" | null>(null);

  async function look() {
    setBusy("look");
    try {
      const r = await api.proxyCompanions(ruleKey);
      setResult(r);
      setPicked(new Set(r.candidates.filter((c) => c.suggested).map((c) => c.site)));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    setBusy("add");
    try {
      await onAdd([...picked].filter((s) => !existing.has(s)));
      setResult(null);
    } finally {
      setBusy(null);
    }
  }

  const toggle = (site: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(site)) next.delete(site);
      else next.add(site);
      return next;
    });

  const toAdd = [...picked].filter((s) => !existing.has(s));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Btn
          type="button"
          variant="ghost"
          disabled={!saved || busy !== null}
          onClick={() => void look()}
        >
          <Radar size={12} className={cn(busy === "look" && "animate-spin")} />{" "}
          {busy === "look"
            ? t("tunnels.companions_checking", { defaultValue: "Trying each name…" })
            : t("tunnels.companions", { defaultValue: "What else the site pulls in" })}
        </Btn>
        {!saved && (
          <span className="text-[11px] text-muted">
            {t("tunnels.companions_save_first", { defaultValue: "Save the changes first." })}
          </span>
        )}
      </div>

      {result && result.visits === 0 && (
        <p className="text-[11px] text-muted">
          {t("tunnels.companions_no_visits", {
            defaultValue:
              "Nobody has opened it in the last week, or the query log is off. Open the site on a device, then look again.",
          })}
        </p>
      )}
      {result && result.visits > 0 && result.candidates.length === 0 && (
        <p className="text-[11px] text-muted">
          {t("tunnels.companions_none", {
            defaultValue: "Nothing else came up around it: the site seems to need only itself.",
          })}
        </p>
      )}
      {result && result.candidates.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted">
            {t("tunnels.companions_found", {
              count: result.visits,
              defaultValue:
                "Asked by the same devices in the seconds after opening it (visits: {{count}}). Ticked: blocked straight, open through the tunnel.",
            })}
          </p>
          <ul className="divide-y divide-bdr/50 rounded-xs border border-bdr/60">
            {result.candidates.map((c) => {
              const taken = existing.has(c.site);
              return (
                <li key={c.domain} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
                  <input
                    type="checkbox"
                    className="accent-ember"
                    checked={taken || picked.has(c.site)}
                    disabled={taken}
                    onChange={() => toggle(c.site)}
                    aria-label={c.site}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-heading">
                    {c.domain}
                    {c.site !== c.domain && <span className="text-muted"> → {c.site}</span>}
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-1">
                    <Tag tone={c.direct ? "cached" : "blocked"}>
                      {c.direct
                        ? t("tunnels.companions_direct_ok", { defaultValue: "opens straight" })
                        : t("tunnels.companions_direct_no", { defaultValue: "blocked straight" })}
                    </Tag>
                    <Tag tone={c.tunnel ? "cached" : "blocked"}>
                      {c.tunnel
                        ? t("tunnels.companions_tunnel_ok", { defaultValue: "opens via tunnel" })
                        : t("tunnels.companions_tunnel_no", { defaultValue: "not via tunnel" })}
                    </Tag>
                  </span>
                </li>
              );
            })}
          </ul>
          <Btn
            type="button"
            disabled={toAdd.length === 0 || busy !== null}
            onClick={() => void add()}
          >
            <Plus size={12} />{" "}
            {t("tunnels.companions_add", {
              count: toAdd.length,
              egress: egressName,
              defaultValue: "Route through {{egress}}: {{count}}",
            })}
          </Btn>
        </div>
      )}
    </div>
  );
}
