import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className={cn("relative inline-flex", className)}>
      <select
        className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-bdr bg-void/50 pr-8 pl-3 text-[13px] text-body transition-colors hover:border-ember/35 focus:border-ember focus:ring-2 focus:ring-ember/15 focus:outline-none"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
