import type { ReactNode } from "react";
import { Card } from "./Card";

/**
 * Standard filter/toolbar row: a bordered panel holding a search box and any
 * extra controls, with an optional right-aligned `meta` slot (counts, ranges).
 * Shared across list pages so every filter bar reads the same — put the search
 * input and selects in as children; they line up on the shared h-9 control row.
 */
export function FilterBar({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <Card className="mb-4 p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        {children}
        {meta != null && (
          <div className="text-muted shrink-0 text-[11px] tabular-nums lg:ml-auto">{meta}</div>
        )}
      </div>
    </Card>
  );
}
