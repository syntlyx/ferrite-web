import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight hover/focus tooltip.
 *
 * Uses `position: fixed` with coordinates measured on open so it escapes any
 * ancestor `overflow` clipping — the lists table lives inside an
 * `overflow-x-auto` card (which computes `overflow-y: auto`), so a plain
 * absolutely-positioned tooltip would be cropped. Recomputed on each open,
 * which is fine for a hover interaction.
 */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  function show() {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, y: r.top });
  }

  return (
    <span
      ref={ref}
      className="inline-flex"
      tabIndex={0}
      onMouseEnter={show}
      onFocus={show}
      onMouseLeave={() => setPos(null)}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos && (
        <span
          role="tooltip"
          style={{ left: pos.x, top: pos.y }}
          className={cn(
            "rounded-xs border-bdr bg-card text-heading pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+8px)] border px-2.5 py-1.5 text-[11px] leading-relaxed shadow-lg",
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
