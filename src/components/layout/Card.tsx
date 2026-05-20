import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn("control-surface border-bdr/85 rounded-lg border p-5", className)}>
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
  accent?: "heading" | "teal" | "blocked" | "cached" | "upstream";
}) {
  const textColor = {
    heading: "text-heading",
    teal: "text-teal",
    blocked: "text-blocked",
    cached: "text-cached",
    upstream: "text-upstream",
  }[accent];
  return (
    <Card>
      <p className="text-muted mb-2 text-xs uppercase tracking-wider">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", textColor)}>{value ?? "—"}</p>
      {sub && <p className="text-muted mt-1 text-xs">{sub}</p>}
    </Card>
  );
}
