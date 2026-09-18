import { EyeOff } from "lucide-react";
import type { ReactNode } from "react";

interface NoticeProps {
  children: ReactNode;
}

/**
 * Neutral informational banner: a page is showing less than usual *by design*.
 * Deliberately not styled like `Err` — a switched-off query log is a setting
 * working as asked, not a fault the operator should go and fix.
 */
export function Notice({ children }: NoticeProps) {
  return (
    <div className="border-bdr/70 bg-sidebar/60 text-muted rounded-xs mb-4 flex items-start gap-2 border px-3 py-2.5 text-xs">
      <EyeOff size={13} className="mt-px shrink-0" />
      <span className="wrap-break-word min-w-0">{children}</span>
    </div>
  );
}
