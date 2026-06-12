import { cn } from "@/lib/utils";

type BadgeStatus = "allowed" | "blocked" | "cached" | "upstream";

interface BadgeProps {
  status: BadgeStatus;
}

export function Badge({ status }: BadgeProps) {
  const map: Record<BadgeStatus, string> = {
    allowed: "bg-ember/10 text-ember",
    blocked: "bg-blocked/10 text-blocked",
    cached: "bg-cached/10 text-cached",
    upstream: "bg-upstream/10 text-upstream",
  };
  return (
    <span
      className={cn(
        "rounded-xs border-current/15 border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em]",
        map[status] ?? "text-body bg-white/5",
      )}
    >
      {status}
    </span>
  );
}
