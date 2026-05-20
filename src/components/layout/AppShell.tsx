import { useState, useEffect } from "react";
import type { ComponentType, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { NavLink, Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { FerriteBrand } from "@/components/layout/Brand";
import {
  LayoutDashboard,
  List,
  Users,
  Shield,
  Globe,
  Server,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Languages,
  Wifi,
} from "lucide-react";
import { api } from "@/api";
import { useTheme } from "@/providers/ThemeProvider";

const LANGS = [
  { code: "en", label: "EN" },
  { code: "uk", label: "UK" },
] as const;

type LangCode = (typeof LANGS)[number]["code"];

const NAV = [
  { to: "/", icon: LayoutDashboard, key: "nav.dashboard" },
  { to: "/queries", icon: List, key: "nav.query_log" },
  { to: "/clients", icon: Users, key: "nav.clients" },
  { to: "/blocklist", icon: Shield, key: "nav.blocklist" },
  { to: "/lists", icon: Globe, key: "nav.subscriptions" },
  { to: "/dns", icon: Server, key: "nav.custom_dns" },
  { to: "/settings", icon: Settings, key: "nav.settings" },
];

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
}: {
  to: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  collapsed: boolean;
  onClose?: () => void;
  onActiveClick: (to: string) => void;
  badge?: boolean;
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
          "min-h-10 group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-teal-dim text-heading shadow-[inset_2px_0_0_var(--color-teal)]"
            : "text-body hover:bg-white/4 hover:text-heading",
        )
      }
    >
      <span className="relative shrink-0">
        <Icon size={14} />
        {badge && collapsed && (
          <span className="bg-warn absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full" />
        )}
      </span>
      {!collapsed && (
        <span className="flex flex-1 items-center justify-between">
          {label}
          {badge && <span className="bg-warn h-1.5 w-1.5 rounded-full" />}
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
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    api
      .checkUpdate()
      .then((r) => {
        if (r.server.update_available || r.web.update_available) setUpdateAvailable(true);
      })
      .catch(() => {});
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      localStorage.setItem("sidebar-collapsed", String(!v));
      return !v;
    });
  }

  function switchLang(code: LangCode) {
    i18n.changeLanguage(code);
    localStorage.setItem("lang", code);
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

  const currentLang = (i18n.language ?? "en") as LangCode;

  // Shared bottom controls for both sidebar and mobile drawer
  function BottomControls({ inDrawer = false }: { inDrawer?: boolean }) {
    const compact = collapsed && !inDrawer;
    const btnCls = cn(
      "mt-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs text-muted transition-colors hover:bg-white/5 hover:text-heading",
      compact && "justify-center px-0",
    );

    return (
      <>
        {!compact && (
          <div className="control-surface-muted border-bdr/70 mb-2 rounded-lg border p-3">
            <div className="text-heading mb-1.5 flex items-center gap-2 text-xs font-medium">
              <span className="relative flex h-2 w-2">
                <span className="bg-teal absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" />
                <span className="bg-teal relative inline-flex h-2 w-2 rounded-full" />
              </span>
              <Wifi size={12} className="text-teal" />
              {t("sidebar.status_online")}
            </div>
            <p className="text-muted text-[10px]">{t("sidebar.control_plane")}</p>
          </div>
        )}

        {/* Lang switcher */}
        <div
          className={cn(
            "group relative mt-0.5 flex w-full items-center rounded-md px-3 py-2 text-xs",
            compact ? "justify-center px-0" : "gap-3",
          )}
        >
          {!compact && <Languages size={14} className="text-muted shrink-0" />}
          {compact ? (
            <>
              <button
                onClick={() => switchLang(currentLang === "en" ? "uk" : "en")}
                className="text-muted hover:text-heading font-mono text-[10px] font-semibold transition-colors"
              >
                {currentLang.toUpperCase()}
              </button>
              <span className="sidebar-tooltip">
                {t("lang.en")} / {t("lang.uk")}
              </span>
            </>
          ) : (
            <div className="flex items-center gap-1">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  onClick={() => switchLang(l.code)}
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors",
                    currentLang === l.code
                      ? "bg-teal/15 text-teal"
                      : "text-muted hover:text-heading",
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button onClick={toggleTheme} className={cn("group relative", btnCls)}>
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          {!compact && (
            <span>{theme === "dark" ? t("sidebar.light_mode") : t("sidebar.dark_mode")}</span>
          )}
          {compact && (
            <span className="sidebar-tooltip">
              {theme === "dark" ? t("sidebar.light_mode") : t("sidebar.dark_mode")}
            </span>
          )}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={cn(
            "text-muted hover:bg-blocked/10 hover:text-blocked group relative mt-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs transition-colors",
            compact && "justify-center px-0",
          )}
        >
          <LogOut size={14} />
          {!compact && <span>{t("sidebar.logout")}</span>}
          {compact && <span className="sidebar-tooltip">{t("sidebar.logout")}</span>}
        </button>
      </>
    );
  }

  return (
    <div className="app-canvas bg-void flex h-screen justify-center overflow-hidden">
      <div className="border-bdr/70 bg-void/50 relative flex h-screen w-full max-w-420 border-x shadow-[0_0_90px_rgba(0,0,0,0.5)]">
        {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
        <aside
          className={`border-bdr/85 bg-sidebar/95 hidden h-screen shrink-0 flex-col border-r shadow-[18px_0_44px_rgba(0,0,0,0.2)] backdrop-blur-xl transition-[width] duration-200 md:flex ${collapsed ? "w-16" : "w-60"}`}
        >
          <Link
            to="/"
            onClick={handleLogoClick}
            title="Ferrite dashboard"
            aria-label="Ferrite dashboard"
            className={cn(
              "border-bdr/85 hover:bg-white/3 flex h-16 shrink-0 items-center border-b transition-colors",
              collapsed ? "justify-center px-0" : "gap-2.5 px-4",
            )}
          >
            <FerriteBrand collapsed={collapsed} markClassName="h-9 w-9" />
          </Link>

          <nav className={cn("flex-1 space-y-1 py-4", collapsed ? "px-2" : "px-3")}>
            {NAV.map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={t(item.key)}
                collapsed={collapsed}
                onActiveClick={handleActiveNavClick}
                badge={item.to === "/settings" && updateAvailable}
              />
            ))}
          </nav>

          <div className={cn("border-bdr/85 border-t px-2 py-3", !collapsed && "px-3")}>
            <button
              onClick={toggleCollapsed}
              title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
              className={cn(
                "text-muted hover:text-heading flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs transition-colors hover:bg-white/5",
                collapsed && "justify-center px-0",
              )}
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              {!collapsed && <span>{t("sidebar.collapse")}</span>}
            </button>
            <BottomControls />
          </div>
        </aside>

        {/* ── Mobile top bar ──────────────────────────────────────────────── */}
        <div className="border-bdr/85 bg-sidebar/95 fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b px-4 py-2.5 backdrop-blur-xl md:hidden">
          <Link
            to="/"
            onClick={handleLogoClick}
            aria-label="Ferrite dashboard"
            className="flex items-center gap-2 hover:opacity-90"
          >
            <FerriteBrand markClassName="h-8 w-8" />
          </Link>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="border-bdr/75 bg-panel/70 text-muted hover:text-heading rounded-md border p-2 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* ── Mobile drawer ───────────────────────────────────────────────── */}
        {mobileOpen && (
          <>
            <div
              className="bg-void/60 fixed inset-0 z-20 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <div className="border-bdr/85 bg-sidebar/95 fixed left-0 top-0 z-30 flex h-full w-64 flex-col border-r shadow-2xl backdrop-blur-xl md:hidden">
              <Link
                to="/"
                onClick={handleLogoClick}
                aria-label="Ferrite dashboard"
                className="border-bdr/85 hover:bg-white/3 flex h-16 items-center gap-2.5 border-b px-4"
              >
                <FerriteBrand />
              </Link>
              <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                {NAV.map((item) => (
                  <NavItem
                    key={item.to}
                    to={item.to}
                    icon={item.icon}
                    label={t(item.key)}
                    collapsed={false}
                    onClose={() => setMobileOpen(false)}
                    onActiveClick={handleActiveNavClick}
                    badge={item.to === "/settings" && updateAvailable}
                  />
                ))}
              </nav>
              <div className="border-bdr/85 border-t p-3">
                <BottomControls inDrawer />
              </div>
            </div>
          </>
        )}

        {/* ── Main content ────────────────────────────────────────────────── */}
        <main
          key={pathname + reloadKey}
          className="animate-fade-up min-w-0 flex-1 overflow-y-auto pt-14 md:pt-0"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
