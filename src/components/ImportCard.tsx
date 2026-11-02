import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownToLine, ChevronDown, ChevronRight, FileUp } from "lucide-react";
import { api } from "@/api";
import type { ImportPart, ImportPlan } from "@/api/types";
import { cn } from "@/lib/utils";
import { SettingsPanel } from "@/components/layout/SettingsPanel";
import { Btn, Switch } from "@/components/ui";
import { useToast } from "@/hooks/use-toast";

const PARTS: ImportPart[] = [
  "lists",
  "rules",
  "records",
  "devices",
  "services",
  "dns",
  "upstreams",
];

/** Did the plan bring anything for `part`? */
function hasPart(plan: ImportPlan, part: ImportPart): boolean {
  switch (part) {
    case "lists":
      return plan.lists.length + plan.allowlists.length > 0;
    case "rules":
      return plan.block.length + plan.allow.length > 0;
    case "records":
      return plan.records.length > 0;
    case "devices":
      return plan.aliases.length + plan.profiles.length + plan.bypass.length > 0;
    case "services":
      return plan.services.length > 0 || plan.safe_search;
    case "dns":
      return (
        plan.block_response != null ||
        plan.rate_limit != null ||
        plan.allowed_clients.length + plan.denied_clients.length > 0 ||
        plan.serve_stale != null
      );
    case "upstreams":
      return plan.upstreams.length > 0;
  }
}

/**
 * Bring a Pi-hole or AdGuard Home setup over: pick the export, see what would
 * come over — and what can't, with the reason — then import the parts chosen.
 * Everything is added beside what ferrite has, except upstreams, which
 * replace the current ones and restart it (off unless switched on).
 * It sits inside the Settings form, so every button here is `type="button"`.
 */
