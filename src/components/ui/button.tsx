import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

type IconBtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean;
  spin?: boolean;
};

export function Btn({ variant = "primary", className, children, ...props }: BtnProps) {
  const v = {
    primary:
      "bg-teal text-on-teal font-semibold shadow-[0_10px_24px_rgba(53,220,154,0.2)] hover:bg-teal-h",
    ghost:
      "border border-bdr/90 bg-panel/55 text-body hover:border-teal/30 hover:bg-white/[0.07] hover:text-heading",
    danger:
      "border border-bdr/90 bg-panel/45 text-body hover:border-blocked/40 hover:bg-blocked/6 hover:text-blocked",
  };
  return (
    <button
      className={cn(
        "min-h-8 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors disabled:opacity-40",
        v[variant],
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
        "rounded-md transition-colors disabled:opacity-30",
        danger ? "text-muted hover:text-blocked" : "text-muted hover:text-heading",
        className,
      )}
      {...props}
    >
      <span className={spin ? "inline-block animate-spin" : ""}>{children}</span>
    </button>
  );
}
