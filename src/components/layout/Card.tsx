import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn("control-surface rounded-xl border border-bdr p-5", className)}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent = "heading",
}: {
  label: string;
  value?: ReactNode;
  sub?: ReactNode;
  accent?: "heading" | "ember" | "blocked" | "cached" | "upstream";
}) {
  const textColor = {
    heading: "text-heading",
    ember: "text-ember",
    blocked: "text-blocked",
    cached: "text-cached",
    upstream: "text-upstream",
  }[accent];
  return (
    <Card>
      <p className="mb-1.5 text-[13px] text-muted">{label}</p>
      <p className={cn("display-title text-3xl tabular-nums", textColor)}>{value ?? "—"}</p>
      {sub && <p className="mt-1.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}
