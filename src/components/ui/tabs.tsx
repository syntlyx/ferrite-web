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
      className={cn("flex w-fit gap-0.5 rounded-lg border border-bdr bg-void/40 p-0.5", className)}
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
      className="rounded-md px-3 py-1 text-[13px] font-medium text-muted transition-colors hover:text-body data-[state=active]:bg-raised data-[state=active]:text-heading"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}
