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
        "control-surface-muted flex w-fit gap-1 rounded-md border border-bdr/75 p-1",
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
      className="rounded px-3 py-1 text-xs font-medium text-muted transition-colors hover:text-body data-[state=active]:bg-teal-dim data-[state=active]:text-teal data-[state=active]:shadow-sm"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}
