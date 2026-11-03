import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Shown on hover — say why a disabled option can't be picked. */
  title?: string;
  disabled?: boolean;
}

interface SegmentedProps<T extends string | number> {
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  /** `md` sits beside inputs (same height); `sm` fits a card header. */
  size?: "sm" | "md";
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * One choice out of a few, in the panel's one look for it: the chosen segment
 * sits raised, the others are muted text. Every such control uses this, so a
 * time range, a record type and a view mode all read the same way.
 */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = "md",
  disabled,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex w-fit shrink-0 gap-0.5 rounded-lg",
        size === "md" && "border border-bdr bg-void/40 p-0.5",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            disabled={disabled || o.disabled}
            title={o.title}
            onClick={() => !active && onChange(o.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              size === "sm" ? "h-6 px-2 text-xs" : "h-8 px-3 text-[13px]",
              active ? "bg-raised text-heading" : "text-muted hover:text-heading",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
