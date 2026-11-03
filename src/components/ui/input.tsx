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
        "h-9 rounded-lg border border-bdr bg-void/50 px-3 text-[13px] text-heading transition-colors placeholder:text-muted hover:border-ember/35 focus:border-ember focus:ring-2 focus:ring-ember/15 focus:outline-none",
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
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        />
      )}
      <Input className={cn("w-full", Icon ? "pl-8" : "", inputClass)} {...props} />
    </div>
  );
}
