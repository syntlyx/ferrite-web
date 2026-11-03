import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  Globe2,
  Hash,
  ListFilter,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Search,
  Server,
  Sun,
  UserCog,
  Waypoints,
} from "lucide-react";
import { api } from "@/api";
import type { BlocklistProfile, ClientEntry, CustomRecord, ProxyEgress } from "@/api/types";
import { openDevicePanel } from "@/stores/device-panel";
import { cn } from "@/lib/utils";
import { DEVICE_ICON, deviceKind } from "@/lib/device-kind";
import { SECTIONS } from "@/lib/search-index";
import { findSection } from "@/lib/find-section";
import { PAUSE_OPTIONS, usePause } from "@/stores/pause";
import { openDomainPanel } from "@/stores/domain-panel";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/providers/ThemeProvider";

type Icon = ComponentType<{ size?: number; className?: string }>;

type Group =
  | "domain"
  | "sections"
  | "pages"
  | "devices"
  | "profiles"
  | "lists"
  | "records"
  | "tunnels"
  | "actions";

/** The order groups appear in, and how many of each a search shows. */
const GROUPS: [Group, number][] = [
  ["domain", 1],
  ["sections", 8],
  ["pages", 6],
  ["devices", 6],
  ["profiles", 4],
  ["lists", 4],
  ["records", 4],
  ["tunnels", 4],
  ["actions", 6],
];

interface Item {
  id: string;
  group: Group;
  label: string;
  /** Where it lives, or what it is: a breadcrumb, an IP, a record value. */
  hint?: string;
  /** Searched beside the label and hint, never shown. */
  words?: string;
  icon: Icon;
  run: () => void | Promise<void>;
}

interface Entities {
  clients: ClientEntry[];
  profiles: BlocklistProfile[];
  lists: string[];
  records: CustomRecord[];
  egresses: ProxyEgress[];
}

const NONE: Entities = { clients: [], profiles: [], lists: [], records: [], egresses: [] };

/** Something that reads as a domain name: a dot, no spaces. */
const looksLikeDomain = (q: string) => /^[a-z0-9*][a-z0-9.*-]*\.[a-z0-9-]{2,}\.?$/i.test(q);

/** IPv4 first, then routable IPv6, link-local last — the address people know. */
const ipRank = (ip: string) =>
  !ip.includes(":") ? 0 : ip.toLowerCase().startsWith("fe80:") ? 2 : 1;

/** Lower case without accents, so "réglages" finds "reglages". */
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * How well `item` answers `query`, 0 for not at all. Every word typed must
 * appear somewhere — label, breadcrumb or the extra search terms — and a
 * label that starts with or contains the query ranks above a match on the
 * extra terms alone.
 */
function score(item: Item, query: string): number {
  const label = fold(item.label);
  const hay = `${label} ${fold(item.hint ?? "")} ${fold(item.words ?? "")}`;
  const tokens = query.split(/\s+/).filter(Boolean);
  if (!tokens.every((tok) => hay.includes(tok))) return 0;
  if (label.startsWith(query)) return 100;
  if (label.includes(query)) return 70;
  // The name a feature goes by, typed in full — "rate limit" — points at the
  // setting itself rather than the panel that mentions it among others.
  if (fold(item.words ?? "").startsWith(query)) return 60;
  if (tokens.every((tok) => label.split(/[\s/·—-]+/).some((w) => w.startsWith(tok)))) return 50;
  if (tokens.every((tok) => label.includes(tok))) return 40;
  return 10;
}

