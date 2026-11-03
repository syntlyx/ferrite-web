import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type TagTone = "ember" | "blocked" | "cached" | "upstream" | "routed" | "warn" | "muted";

const TONE: Record<TagTone, string> = {
  ember: "bg-ember/10 text-ember",
  blocked: "bg-blocked/10 text-blocked",
  cached: "bg-cached/10 text-cached",
  upstream: "bg-upstream/10 text-upstream",
  routed: "bg-routed/10 text-routed",
  warn: "bg-warn/10 text-warn",
  muted: "bg-white/5 text-muted",
};

/**
 * A small status mark beside a name — "new", "alias", "On now", a query's
 * status. Every such mark in the panel is this one shape, only the tone varies.
 */
export function Tag({
  tone = "muted",
  title,
  className,
  children,
}: {
  tone?: TagTone;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center rounded-xs border border-current/15 px-1.5 py-0.5 font-mono text-[10px] font-medium",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

type BadgeStatus = "allowed" | "blocked" | "cached" | "upstream" | "routed";

const STATUS_TONE: Record<BadgeStatus, TagTone> = {
  allowed: "ember",
  blocked: "blocked",
  cached: "cached",
  upstream: "upstream",
  routed: "routed",
};

export function Badge({ status }: { status: BadgeStatus }) {
  const { t } = useTranslation();
  return (
    <Tag tone={STATUS_TONE[status] ?? "muted"}>
      {t(`queries.status_${status}`, { defaultValue: status })}
    </Tag>
  );
}
