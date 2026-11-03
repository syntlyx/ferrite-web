import { cn } from "@/lib/utils";
import type { MouseEventHandler, ReactNode } from "react";

interface ThProps {
  children?: ReactNode;
  className?: string;
}

interface TdProps {
  children?: ReactNode;
  className?: string;
}

interface TableRowProps {
  children?: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLTableRowElement>;
}

interface EmptyRowProps {
  cols: number;
  message?: string;
}

export function Th({ children, className }: ThProps) {
  return (
    <th className={cn("px-3 py-3 text-left text-xs font-medium text-muted sm:px-4", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: TdProps) {
  return <td className={cn("px-3 py-2.5 sm:px-4", className)}>{children}</td>;
}

export function TableRow({ children, className, onClick }: TableRowProps) {
  return (
    <tr
      className={cn("border-b border-bdr/60 transition-colors hover:bg-white/3", className)}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function EmptyRow({ cols, message = "No data" }: EmptyRowProps) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-10 text-center text-xs text-muted">
        {message}
      </td>
    </tr>
  );
}
