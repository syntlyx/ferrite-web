import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className={cn("relative inline-flex", className)}>
      <select
        className="border-bdr/90 bg-sidebar/90 text-body hover:border-ember/35 focus:border-ember focus:ring-ember/15 rounded-xs h-9 w-full cursor-pointer appearance-none border pl-3 pr-8 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors focus:outline-none focus:ring-2"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={12}
        className="text-muted pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
      />
    </div>
  );
}
