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
        <h1 className="text-heading text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-muted mt-0.5 text-xs">{subtitle}</p>}
      </div>
      {action && <div className="max-w-full shrink-0 *:flex-wrap">{action}</div>}
    </div>
  );
}
