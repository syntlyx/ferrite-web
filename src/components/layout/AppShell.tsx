import { useState, useEffect } from "react";
import type { ComponentType, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { NavLink, Link, useNavigate, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { loadLanguage } from "@/i18n";
import { cn } from "@/lib/utils";
import { DemoBanner } from "@/demo/DemoBanner";
import { FerriteBrand } from "@/components/layout/Brand";
import {
  LayoutDashboard,
  List,
  Users,
  Shield,
  UserCog,
  Globe,
  Server,
  Waypoints,
  ScrollText,
  Wrench,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Pause,
  Play,
  Search,
} from "lucide-react";
import { api } from "@/api";
import { useTheme } from "@/providers/ThemeProvider";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { usePageVisible } from "@/hooks/use-page-visible";
import { useSettings } from "@/stores/settings";
import { usePause, fmtCountdown, PAUSE_OPTIONS } from "@/stores/pause";
import { Select } from "@/components/ui";
import { DomainPanel } from "@/components/DomainPanel";
import { DevicePanel } from "@/components/DevicePanel";
import { CommandPalette } from "@/components/CommandPalette";

/** How often to re-check (cached) for available updates while the tab is visible. */
const UPDATE_POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/** How often to check egress health for the Tunnels "Down" badge. The server's
 *  alert watcher applies its own grace period, so this only affects how fast the
 *  badge appears/clears — not when alerts fire. */
const TUNNEL_POLL_INTERVAL_MS = 30 * 1000;

const LANGS = [
  { code: "en", label: "EN" },
  { code: "uk", label: "UK" },
  { code: "es", label: "ES" },
  { code: "de", label: "DE" },
  { code: "fr", label: "FR" },
] as const;

type LangCode = (typeof LANGS)[number]["code"];

function isLangCode(value: string): value is LangCode {
  return LANGS.some((lang) => lang.code === value);
}

function langCode(value: string | undefined): LangCode {
  const base = value?.split("-")[0] ?? "en";
  return isLangCode(base) ? base : "en";
}

/** The sidebar, in the order people reach for it: watching the network,
 *  deciding what gets through, shaping where it goes, looking after the box. */
const NAV_GROUPS = [
  {
    key: "nav.group_overview",
    items: [
      { to: "/", icon: LayoutDashboard, key: "nav.dashboard" },
      { to: "/queries", icon: List, key: "nav.query_log" },
      { to: "/clients", icon: Users, key: "nav.clients" },
    ],
  },
  {
    key: "nav.group_filtering",
    items: [
      { to: "/blocklist", icon: Shield, key: "nav.blocklist" },
      { to: "/profiles", icon: UserCog, key: "nav.profiles" },
      { to: "/lists", icon: Globe, key: "nav.subscriptions" },
    ],
  },
  {
    key: "nav.group_network",
    items: [
      { to: "/dns", icon: Server, key: "nav.custom_dns" },
      { to: "/tunnels", icon: Waypoints, key: "nav.tunnels" },
    ],
  },
  {
    key: "nav.group_system",
    items: [
      { to: "/logs", icon: ScrollText, key: "nav.logs" },
      { to: "/tools", icon: Wrench, key: "nav.tools" },
      { to: "/settings", icon: Settings, key: "nav.settings" },
    ],
  },
];

/** A group's heading, or — on the collapsed rail — a hairline between groups. */
function NavGroupLabel({
  label,
  collapsed,
  first,
}: {
  label: string;
  collapsed: boolean;
  first: boolean;
}) {
  if (collapsed) {
    return first ? null : <div className="mx-2 my-2 border-t border-bdr/70" aria-hidden />;
  }
  return (
    <p className={cn("px-3 pb-1 text-[11.5px] text-muted", first ? "pt-0" : "pt-2.5")}>{label}</p>
  );
}

function isRouteActive(to: string, pathname: string) {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/");
}

function NavItem({
  to,
  icon: Icon,
  label,
  collapsed,
  onClose,
  onActiveClick,
  badge,
  badgeLabel,
  badgeText,
}: {
  to: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  collapsed: boolean;
  onClose?: () => void;
  onActiveClick: (to: string) => void;
  badge?: boolean;
  badgeLabel?: string;
  badgeText?: string;
}) {
  const { pathname } = useLocation();

  function handleClick(e: ReactMouseEvent) {
    if (isRouteActive(to, pathname)) {
      e.preventDefault();
      onActiveClick(to);
    }
    onClose?.();
  }

  return (
    <NavLink
      to={to}
      end={to === "/"}
      onClick={handleClick}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex min-h-[34px] items-center gap-3 rounded-lg px-3 py-1 text-[13.5px] transition-colors",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-ember/10 font-medium text-heading [&_svg]:text-ember"
            : "text-body hover:bg-white/4 hover:text-heading",
        )
      }
    >
      <span className="relative shrink-0">
        <Icon size={16} />
        {badge && collapsed && (
          <span
            role="img"
            aria-label={badgeLabel}
            title={badgeLabel}
            className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-warn"
          />
        )}
      </span>
      {!collapsed && (
        <span className="flex flex-1 items-center justify-between">
          {label}
          {badge && (
            <span
              role="img"
              aria-label={badgeLabel}
              title={badgeLabel}
              className="inline-flex items-center gap-1.5 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-medium text-warn"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-warn" />
              {badgeText}
            </span>
          )}
        </span>
      )}
      {collapsed && <span className="sidebar-tooltip">{label}</span>}
    </NavLink>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();
  const [reloadKey, setReloadKey] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // The box-wide pause lengths, shown on demand to keep the sidebar short.
  const [pauseOpen, setPauseOpen] = useState(false);
  // ⌘K / Ctrl+K opens the command palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [collapsedRaw, setCollapsedRaw] = useLocalStorage("sidebar-collapsed", "false");
  const collapsed = collapsedRaw === "true";
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [tunnelDown, setTunnelDown] = useState(false);
  // Until the first response lands, assume filtering is on: the neutral badge
  // beats flashing "filtering off" at someone whose filtering is fine.
  const configuredOn = useSettings()?.blocklist?.enabled ?? true;
  const pause = usePause();
  const paused = configuredOn && pause.globalLeft != null;
  // Filtering as the resolver applies it right now: on in the config and not paused.
  const blockingEnabled = configuredOn && !paused;
  const runPause = (fn: () => Promise<void>) => {
    fn().catch(() => {
      /* the next poll shows the true state */
    });
  };
  const fmtMinutes = (m: number) =>
    m >= 60
      ? t("pause.hours_short", { count: m / 60, defaultValue: "{{count}}h" })
      : t("pause.minutes_short", { count: m, defaultValue: "{{count}}m" });
  const { theme, toggle: toggleTheme } = useTheme();
  const pageVisible = usePageVisible();

  // Live "update available" indicator. The server re-checks upstream releases on
  // its own schedule and caches the result, so we always ask for the CACHED
  // answer (checkUpdate() without force) and just re-read it on an interval —
  // one call per tick, only while the tab is visible.
  useEffect(() => {
    if (!pageVisible) return;
    let alive = true;

    const refresh = () => {
      api
        .checkUpdate()
        .then((r) => {
          if (alive) setUpdateAvailable(r.server.update_available || r.web.update_available);
        })
        .catch(() => {});
    };

    refresh();
    const id = setInterval(refresh, UPDATE_POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pageVisible]);

  // "Tunnel down" badge on the Tunnels nav item: on when any egress has been
  // unhealthy past the server's alert grace (`alerting`), so a routine blip
  // (WireGuard rekey, breaker cooldown) never flashes the sidebar.
  useEffect(() => {
    if (!pageVisible) return;
    let alive = true;

    const refresh = () => {
      api
        .proxyStats()
        .then((r) => {
          if (alive) setTunnelDown(Object.values(r.egresses).some((e) => e.alerting));
        })
        .catch(() => {});
    };

    refresh();
    const id = setInterval(refresh, TUNNEL_POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pageVisible]);

  // Per-item nav badge: "Update" on Settings, "Down" on Tunnels.
  const badgeFor = (to: string) => {
    if (to === "/settings" && updateAvailable)
      return {
        badge: true,
        badgeLabel: t("sidebar.update_available", {
          defaultValue: "Update available — open Settings",
        }),
        badgeText: t("sidebar.update_badge", { defaultValue: "Update" }),
      };
    if (to === "/tunnels" && tunnelDown)
      return {
        badge: true,
        badgeLabel: t("sidebar.tunnel_down", {
          defaultValue: "An egress is down — open Tunnels",
        }),
        badgeText: t("sidebar.tunnel_badge", { defaultValue: "Down" }),
      };
    return { badge: false };
  };

  function toggleCollapsed() {
    setCollapsedRaw(String(!collapsed));
  }

  function switchLang(code: LangCode) {
    // The strings for a language other than English arrive with this call, so
    // the switch lands once they are in rather than flashing the fallback.
    void loadLanguage(code);
    localStorage.setItem("lang", code);
  }

  function cycleLang() {
    const currentIndex = LANGS.findIndex((lang) => lang.code === currentLang);
    const next = LANGS[(currentIndex + 1) % LANGS.length] ?? LANGS[0];
    switchLang(next.code);
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    navigate("/login");
  }

  function handleActiveNavClick(to: string) {
    navigate(to, { replace: true });
    setReloadKey((k) => k + 1);
  }

  function handleLogoClick(e: ReactMouseEvent) {
    if (pathname === "/") {
      e.preventDefault();
      handleActiveNavClick("/");
    }
    setMobileOpen(false);
  }

  const currentLang = langCode(i18n.language);

  // Shared bottom controls for both sidebar and mobile drawer. Called as a
  // function, not mounted as <BottomControls/>: a component declared inside
  // this one is a new type on every render, so React would remount the whole
  // subtree each time — every second while a pause counts down.
  function bottomControls({ inDrawer = false }: { inDrawer?: boolean } = {}) {
    const compact = collapsed && !inDrawer;
    const iconBtn = cn(
      "text-muted hover:text-heading group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/5",
    );
    const themeLabel = theme === "dark" ? t("sidebar.light_mode") : t("sidebar.dark_mode");
    const dot = paused ? "bg-warn" : blockingEnabled ? "bg-cached" : "bg-warn";

    return (
      <>
        {compact ? (
          <div className="group relative mb-1 flex justify-center py-2">
            <span
              className={cn("h-2 w-2 rounded-full", dot)}
              aria-label={
                paused
                  ? t("pause.paused", { defaultValue: "Filtering paused" })
                  : blockingEnabled
                    ? t("sidebar.status_online")
                    : t("sidebar.status_filtering_off")
              }
              role="img"
            />
            <span className="sidebar-tooltip">
              {paused
                ? t("pause.paused", { defaultValue: "Filtering paused" })
                : blockingEnabled
                  ? t("sidebar.status_online")
                  : t("sidebar.status_filtering_off")}
            </span>
          </div>
        ) : (
          <div className="mb-2 rounded-xl border border-bdr bg-card px-3 py-2.5">
            {/* The lengths open above the status line: the card sits at the
                bottom of the sidebar and grows upward, so the pause button
                stays where it was clicked rather than a length taking its place. */}
            {configuredOn && !paused && pauseOpen && (
              <div className="mb-2.5 flex items-center gap-1">
                {PAUSE_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setPauseOpen(false);
                      runPause(() => pause.pauseGlobal(m));
                    }}
                    title={t("pause.pause_for", {
                      time: fmtMinutes(m),
                      defaultValue: "Pause filtering for {{time}}",
                    })}
                    className="h-7 flex-1 rounded-lg border border-bdr text-xs text-body tabular-nums transition-colors hover:border-warn/50 hover:text-warn"
                  >
                    {fmtMinutes(m)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  dot,
                  blockingEnabled && "shadow-[0_0_0_4px_rgba(92,200,168,0.14)]",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-heading">
                  {paused
                    ? t("pause.paused", { defaultValue: "Filtering paused" })
                    : blockingEnabled
                      ? t("sidebar.status_online")
                      : t("sidebar.status_filtering_off")}
                </p>
                {(paused || !blockingEnabled) && (
                  <p className="truncate text-xs text-muted">
                    {paused
                      ? t("pause.time_left", {
                          time: fmtCountdown(pause.globalLeft ?? 0),
                          defaultValue: "{{time}} left",
                        })
                      : t("sidebar.filtering_off_hint")}
                  </p>
                )}
              </div>
              {/* Pause filtering for a while — or bring it back early. */}
              {configuredOn &&
                (paused ? (
                  <button
                    type="button"
                    onClick={() => runPause(pause.resumeGlobal)}
                    className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-ember/40 px-2 text-xs font-medium text-ember transition-colors hover:bg-ember/10"
                  >
                    <Play size={11} /> {t("pause.resume", { defaultValue: "Resume" })}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPauseOpen((v) => !v)}
                    aria-expanded={pauseOpen}
                    aria-label={t("pause.pause", { defaultValue: "Pause filtering" })}
                    title={t("pause.pause", { defaultValue: "Pause filtering" })}
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/5 hover:text-warn",
                      pauseOpen ? "text-warn" : "text-muted",
                    )}
                  >
                    <Pause size={13} />
                  </button>
                ))}
            </div>
          </div>
        )}

        <div className={cn("flex items-center gap-1", compact && "flex-col")}>
          {compact ? (
            <button
              type="button"
              onClick={cycleLang}
              className={cn(iconBtn, "font-mono text-[11px] font-semibold")}
            >
              {currentLang.toUpperCase()}
              <span className="sidebar-tooltip">{t(`lang.${currentLang}`)}</span>
            </button>
          ) : (
            <Select
              value={currentLang}
              onChange={(e) => switchLang(langCode(e.target.value))}
              className="min-w-0 flex-1"
              aria-label="Language"
            >
              {LANGS.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label} · {t(`lang.${lang.code}`)}
                </option>
              ))}
            </Select>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={themeLabel}
            title={themeLabel}
            className={iconBtn}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            {compact && <span className="sidebar-tooltip">{themeLabel}</span>}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            aria-label={t("sidebar.logout")}
            title={t("sidebar.logout")}
            className={cn(iconBtn, "hover:bg-blocked/10 hover:text-blocked")}
          >
            <LogOut size={15} />
            {compact && <span className="sidebar-tooltip">{t("sidebar.logout")}</span>}
          </button>
          {!inDrawer && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
              title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
              className={iconBtn}
            >
              {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
              {compact && <span className="sidebar-tooltip">{t("sidebar.expand")}</span>}
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="app-canvas flex h-full justify-center overflow-hidden bg-void">
      <div className="relative flex h-full w-full max-w-420 border-x border-bdr/70">
        {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
        {/* `relative z-20` keeps the rail above the content column: <main> carries a
            transform (the page fade), which makes it a stacking context of its own and
            would otherwise paint over the collapsed rail's hover tooltips. */}
        <aside
          className={`relative z-20 hidden h-full shrink-0 flex-col border-r border-bdr bg-sidebar transition-[width] duration-200 md:flex ${collapsed ? "w-16" : "w-60"}`}
        >
          <Link
            to="/"
            onClick={handleLogoClick}
            title="Ferrite dashboard"
            aria-label="Ferrite dashboard"
            className={cn(
              "flex h-14 shrink-0 items-center transition-colors hover:bg-white/3",
              collapsed ? "justify-center px-0" : "gap-2.5 px-4",
            )}
          >
            <FerriteBrand collapsed={collapsed} markClassName="h-9 w-9" />
          </Link>

          <nav
            className={cn(
              "min-h-0 flex-1 space-y-0.5 overflow-y-auto py-3",
              collapsed ? "px-2" : "px-3",
            )}
          >
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label={t("palette.open", { defaultValue: "Search" })}
              className={cn(
                "group relative mb-2 flex h-9 w-full items-center gap-2.5 rounded-lg border border-bdr bg-void/40 px-3 text-[13px] text-muted transition-colors hover:border-ember/40 hover:text-heading",
                collapsed && "justify-center px-0",
              )}
            >
              <Search size={13} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">
                    {t("palette.open", { defaultValue: "Search" })}
                  </span>
                  <kbd className="rounded-md border border-bdr px-1.5 font-mono text-[10px]">
                    ⌘K
                  </kbd>
                </>
              )}
              {collapsed && (
                <span className="sidebar-tooltip">
                  {t("palette.open", { defaultValue: "Search" })}
                </span>
              )}
            </button>
            {NAV_GROUPS.map((group, gi) => (
              <div key={group.key} role="group" aria-label={t(group.key)} className="space-y-0.5">
                <NavGroupLabel label={t(group.key)} collapsed={collapsed} first={gi === 0} />
                {group.items.map((item) => (
                  <NavItem
                    key={item.to}
                    to={item.to}
                    icon={item.icon}
                    label={t(item.key)}
                    collapsed={collapsed}
                    onActiveClick={handleActiveNavClick}
                    {...badgeFor(item.to)}
                  />
                ))}
              </div>
            ))}
          </nav>

          <div className={cn("px-2 py-3", !collapsed && "px-3")}>{bottomControls()}</div>
        </aside>

        {/* ── Mobile top bar ──────────────────────────────────────────────── */}
        <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-bdr bg-sidebar/95 px-4 py-2.5 backdrop-blur-xl md:hidden">
          <Link
            to="/"
            onClick={handleLogoClick}
            aria-label="Ferrite dashboard"
            className="flex items-center gap-2 hover:opacity-90"
          >
            <FerriteBrand markClassName="h-8 w-8" />
          </Link>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="mr-2 ml-auto rounded-lg border border-bdr p-2 text-muted transition-colors hover:text-heading"
            aria-label={t("palette.open", { defaultValue: "Search" })}
          >
            <Search size={18} />
          </button>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-lg border border-bdr p-2 text-muted transition-colors hover:text-heading"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* ── Mobile drawer ───────────────────────────────────────────────── */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-20 bg-void/60 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <div className="fixed top-0 left-0 z-30 flex h-full w-64 flex-col border-r border-bdr bg-sidebar shadow-2xl md:hidden">
              <Link
                to="/"
                onClick={handleLogoClick}
                aria-label="Ferrite dashboard"
                className="flex h-16 items-center gap-2.5 px-4 hover:bg-white/3"
              >
                <FerriteBrand />
              </Link>
              <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
                {NAV_GROUPS.map((group, gi) => (
                  <div
                    key={group.key}
                    role="group"
                    aria-label={t(group.key)}
                    className="space-y-0.5"
                  >
                    <NavGroupLabel label={t(group.key)} collapsed={false} first={gi === 0} />
                    {group.items.map((item) => (
                      <NavItem
                        key={item.to}
                        to={item.to}
                        icon={item.icon}
                        label={t(item.key)}
                        collapsed={false}
                        onClose={() => setMobileOpen(false)}
                        onActiveClick={handleActiveNavClick}
                        {...badgeFor(item.to)}
                      />
                    ))}
                  </div>
                ))}
              </nav>
              <div className="p-3">{bottomControls({ inDrawer: true })}</div>
            </div>
          </>
        )}

        {/* The domain side panel and the command palette, from any page. */}
        <DomainPanel />
        <DevicePanel />
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          pages={NAV_GROUPS.flatMap((g) =>
            g.items.map((item) => ({ to: item.to, label: t(item.key), icon: item.icon })),
          )}
        />

        {/* ── Main content ────────────────────────────────────────────────── */}
        <main
          key={pathname + reloadKey}
          className="min-w-0 flex-1 animate-fade-up overflow-y-auto pt-14 md:pt-0"
        >
          {__FERRITE_DEMO__ && <DemoBanner />}
          {/* A paused resolver lets everything through — say so on every page,
              including on a phone where the sidebar card is out of sight. */}
          {paused && (
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs text-warn backdrop-blur">
              <Pause size={12} className="shrink-0" />
              <span className="min-w-0 flex-1">
                {t("pause.banner", {
                  time: fmtCountdown(pause.globalLeft ?? 0),
                  defaultValue: "Filtering is paused — everything resolves for {{time}} more.",
                })}
              </span>
              <button
                type="button"
                onClick={() => runPause(pause.resumeGlobal)}
                className="shrink-0 text-xs font-semibold transition-colors hover:text-heading"
              >
                {t("pause.resume", { defaultValue: "Resume" })}
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
