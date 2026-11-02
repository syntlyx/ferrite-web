import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { CornerDownLeft, Globe2, Pause, Play, RefreshCw, Search } from "lucide-react";
import { api } from "@/api";
import type { ClientEntry } from "@/api/types";
import { openDevicePanel } from "@/stores/device-panel";
import { cn } from "@/lib/utils";
import { DEVICE_ICON, deviceKind } from "@/lib/device-kind";
import { PAUSE_OPTIONS, usePause } from "@/stores/pause";
import { openDomainPanel } from "@/stores/domain-panel";
import { useToast } from "@/hooks/use-toast";

type Icon = ComponentType<{ size?: number; className?: string }>;

interface Item {
  id: string;
  group: "domain" | "pages" | "devices" | "actions";
  label: string;
  hint?: string;
  icon: Icon;
  run: () => void | Promise<void>;
}

/** Something that reads as a domain name: a dot, no spaces. */
const looksLikeDomain = (q: string) => /^[a-z0-9*][a-z0-9.*-]*\.[a-z0-9-]{2,}\.?$/i.test(q);

/**
 * ⌘K / Ctrl+K: jump to a page or a device's queries, pause or resume
 * filtering, refresh the lists — or type a domain to open its panel. Mounted
 * once by the shell; `pages` is the sidebar's own list, so the two never drift.
 */
export function CommandPalette({
  open,
  onClose,
  pages,
}: {
  open: boolean;
  onClose: () => void;
  pages: { to: string; label: string; icon: Icon }[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const pause = usePause();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [clients, setClients] = useState<ClientEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
    api
      .clients(200)
      .then((r) => setClients(r.clients))
      .catch(() => {});
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    const out: Item[] = [];
    if (looksLikeDomain(q)) {
      out.push({
        id: `domain:${q}`,
        group: "domain",
        label: t("palette.check", { domain: q, defaultValue: "Check {{domain}}" }),
        icon: Globe2,
        run: () => openDomainPanel(q),
      });
    }
    for (const p of pages) {
      if (match(p.label)) {
        out.push({
          id: `page:${p.to}`,
          group: "pages",
          label: p.label,
          icon: p.icon,
          run: () => navigate(p.to),
        });
      }
    }
    for (const c of clients) {
      if (q && (match(c.name) || c.ips.some((ip) => ip.includes(q)))) {
        out.push({
          id: `device:${c.name}`,
          group: "devices",
          label: c.name,
          hint: c.ips[0],
          icon: DEVICE_ICON[deviceKind(c.name)],
          run: () => openDevicePanel({ macs: c.macs, ips: c.ips, name: c.name }),
        });
      }
    }
    const actions: Item[] = [
      ...(pause.globalLeft == null
        ? PAUSE_OPTIONS.map((m) => ({
            id: `pause:${m}`,
            group: "actions" as const,
            label: t("palette.pause", {
              label: m >= 60 ? `${m / 60} h` : `${m} min`,
              defaultValue: "Pause filtering for {{label}}",
            }),
            icon: Pause,
            run: () => pause.pauseGlobal(m),
          }))
        : [
            {
              id: "resume",
              group: "actions" as const,
              label: t("palette.resume", { defaultValue: "Resume filtering" }),
              icon: Play,
              run: () => pause.resumeGlobal(),
            },
          ]),
      {
        id: "refresh",
        group: "actions",
        label: t("palette.refresh", { defaultValue: "Refresh all lists" }),
        icon: RefreshCw,
        run: async () => {
          await api.refreshAllLists();
          toast(t("palette.refreshed", { defaultValue: "Lists refreshed" }));
        },
      },
    ];
    out.push(...actions.filter((a) => match(a.label)));
    return out.slice(0, 14);
  }, [query, pages, clients, pause, navigate, t, toast]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  async function run(item: Item | undefined) {
    if (!item) return;
    onClose();
    try {
      await item.run();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const groupLabel: Record<Item["group"], string> = {
    domain: t("palette.domain", { defaultValue: "Domain" }),
    pages: t("palette.pages", { defaultValue: "Pages" }),
    devices: t("palette.devices", { defaultValue: "Devices" }),
    actions: t("palette.actions", { defaultValue: "Actions" }),
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t("common.close", { defaultValue: "Close" })}
        onClick={onClose}
        className="absolute inset-0 bg-void/60 backdrop-blur-[2px]"
      />
      <div className="control-surface relative w-full max-w-xl animate-fade-up overflow-hidden rounded-xs border border-bdr/85 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-2.5 border-b border-bdr/60 px-4">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                void run(items[active]);
              }
            }}
            placeholder={t("palette.placeholder", {
              defaultValue: "Search pages and devices, or type a domain…",
            })}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-heading outline-none placeholder:text-muted"
          />
          <kbd className="rounded-xs border border-bdr/70 px-1.5 font-mono text-[10px] text-muted">
            esc
          </kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1.5">
          {items.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted">
              {t("palette.empty", { defaultValue: "Nothing matches." })}
            </p>
          ) : (
            items.map((item, i) => {
              const Icon = item.icon;
              const first = i === 0 || items[i - 1].group !== item.group;
              return (
                <div key={item.id}>
                  {first && (
                    <p className="px-4 pt-2 pb-1 font-mono text-[9px] tracking-[0.16em] text-muted/70 uppercase">
                      {groupLabel[item.group]}
                    </p>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => void run(item)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs transition-colors",
                      i === active ? "bg-ember/10 text-heading" : "text-body",
                    )}
                  >
                    <Icon size={13} className={i === active ? "text-ember" : "text-muted"} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && (
                      <span className="font-mono text-[10px] text-muted">{item.hint}</span>
                    )}
                    {i === active && <CornerDownLeft size={11} className="text-muted" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
