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
      "bg-ember text-on-ember font-bold shadow-[0_10px_26px_rgba(255,106,56,0.28)] hover:bg-ember-h",
    ghost:
      "border border-bdr/90 bg-panel/55 text-body font-medium hover:border-ember/35 hover:bg-white/[0.07] hover:text-heading",
    danger:
      "border border-bdr/90 bg-panel/45 text-body font-medium hover:border-blocked/40 hover:bg-blocked/6 hover:text-blocked",
  };
  return (
    <button
      className={cn(
        "min-h-8 rounded-xs inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] uppercase tracking-[0.08em] transition-colors disabled:opacity-40",
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
