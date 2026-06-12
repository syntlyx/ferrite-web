import { useEffect } from "react";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  useEffect(() => {
    document.title = `${title} · ferrite`;
    return () => {
      document.title = "ferrite";
    };
  }, [title]);

  return (
    <div className="border-bdr/60 mb-5 flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="display-title text-heading flex items-center gap-2.5 text-xl sm:text-2xl">
          <span className="bg-ember mt-0.5 h-4 w-1 shrink-0 shadow-[0_0_12px_var(--color-ember)]" />
          {title}
        </h1>
        {subtitle && <p className="text-muted mt-1 pl-3.5 text-xs">{subtitle}</p>}
      </div>
      {action && <div className="*:flex-wrap max-w-full shrink-0">{action}</div>}
    </div>
  );
}
