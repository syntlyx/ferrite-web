import { Component, lazy, Suspense, useEffect, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { api } from "@/api";
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
const Settings = lazy(() => import("@/pages/Settings"));

function RequireAuth({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    api
      .checkAuth()
      .then((d) => setStatus(!d.password_set || d.authenticated ? "ok" : "unauth"))
      .catch(() => setStatus("unauth"));
  }, []);

  if (status === "checking") {
    return <FullScreenFallback label="Connecting…" />;
  }

  return status === "unauth" ? <Navigate to="/login" replace /> : <>{children}</>;
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