/**
 * ⌘K / Ctrl+K: find anything in the panel. Pages, and every block and setting
 * on them — picking one opens its page and tab, scrolls to it and marks it —
 * devices, profiles, lists, local records and tunnels, a few actions; or
 * type a domain to open its panel. Mounted once by the shell; `pages` is the
 * sidebar's own list, so the two never drift.
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
  const { theme, toggle: toggleTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<Entities>(NONE);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
    let alive = true;
    void Promise.allSettled([
      api.clients(200),
      api.getProfiles(),
      api.getLists(),
      api.getAllowlists(),
      api.getCustomRecords(),
      api.getProxy(),
    ]).then(([c, p, l, a, r, x]) => {
      if (!alive) return;
      const ok = <T,>(s: PromiseSettledResult<T>) => (s.status === "fulfilled" ? s.value : null);
      setFound({
        clients: ok(c)?.clients ?? [],
        profiles: ok(p)?.profiles ?? [],
        lists: [...(ok(l)?.lists ?? []), ...(ok(a)?.lists ?? [])].map((x) => x.name),
        records: ok(r)?.records ?? [],
        egresses: ok(x)?.proxy.egresses ?? [],
      });
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const pageLabel = useMemo(() => new Map(pages.map((p) => [p.to, p.label])), [pages]);
  const pageIcon = useMemo(() => new Map(pages.map((p) => [p.to, p.icon])), [pages]);

  const items = useMemo<Item[]>(() => {
    const q = fold(query.trim());
    const go = (to: string, find?: string) => () => {
      navigate(to);
      if (find) findSection(find);
    };
    const all: Item[] = [];

    if (looksLikeDomain(q)) {
      all.push({
        id: `domain:${q}`,
        group: "domain",
        label: t("palette.check", { domain: q, defaultValue: "Check {{domain}}" }),
        icon: Globe2,
        run: () => openDomainPanel(q),
      });
    }

    for (const p of pages) {
      all.push({ id: `page:${p.to}`, group: "pages", label: p.label, icon: p.icon, run: go(p.to) });
    }

    for (const s of SECTIONS) {
      const label = t(s.key);
      const crumb = [pageLabel.get(s.page), s.parent ? t(s.parent) : null]
        .filter(Boolean)
        .join(" › ");
      const to = s.tab ? `${s.page}?tab=${s.tab}` : s.page;
      all.push({
        id: `section:${s.key}`,
        group: "sections",
        label,
        hint: crumb,
        words: s.words,
        icon: pageIcon.get(s.page) ?? Hash,
        run: go(to, label),
      });
    }

    for (const c of found.clients) {
      all.push({
        id: `device:${c.name}`,
        group: "devices",
        label: c.name,
        hint: [...c.ips].sort((a, b) => ipRank(a) - ipRank(b))[0],
        words: [...c.ips, ...c.macs].join(" "),
        icon: DEVICE_ICON[deviceKind(c.name)],
        run: () => openDevicePanel({ macs: c.macs, ips: c.ips, name: c.name }),
      });
    }
    for (const p of found.profiles) {
      all.push({
        id: `profile:${p.id}`,
        group: "profiles",
        label: p.name,
        hint: pageLabel.get("/profiles"),
        icon: UserCog,
        run: go("/profiles"),
      });
    }
    for (const name of found.lists) {
      all.push({
        id: `list:${name}`,
        group: "lists",
        label: name,
        hint: pageLabel.get("/lists"),
        icon: ListFilter,
        run: go("/lists"),
      });
    }
    for (const r of found.records) {
      all.push({
        id: `record:${r.domain}:${r.type}:${r.value}`,
        group: "records",
        label: r.domain,
        hint: `${r.type} ${r.value}`,
        icon: Server,
        run: go("/dns"),
      });
    }
    for (const e of found.egresses) {
      all.push({
        id: `egress:${e.id}`,
        group: "tunnels",
        label: e.name,
        hint: `${pageLabel.get("/tunnels") ?? ""} › ${e.kind}`,
        icon: Waypoints,
        run: go("/tunnels?tab=egresses"),
      });
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
      {
        id: "theme",
        group: "actions",
        label: theme === "dark" ? t("sidebar.light_mode") : t("sidebar.dark_mode"),
        words: "theme light dark",
        icon: theme === "dark" ? Sun : Moon,
        run: toggleTheme,
      },
    ];
    all.push(...actions);

    // Nothing typed: the pages and the actions, the way the sidebar lists them.
    if (!q) return all.filter((i) => i.group === "pages" || i.group === "actions");

    const ranked = all
      .map((item) => ({ item, s: score(item, q) }))
      .filter((r) => r.s > 0 || r.item.group === "domain");
    // Groups follow their best match — a tunnel named "Proton NL" comes before
    // a section that merely mentions proton — and the usual order breaks ties.
    // A typed domain stays on top.
    const groups = GROUPS.map(([group, cap], order) => {
      const rows = ranked
        .filter((r) => r.item.group === group)
        .sort((a, b) => b.s - a.s)
        .slice(0, cap);
      const best = group === "domain" ? Infinity : (rows[0]?.s ?? 0);
      return { rows, best, order };
    });
    groups.sort((a, b) => b.best - a.best || a.order - b.order);
    return groups.flatMap((g) => g.rows.map((r) => r.item));
  }, [query, pages, pageLabel, pageIcon, found, pause, theme, toggleTheme, navigate, t, toast]);

  useEffect(() => setActive(0), [query]);

  // Keep the highlighted row in view while moving with the arrow keys.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

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

  const groupLabel: Record<Group, string> = {
    domain: t("palette.domain", { defaultValue: "Domain" }),
    sections: t("palette.sections", { defaultValue: "Settings and sections" }),
    pages: t("palette.pages", { defaultValue: "Pages" }),
    devices: t("palette.devices", { defaultValue: "Devices" }),
    profiles: t("palette.profiles", { defaultValue: "Profiles" }),
    lists: t("palette.lists", { defaultValue: "Lists" }),
    records: t("palette.records", { defaultValue: "DNS records" }),
    tunnels: t("palette.tunnels", { defaultValue: "Tunnels" }),
    actions: t("palette.actions", { defaultValue: "Actions" }),
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t("palette.open", { defaultValue: "Search" })}
    >
      <button
        type="button"
        aria-label={t("common.close", { defaultValue: "Close" })}
        onClick={onClose}
        className="absolute inset-0 bg-void/60 backdrop-blur-[2px]"
      />
      <div className="relative w-full max-w-2xl animate-fade-up overflow-hidden rounded-xl border border-bdr bg-card shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-3 border-b border-bdr px-4">
          <Search size={16} className="shrink-0 text-muted" />
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
              defaultValue: "Search settings, pages and devices, or type a domain…",
            })}
            aria-label={t("palette.open", { defaultValue: "Search" })}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-heading outline-none placeholder:text-muted"
          />
          <kbd className="rounded-md border border-bdr px-1.5 font-mono text-[10px] text-muted">
            esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-[56vh] overflow-y-auto py-2">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">
              {t("palette.empty", { defaultValue: "Nothing matches." })}
            </p>
          ) : (
            items.map((item, i) => {
              const Icon = item.icon;
              const first = i === 0 || items[i - 1].group !== item.group;
              return (
                <div key={item.id}>
                  {first && (
                    <p className="px-4 pt-2.5 pb-1 text-xs text-muted">{groupLabel[item.group]}</p>
                  )}
                  <button
                    type="button"
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => void run(item)}
                    className={cn(
                      "mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors",
                      i === active ? "bg-ember/10 text-heading" : "text-body",
                    )}
                  >
                    <Icon size={15} className={i === active ? "text-ember" : "text-muted"} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && (
                      <span className="max-w-[45%] shrink-0 truncate text-xs text-muted">
                        {item.hint}
                      </span>
                    )}
                    <CornerDownLeft
                      size={12}
                      className={cn("shrink-0 text-muted", i !== active && "invisible")}
                    />
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-bdr px-4 py-2 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <ArrowUp size={11} />
            <ArrowDown size={11} /> {t("palette.move", { defaultValue: "move" })}
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft size={11} /> {t("palette.go", { defaultValue: "open" })}
          </span>
          <span className="ml-auto">
            {t("palette.tip", { defaultValue: "Try “rate limit”, “ntfy” or a device name" })}
          </span>
        </div>
      </div>
    </div>
  );
}
