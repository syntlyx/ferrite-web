import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Standard page wrapper: uniform responsive padding + a max content width so
 * every page sits on the same horizontal rhythm inside the wide app shell.
 * Match across all pages — do not pad pages by hand.
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return <div className={cn("max-w-385 mx-auto p-4 sm:p-5 lg:p-6", className)}>{children}</div>;
}
