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
      <div className="border-bdr/60 flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="border-ember/15 bg-ember/10 text-ember rounded-xs shrink-0 border p-2">
            <Icon size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-heading text-sm font-semibold">{title}</p>
            {sub && <p className="text-muted mt-0.5 text-xs leading-relaxed">{sub}</p>}
          </div>
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>
      <div className="divide-bdr/55 divide-y px-4">{children}</div>
      {footer && <div className="border-bdr/55 bg-void/20 border-t px-4 py-3">{footer}</div>}
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
          <p className="text-heading text-sm font-medium">{label}</p>
          {badge}
        </div>
        {sub && <p className="text-muted mt-0.5 text-xs leading-relaxed">{sub}</p>}
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
        <p className="text-heading text-sm font-medium">{label}</p>
        {sub && <p className="text-muted mt-0.5 text-xs leading-relaxed">{sub}</p>}
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
    <span className="bg-ember/10 text-ember rounded-full px-2 py-0.5 text-[10px] font-medium">
      {labelSet}
    </span>
  ) : (
    <span className="bg-bdr text-muted rounded-full px-2 py-0.5 text-[10px] font-medium">
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
    <div className="control-surface border-bdr/75 rounded-xs border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-muted font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
          {label}
        </p>
        <span className={cn("rounded-xs border p-1.5", toneClass)}>
          <Icon size={13} />
        </span>
      </div>
      <p className="text-heading text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-muted mt-1 truncate text-[11px]">{sub}</p>}
    </div>
  );
}

/** Tiny uppercase caption above a field. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-muted block text-[10px] uppercase tracking-wider">{children}</span>;
}
