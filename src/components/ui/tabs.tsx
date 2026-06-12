import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export function Tabs({ children, ...props }: TabsPrimitive.TabsProps) {
  return <TabsPrimitive.Root {...props}>{children}</TabsPrimitive.Root>;
}

export function TabsContent({ children, ...props }: TabsPrimitive.TabsContentProps) {
  return <TabsPrimitive.Content {...props}>{children}</TabsPrimitive.Content>;
}

export function TabsList({ children, className, ...props }: TabsPrimitive.TabsListProps) {
  return (
    <TabsPrimitive.List
      className={cn(
        "control-surface-muted rounded-xs border-bdr/75 flex w-fit gap-1 border p-1",
        className,
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ value, children }: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="rounded-xs text-muted hover:text-body data-[state=active]:bg-ember-dim data-[state=active]:text-ember px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.07em] transition-colors data-[state=active]:shadow-[inset_0_-1.5px_0_var(--color-ember)]"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}
