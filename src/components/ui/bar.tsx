import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface BarProps {
  value: number;
  color?: string;
  className?: string;
}

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
}

// Horizontal progress-bar (value 0–100)
export function Bar({ value, color = "bg-ember", className }: BarProps) {
  return (
    <div className={cn("bg-bdr/80 h-1 overflow-hidden rounded-[1px]", className)}>
      <div
        className={cn("h-full rounded-[1px] transition-all", color)}
        style={{ width: `${Math.min(100, value ?? 0)}%` }}
      />
    </div>
  );
}

export function StatusDot({ status }: { status: string }) {
  const c: Record<string, string> = {
    allowed: "bg-ember",
    blocked: "bg-blocked",
    cached: "bg-cached",
    upstream: "bg-upstream",
  };
  return <span className={cn("inline-block h-1.5 w-1.5", c[status] ?? "bg-muted")} />;
}

export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <p
      className={cn(
        "text-muted mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em]",
        className,
      )}
    >
      {children}
    </p>
  );
}
