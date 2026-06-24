import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
  /** Stretch to the full width of the container (centred content). */
  block?: boolean;
};

type IconBtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
  spin?: boolean;
};

// Single source of truth for action-button looks. Emphasis is the `variant`
// (primary = the page's main action, ghost = secondary, danger = destructive);
// height is the `size`. Both controls and inputs share the same h-9 so they line
// up in a form row — don't reintroduce per-call height/width classes.
const VARIANTS = {
  primary:
    "bg-ember text-on-ember font-semibold shadow-[0_4px_14px_rgba(255,106,56,0.18)] hover:bg-ember-h",
  ghost:
    "border border-bdr/90 bg-panel/55 text-body font-medium hover:border-ember/35 hover:bg-white/[0.07] hover:text-heading",
  danger:
    "border border-bdr/90 bg-panel/45 text-body font-medium hover:border-blocked/40 hover:bg-blocked/6 hover:text-blocked",
};

const SIZES = {
  sm: "h-8 px-3 text-[11px]",
  md: "h-9 px-3.5 text-[11px]",
};

export function Btn({
  variant = "primary",
  size = "md",
  block,
  className,
  children,
  ...props
}: BtnProps) {
  return (
    <button
      className={cn(
        "rounded-xs inline-flex items-center justify-center gap-1.5 uppercase tracking-[0.08em] transition-colors disabled:opacity-40",
        SIZES[size],
        VARIANTS[variant],
        block && "w-full",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconBtn({ danger, spin, className, children, ...props }: IconBtnProps) {
  return (
    <button
      className={cn(
        "rounded-xs transition-colors disabled:opacity-30",
        danger ? "text-muted hover:text-blocked" : "text-muted hover:text-heading",
        className,
      )}
      {...props}
    >
      <span className={spin ? "inline-block animate-spin" : ""}>{children}</span>
    </button>
  );
}
