import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/layout/Card";
import { Btn } from "@/components/ui";
import { usePageVisible } from "@/hooks/use-page-visible";
import type { LogEntry } from "@/api/types";

// Levels the user can toggle off (exclude). Anything not listed (e.g. TRACE) is
// always shown — `hidden` is an exclude set, so unlisted levels are never hidden.
const LEVEL_TOGGLES = ["ERROR", "WARN", "INFO", "DEBUG"] as const;
const LEVEL_COLOR: Record<string, string> = {
  ERROR: "text-blocked",
  WARN: "text-warn",
  INFO: "text-upstream",
  DEBUG: "text-muted",
  TRACE: "text-muted",
};
const POLL_MS = 2000;
const MAX_LINES = 3000;

export default function Logs() {
  const { t } = useTranslation();
  const visible = usePageVisible();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  // Excluded levels (uppercase). Empty = show everything; uncheck a chip to hide
  // that level. Filtering is client-side so any combination works instantly.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [paused, setPaused] = useState(false);
  const lastId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  const load = useCallback(async (reset: boolean) => {
    try {
      // Fetch all levels; the level filter is applied client-side (exclude set).
      const res = await api.getLogs({
        after_id: reset ? 0 : lastId.current,
        limit: 1000,
      });
      if (res.logs.length) lastId.current = res.logs[res.logs.length - 1].id;
      setLogs((prev) => {
        const next = reset ? res.logs : [...prev, ...res.logs];
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    } catch {
      /* transient — the next tick retries */
    }
  }, []);

  // Initial load.
  useEffect(() => {
    void load(true);
  }, [load]);

  // Delta poll; pauses on a hidden tab or when the user pauses.
  useEffect(() => {
    if (paused || !visible) return;
    const id = setInterval(() => void load(false), POLL_MS);
    return () => clearInterval(id);
  }, [paused, visible, load]);

  // Stick to the bottom while the user is following the tail.
  useEffect(() => {
    if (followRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  function onScroll() {
    const el = scrollRef.current;
    if (el) followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  const shown = logs.filter((e) => !hidden.has(e.level.toUpperCase()));
  const toggle = (lv: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(lv)) next.delete(lv);
      else next.add(lv);
      return next;
    });

  return (
    <PageContainer>
      <PageHeader
        title={t("logs.title", { defaultValue: "Logs" })}
        subtitle={t("logs.subtitle", {
          defaultValue: "Recent server log records (in-memory; newest at the bottom).",
        })}
      />

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted mr-1 text-xs">
            {t("logs.levels", { defaultValue: "Levels" })}
          </span>
          {LEVEL_TOGGLES.map((lv) => {
            const off = hidden.has(lv);
            return (
              <button
                key={lv}
                type="button"
                onClick={() => toggle(lv)}
                aria-pressed={!off}
                className={cn(
                  "rounded-xs border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase transition-colors",
                  off
                    ? "border-bdr/40 text-muted/40 line-through"
                    : cn("border-bdr/70", LEVEL_COLOR[lv]),
                )}
              >
                {lv}
              </button>
            );
          })}
        </div>
        <Btn variant="ghost" onClick={() => setPaused((p) => !p)}>
          {paused ? <Play size={12} /> : <Pause size={12} />}
          {paused
            ? t("logs.resume", { defaultValue: "Resume" })
            : t("logs.pause", { defaultValue: "Pause" })}
        </Btn>
        <Btn
          variant="ghost"
          onClick={() => {
            setLogs([]);
            followRef.current = true;
          }}
        >
          <Trash2 size={12} /> {t("logs.clear", { defaultValue: "Clear view" })}
        </Btn>
        <span className="text-muted ml-auto text-xs tabular-nums">
          {t("logs.line_count", { count: shown.length, defaultValue: "{{count}} lines" })}
        </span>
      </Card>

      <Card className="p-0! overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-[70vh] overflow-y-auto p-3 font-mono text-xs leading-relaxed"
        >
          {shown.length === 0 ? (
            <p className="text-muted py-10 text-center text-xs">
              {t("logs.empty", { defaultValue: "No log records yet." })}
            </p>
          ) : (
            shown.map((e) => (
              <div key={e.id} className="flex gap-2 whitespace-pre-wrap break-all">
                <span className="text-muted shrink-0">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-semibold uppercase",
                    LEVEL_COLOR[e.level] ?? "text-body",
                  )}
                >
                  {e.level}
                </span>
                <span className="text-muted shrink-0">{e.target}</span>
                <span className="text-body">{e.message}</span>
              </div>
            ))
          )}
        </div>
      </Card>
    </PageContainer>
  );
}
