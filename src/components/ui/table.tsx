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
    <th
      className={cn(
        "text-muted px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: TdProps) {
  return <td className={cn("px-4 py-2.5", className)}>{children}</td>;
}

export function TableRow({ children, className, onClick }: TableRowProps) {
  return (
    <tr
      className={cn("border-bdr/40 hover:bg-white/3 border-b transition-colors", className)}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function EmptyRow({ cols, message = "No data" }: EmptyRowProps) {
  return (
    <tr>
      <td colSpan={cols} className="text-muted px-4 py-10 text-center text-xs">
        {message}
      </td>
    </tr>
  );
}
