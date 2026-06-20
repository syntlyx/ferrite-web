import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/layout/Card";
import { Select, Btn } from "@/components/ui";
import { usePageVisible } from "@/hooks/use-page-visible";
import type { LogEntry } from "@/api/types";

const LEVELS = ["", "error", "warn", "info", "debug"] as const;
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
  const [level, setLevel] = useState("");
  const [paused, setPaused] = useState(false);
  const lastId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  const load = useCallback(
    async (reset: boolean) => {
      try {
        const res = await api.getLogs({
          after_id: reset ? 0 : lastId.current,
          level: level || undefined,
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
    },
    [level],
  );

  // Reset and reload whenever the level filter changes.
  useEffect(() => {
    lastId.current = 0;
    followRef.current = true;
    setLogs([]);
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

  return (
    <div className="p-6">
      <PageHeader
        title={t("logs.title", { defaultValue: "Logs" })}
        subtitle={t("logs.subtitle", {
          defaultValue: "Recent server log records (in-memory; newest at the bottom).",
        })}
      />

      <Card className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-muted text-xs">{t("logs.level", { defaultValue: "Level" })}</span>
          <Select value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l === "" ? t("logs.all", { defaultValue: "all" }) : l}
              </option>
            ))}
          </Select>
        </label>
        <Btn variant="ghost" onClick={() => setPaused((p) => !p)} className="h-7">
          {paused ? <Play size={12} /> : <Pause size={12} />}
          {paused ? t("logs.resume", { defaultValue: "Resume" }) : t("logs.pause", { defaultValue: "Pause" })}
        </Btn>
        <Btn
          variant="ghost"
          onClick={() => {
            setLogs([]);
            followRef.current = true;
          }}
          className="h-7"
        >
          <Trash2 size={12} /> {t("logs.clear", { defaultValue: "Clear view" })}
        </Btn>
        <span className="text-muted ml-auto text-xs tabular-nums">{logs.length}</span>
      </Card>

      <Card className="p-0! overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-[70vh] overflow-y-auto p-3 font-mono text-xs leading-relaxed"
        >
          {logs.length === 0 ? (
            <p className="text-muted">{t("logs.empty", { defaultValue: "No log records yet." })}</p>
          ) : (
            logs.map((e) => (
              <div key={e.id} className="flex gap-2 break-all whitespace-pre-wrap">
                <span className="text-muted shrink-0">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={cn("shrink-0 font-semibold uppercase", LEVEL_COLOR[e.level] ?? "text-body")}
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
    </div>
  );
}
