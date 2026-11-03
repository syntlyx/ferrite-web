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
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="display-title text-2xl text-heading sm:text-[28px] sm:leading-tight">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action && <div className="max-w-full shrink-0 *:flex-wrap">{action}</div>}
    </div>
  );
}
