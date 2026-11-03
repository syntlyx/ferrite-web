import { cn } from "@/lib/utils";
import type { ComponentType, ReactNode } from "react";
import { Card } from "./Card";

// Shared configuration-page primitives. Used by the Settings and Tunnels pages
// so both sit on the same panel/row/tile rhythm. Keep visual changes here, not
// per-page, so the two never drift apart.

export type PanelIcon = ComponentType<{ size?: number; className?: string }>;

/** Bordered card with an icon header, divided body rows, and an optional footer. */
export function SettingsPanel({
  title,
  sub,
  icon: Icon,
  badge,
  footer,
  children,
}: {
  title: string;
  sub?: string;
  icon: PanelIcon;
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-bdr/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 rounded-lg bg-ember/10 p-2 text-ember">
            <Icon size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-heading">{title}</p>
            {sub && <p className="mt-0.5 text-xs leading-relaxed text-muted">{sub}</p>}
          </div>
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      <div className="divide-y divide-bdr/55 px-5">{children}</div>
      {footer && <div className="border-t border-bdr/55 bg-void/20 px-5 py-3">{footer}</div>}
    </Card>
  );
}

/** A label/sub on the left, control on the right. */
export function SettingRow({
  label,
  sub,
  badge,
  children,
  align = "center",
}: {
  label: string;
  sub?: string;
  badge?: ReactNode;
  children: ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div
      className={cn(
        "grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]",
        align === "center" ? "sm:items-center" : "sm:items-start",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-heading">{label}</p>
          {badge}
        </div>
        {sub && <p className="mt-0.5 text-xs leading-relaxed text-muted">{sub}</p>}
      </div>
      <div className="flex min-w-0 items-center gap-2 sm:justify-end">{children}</div>
    </div>
  );
}

/** Full-width row for editors that need the whole panel width. */
export function SettingBlock({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-heading">{label}</p>
        {sub && <p className="mt-0.5 text-xs leading-relaxed text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

/** Pill toggling between a "set" (ember) and "unset" (muted) state. */
export function StatusBadge({
  set,
  labelSet,
  labelUnset,
}: {
  set: boolean;
  labelSet: string;
  labelUnset: string;
}) {
  return set ? (
    <span className="rounded-full bg-ember/10 px-2 py-0.5 text-[10px] font-medium text-ember">
      {labelSet}
    </span>
  ) : (
    <span className="rounded-full bg-bdr px-2 py-0.5 text-[10px] font-medium text-muted">
      {labelUnset}
    </span>
  );
}

/** Compact metric tile for an at-a-glance overview strip. */
export function StatusTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "ember",
}: {
  icon: PanelIcon;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "ember" | "upstream" | "warn" | "muted";
}) {
  const toneClass = {
    ember: "text-ember bg-ember/10 border-ember/15",
    upstream: "text-upstream bg-upstream/10 border-upstream/15",
    warn: "text-warn bg-warn/10 border-warn/20",
    muted: "text-muted bg-white/5 border-bdr/70",
  }[tone];

  return (
    <div className="control-surface rounded-xl border border-bdr p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">{label}</p>
        <span className={cn("rounded-md border p-1.5", toneClass)}>
          <Icon size={13} />
        </span>
      </div>
      <p className="text-lg font-semibold text-heading tabular-nums">{value}</p>
      {sub && <p className="mt-1 truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

/** Small caption above a field. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="block text-xs text-muted">{children}</span>;
}
