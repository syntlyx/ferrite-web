import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn("control-surface border-bdr/85 rounded-xs border p-5", className)}>
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
  const tickColor = {
    heading: "bg-muted/60",
    ember: "bg-ember",
    blocked: "bg-blocked",
    cached: "bg-cached",
    upstream: "bg-upstream",
  }[accent];
  return (
    <Card className="plate-ticks">
      <p className="text-muted mb-2.5 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
        <span className={cn("h-1.5 w-1.5 shrink-0", tickColor)} />
        {label}
      </p>
      <p className={cn("display-title text-3xl tabular-nums", textColor)}>{value ?? "—"}</p>
      {sub && <p className="text-muted mt-1.5 text-xs">{sub}</p>}
    </Card>
  );
}
