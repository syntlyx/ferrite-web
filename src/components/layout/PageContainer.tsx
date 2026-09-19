import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Standard page wrapper: uniform responsive padding, and the page fills the
 * column the shell gives it. The overall width is capped once, by the shell
 * (`max-w-420`), so collapsing the sidebar hands the freed space to the
 * content instead of growing dead margins around a narrower column.
 * Match across all pages — do not pad pages by hand.
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return <div className={cn("p-4 sm:p-5 lg:p-6", className)}>{children}</div>;
}
