import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Btn, IconBtn, Input } from "@/components/ui";
import type { ScheduleWindow } from "@/api/types";

/** Config day names, Monday first — the server's order. */
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_MIN = 24 * 60;
const WEEK_MIN = 7 * DAY_MIN;

/** `HH:MM` → minutes since midnight (`24:00` = 1440), or null. */
function parseTime(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h === 24 && min === 0) return DAY_MIN;
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

/**
 * Is a profile with these windows on at `minute` of the week (Monday 00:00 =
 * 0, box-local)? The same arithmetic as the server's `Schedule`, so a draft
 * shows the status it will have once saved. No windows = always on.
 */
export function scheduleActive(windows: ScheduleWindow[], minute: number): boolean {
  if (windows.length === 0) return true;
  return windows.some((w) => {
    const from = parseTime(w.from);
    const to = parseTime(w.to);
    if (from === null || to === null || from >= DAY_MIN) return false;
    const len = to > from ? to - from : to < from ? DAY_MIN - from + to : DAY_MIN;
    const days =
      w.days.length === 0
        ? [0, 1, 2, 3, 4, 5, 6]
        : w.days.map((d) => DAYS.indexOf(d as (typeof DAYS)[number]));
    return days.some((d) => d >= 0 && (minute - (d * DAY_MIN + from) + WEEK_MIN) % WEEK_MIN < len);
  });
}

/** Short weekday names in the panel's language, Monday first. */
export function useWeekdayNames(): string[] {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: "short" });
    // 1 January 2024 was a Monday.
    return DAYS.map((_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  }, [i18n.language]);
}

/** `Mon 21:05` for a minute of the week. */
export function formatWeekMinute(minute: number, names: string[]): string {
  const day = Math.floor(minute / DAY_MIN) % 7;
  const m = minute % DAY_MIN;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${names[day]} ${hh}:${mm}`;
}

/**
 * Edit a profile's weekly windows: the days each starts on and its hours. An
 * empty list means the profile is always on.
 */
export function ScheduleEditor({
  windows,
  onChange,
}: {
  windows: ScheduleWindow[];
  onChange: (next: ScheduleWindow[]) => void;
}) {
  const { t } = useTranslation();
  const names = useWeekdayNames();

  const update = (i: number, patch: Partial<ScheduleWindow>) =>
    onChange(windows.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  const toggleDay = (i: number, day: string) => {
    const cur = windows[i].days;
    const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day];
    update(i, { days: DAYS.filter((d) => next.includes(d)) });
  };
  const add = () =>
    onChange([
      ...windows,
      { days: ["mon", "tue", "wed", "thu", "fri"], from: "21:00", to: "07:00" },
    ]);

  return (
    <div className="space-y-2">
      {windows.map((w, i) => {
        const from = parseTime(w.from);
        const to = parseTime(w.to);
        const overnight = from !== null && to !== null && to < from;
        const allDay = from !== null && from === to;
        return (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-xs border border-bdr/60 p-2 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d, di) => {
                const on = w.days.length === 0 || w.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={w.days.includes(d)}
                    onClick={() => toggleDay(i, d)}
                    className={cn(
                      "w-10 rounded-xs border py-1 text-[11px] capitalize transition-colors",
                      w.days.includes(d)
                        ? "border-ember/45 bg-ember/10 text-ember"
                        : on
                          ? "border-bdr/70 text-body"
                          : "border-bdr/70 text-muted hover:border-ember/40 hover:text-ember",
                    )}
                  >
                    {names[di]}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                type="time"
                value={w.from}
                onChange={(e) => update(i, { from: e.target.value })}
                className="w-28 font-mono"
                aria-label={t("profiles.schedule_from", { defaultValue: "From" })}
              />
              <span className="text-muted">–</span>
              <Input
                type="time"
                value={w.to === "24:00" ? "00:00" : w.to}
                onChange={(e) => update(i, { to: e.target.value })}
                className="w-28 font-mono"
                aria-label={t("profiles.schedule_to", { defaultValue: "To" })}
              />
              <IconBtn
                danger
                onClick={() => onChange(windows.filter((_, idx) => idx !== i))}
                title={t("common.delete")}
              >
                <Trash2 size={13} />
              </IconBtn>
            </div>
            <span className="text-[11px] text-muted">
              {w.days.length === 0 &&
                t("profiles.schedule_every_day", { defaultValue: "every day" })}
              {w.days.length === 0 && (overnight || allDay) && " · "}
              {overnight &&
                t("profiles.schedule_overnight", { defaultValue: "ends the next morning" })}
              {allDay && t("profiles.schedule_all_day", { defaultValue: "all day" })}
            </span>
          </div>
        );
      })}
      <Btn variant="ghost" size="sm" onClick={add}>
        <Plus size={12} /> {t("profiles.schedule_add", { defaultValue: "Add time window" })}
      </Btn>
    </div>
  );
}