export function ImportCard({ onRestarting }: { onRestarting: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [parts, setParts] = useState<Set<ImportPart>>(new Set());
  const [busy, setBusy] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const { plan } = await api.previewImport(f);
      setFile(f);
      setPlan(plan);
      setParts(new Set(PARTS.filter((p) => p !== "upstreams" && hasPart(plan, p))));
      setShowNotes(false);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!file || parts.size === 0) return;
    setBusy(true);
    try {
      const res = await api.applyImport(file, [...parts]);
      toast(
        t("import.done", {
          defaultValue: "Imported from {{source}}",
          source: res.source === "pihole" ? "Pi-hole" : "AdGuard Home",
        }),
      );
      setPlan(null);
      setFile(null);
      window.dispatchEvent(new Event("ferrite:settings-changed"));
      if (res.restart_required) onRestarting();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  const summary = (p: ImportPlan, part: ImportPart): string => {
    switch (part) {
      case "lists":
        return t("import.sum_lists", {
          defaultValue: "{{block}} block lists, {{allow}} allowlists",
          block: p.lists.length,
          allow: p.allowlists.length,
        });
      case "rules":
        return t("import.sum_rules", {
          defaultValue: "{{block}} to block, {{allow}} to allow",
          block: p.block.length,
          allow: p.allow.length,
        });
      case "records":
        return t("import.sum_records", {
          defaultValue: "{{count}} local records",
          count: p.records.length,
        });
      case "devices":
        return t("import.sum_devices", {
          defaultValue: "{{names}} names, {{profiles}} profiles, {{bypass}} unfiltered",
          names: p.aliases.length,
          profiles: p.profiles.length,
          bypass: p.bypass.length,
        });
      case "services":
        return [p.services.join(", "), p.safe_search ? "SafeSearch" : ""]
          .filter(Boolean)
          .join(" · ");
      case "dns":
        return [
          p.block_response,
          p.rate_limit != null ? `${p.rate_limit}/min` : "",
          p.allowed_clients.length ? p.allowed_clients.join(", ") : "",
          p.serve_stale ? t("settings.serve_stale", { defaultValue: "Optimistic cache" }) : "",
        ]
          .filter(Boolean)
          .join(" · ");
      case "upstreams":
        return t("import.sum_upstreams", {
          defaultValue:
            "{{count}} upstreams, {{zones}} forwarded zones — replaces yours and restarts ferrite",
          count: p.upstreams.length,
          zones: p.zones.length,
        });
    }
  };

  const label: Record<ImportPart, string> = {
    lists: t("import.part_lists", { defaultValue: "List subscriptions" }),
    rules: t("import.part_rules", { defaultValue: "Own block and allow rules" }),
    records: t("import.part_records", { defaultValue: "Local DNS records" }),
    devices: t("import.part_devices", { defaultValue: "Device names and groups" }),
    services: t("import.part_services", { defaultValue: "Blocked services, SafeSearch" }),
    dns: t("import.part_dns", { defaultValue: "Blocking and access settings" }),
    upstreams: t("import.part_upstreams", { defaultValue: "Upstream resolvers" }),
  };

  return (
    <SettingsPanel
      icon={ArrowDownToLine}
      title={t("import.title", { defaultValue: "Move over from Pi-hole or AdGuard Home" })}
      sub={t("import.sub", {
        defaultValue:
          "A Pi-hole v6 Teleporter export (.zip) or AdGuardHome.yaml. You see what comes over — and what can't — before anything changes; it's added beside what ferrite has.",
      })}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".zip,.yaml,.yml"
            className="hidden"
            onChange={(e) => void pick(e)}
          />
          {plan ? (
            <>
              <Btn
                type="button"
                variant="ghost"
                onClick={() => {
                  setPlan(null);
                  setFile(null);
                }}
                disabled={busy}
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Btn>
              <Btn type="button" onClick={() => void run()} disabled={busy || parts.size === 0}>
                <ArrowDownToLine size={12} /> {t("import.run", { defaultValue: "Import selected" })}
              </Btn>
            </>
          ) : (
            <Btn
              type="button"
              variant="ghost"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
            >
              <FileUp size={12} /> {t("import.pick", { defaultValue: "Choose export…" })}
            </Btn>
          )}
        </div>
      }
    >
      {plan ? (
        <div className="space-y-1 py-3">
          <p className="pb-1 text-xs text-muted">
            {t("import.from", {
              defaultValue: "From {{source}} — {{file}}",
              source: plan.source === "pihole" ? "Pi-hole" : "AdGuard Home",
              file: file?.name ?? "",
            })}
          </p>
          {PARTS.map((part) => {
            const available = hasPart(plan, part);
            return (
              <div
                key={part}
                className={cn(
                  "flex items-center gap-3 rounded-xs px-1 py-1.5",
                  !available && "opacity-40",
                )}
              >
                <Switch
                  checked={parts.has(part)}
                  disabled={!available}
                  onCheckedChange={(on) =>
                    setParts((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(part);
                      else next.delete(part);
                      return next;
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-heading">{label[part]}</p>
                  <p
                    className={cn(
                      "truncate text-[11px]",
                      part === "upstreams" ? "text-warn" : "text-muted",
                    )}
                  >
                    {available
                      ? summary(plan, part)
                      : t("import.nothing", { defaultValue: "nothing in this export" })}
                  </p>
                </div>
              </div>
            );
          })}
          {plan.notes.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowNotes((v) => !v)}
                className="flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-ember"
              >
                {showNotes ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {t("import.notes", {
                  defaultValue: "What doesn't come over ({{count}})",
                  count: plan.notes.length,
                })}
              </button>
              {showNotes && (
                <ul className="mt-1.5 space-y-1 pl-4">
                  {plan.notes.map((n, i) => (
                    <li key={i} className="list-disc text-[11px] leading-relaxed text-muted">
                      {n}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="py-3 text-xs text-muted">
          {busy
            ? t("import.reading", { defaultValue: "Reading the export…" })
            : t("import.how", {
                defaultValue:
                  "Pi-hole: Settings → Teleporter → Export. AdGuard Home: AdGuardHome.yaml from its folder.",
              })}
        </p>
      )}
    </SettingsPanel>
  );
}
