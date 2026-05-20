import { cn } from "@/lib/utils";

type BadgeStatus = "allowed" | "blocked" | "cached" | "upstream";

interface BadgeProps {
  status: BadgeStatus;
}

export function Badge({ status }: BadgeProps) {
  const map: Record<BadgeStatus, string> = {
    allowed: "bg-teal/10 text-teal",
    blocked: "bg-blocked/10 text-blocked",
    cached: "bg-cached/10 text-cached",
    upstream: "bg-upstream/10 text-upstream",
  };
  return (
    <span
      className={cn(
        "rounded-md border border-current/10 px-1.5 py-0.5 text-xs font-medium",
        map[status] ?? "bg-white/5 text-body",
      )}
    >
      {status}
    </span>
  );
}
