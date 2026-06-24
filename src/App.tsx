import { Component, lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShieldAlert, X } from "lucide-react";
import { api } from "@/api";
import { ApiClientError } from "@/api/client";
import { ToastProvider } from "@/providers/ToastProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import AppShell from "@/components/layout/AppShell";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="app-canvas bg-void flex min-h-screen items-center justify-center p-8 text-center">
          <div className="border-bdr/85 bg-card rounded-xs border p-6 shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
            <p className="text-blocked text-sm font-medium">Something went wrong</p>
            <p className="text-muted mt-1 text-xs">{(this.state.error as Error).message}</p>
            <button
              className="text-ember mt-4 text-xs underline"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Queries = lazy(() => import("@/pages/Queries"));
const Clients = lazy(() => import("@/pages/Clients"));
const Blocklist = lazy(() => import("@/pages/Blocklist"));
const Lists = lazy(() => import("@/pages/Lists"));
const CustomDNS = lazy(() => import("@/pages/CustomDNS"));
const Tunnels = lazy(() => import("@/pages/Tunnels"));
const Logs = lazy(() => import("@/pages/Logs"));
const Tools = lazy(() => import("@/pages/Tools"));
const Settings = lazy(() => import("@/pages/Settings"));

function PasswordBanner() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="border-warn/40 bg-warn/15 text-warn flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-xs">
      <ShieldAlert size={14} className="shrink-0" />
      <span className="font-semibold">
        {t("security.no_password", { defaultValue: "No password set" })}
      </span>
      <span className="text-body/80">
        {t("security.no_password_sub", {
          defaultValue: "Anyone on your network can open this panel.",
        })}
      </span>
      <Link
        to="/settings"
        className="text-ember hover:text-ember-h ml-auto font-medium underline transition-colors"
      >
        {t("security.set_password", { defaultValue: "Set a password" })}
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-muted hover:text-body shrink-0 transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState("checking");
  const [noPassword, setNoPassword] = useState(false);

  const check = useCallback(() => {
    let cancelled = false;
    setStatus("checking");
    api
      .checkAuth()
      .then((d) => {
        if (cancelled) return;
        setNoPassword(!d.password_set);
        setStatus(!d.password_set || d.authenticated ? "ok" : "unauth");
      })
      .catch((e) => {
        if (cancelled) return;
        // A genuine 401 is already handled globally in the API client (token
        // cleared + redirect to /login). Anything reaching here is a transient
        // infra error (network / 5xx / timeout) — surface a retry instead of
        // force-logging-out an authenticated user.
        setStatus(e instanceof ApiClientError && e.status === 401 ? "unauth" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => check(), [check]);

  if (status === "checking") {
    return <FullScreenFallback label="Connecting…" />;
  }

  if (status === "error") {
    return (
      <div className="app-canvas bg-void flex min-h-screen items-center justify-center">
        <div className="border-bdr/85 bg-card rounded-xs border p-6 text-center shadow-[0_14px_34px_rgba(0,0,0,0.22)]">
          <p className="text-blocked text-sm font-medium">Couldn’t reach the server</p>
          <p className="text-muted mt-1 text-xs">Check your connection and try again.</p>
          <button className="text-ember mt-4 text-xs underline" onClick={check}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return status === "unauth" ? (
    <Navigate to="/login" replace />
  ) : (
    <>
      {noPassword && <PasswordBanner />}
      {children}
    </>
  );
}

const PageFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <span className="text-muted text-xs">Loading…</span>
  </div>
);

const FullScreenFallback = ({ label = "Loading…" }: { label?: string }) => (
  <div className="app-canvas bg-void flex min-h-screen items-center justify-center">
    <span className="border-bdr/75 bg-card text-muted rounded-xs border px-3 py-2 text-xs shadow-[0_10px_24px_rgba(0,0,0,0.16)]">
      {label}
    </span>
  </div>
);

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <Suspense fallback={<FullScreenFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                  path="/*"
                  element={
                    <RequireAuth>
                      <AppShell>
                        <Suspense fallback={<PageFallback />}>
                          <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/queries" element={<Queries />} />
                            <Route path="/clients" element={<Clients />} />
                            <Route path="/blocklist" element={<Blocklist />} />
                            <Route path="/lists" element={<Lists />} />
                            <Route path="/dns" element={<CustomDNS />} />
                            <Route path="/tunnels" element={<Tunnels />} />
                            <Route path="/logs" element={<Logs />} />
                            <Route path="/tools" element={<Tools />} />
                            <Route path="/settings" element={<Settings />} />
                          </Routes>
                        </Suspense>
                      </AppShell>
                    </RequireAuth>
                  }
                />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
