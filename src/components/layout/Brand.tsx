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
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-void",
        className,
      )}
    >
      <img src={`${import.meta.env.BASE_URL}ferrite-mark.svg`} alt="" className="h-full w-full object-cover" />
    </span>
  );
}

export function FerriteBrand({ collapsed, className, markClassName }: FerriteBrandProps) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <FerriteMark className={cn("h-8 w-8", markClassName)} />
      {!collapsed && (
        <span className="min-w-0">
          <span className="block text-[17px] font-semibold tracking-[-0.01em] text-heading">
            ferrite
          </span>
        </span>
      )}
    </span>
  );
}
