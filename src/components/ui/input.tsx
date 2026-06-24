import { cn } from "@/lib/utils";
import type { ComponentType, InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

type SearchInputProps = InputHTMLAttributes<HTMLInputElement> & {
  icon?: ComponentType<{ size?: number; className?: string }>;
  inputClass?: string;
};

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "border-bdr/90 bg-sidebar/90 text-heading placeholder:text-muted hover:border-ember/35 focus:border-ember focus:ring-ember/15 rounded-xs h-9 border px-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors focus:outline-none focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}

export function SearchInput({ icon: Icon, className, inputClass, ...props }: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      {Icon && (
        <Icon
          size={13}
          className="text-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        />
      )}
      <Input className={cn("w-full", Icon ? "pl-8" : "", inputClass)} {...props} />
    </div>
  );
}
