import { cn } from "@/lib/utils";

interface FerriteMarkProps {
  className?: string;
}

interface FerriteBrandProps {
  collapsed?: boolean;
  className?: string;
  markClassName?: string;
}

export function FerriteMark({ className }: FerriteMarkProps) {
  return (
    <span
      className={cn(
        "rounded-xs border-ember/30 relative inline-flex shrink-0 items-center justify-center overflow-hidden border bg-void shadow-[0_0_24px_rgba(255,106,56,0.22)]",
        className,
      )}
    >
      <img src="/ferrite-mark.svg" alt="" className="h-full w-full object-cover" />
    </span>
  );
}

export function FerriteBrand({ collapsed, className, markClassName }: FerriteBrandProps) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <FerriteMark className={cn("h-8 w-8", markClassName)} />
      {!collapsed && (
        <span className="min-w-0">
          <span className="display-title text-heading block text-base">ferrite</span>
        </span>
      )}
    </span>
  );
}
