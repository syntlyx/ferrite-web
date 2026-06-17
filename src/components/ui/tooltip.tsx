import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight hover/focus tooltip.
 *
 * The bubble is rendered in a portal on `document.body`, not as a descendant of
 * the trigger. That matters because the lists table lives inside cards/scroll
 * containers with `overflow` and `transform`/`filter` — and a `position: fixed`
 * element nested under a transformed ancestor is positioned relative to (and
 * clipped by) that ancestor, not the viewport. Portalling to the body sidesteps
 * both: the bubble is measured after mount and placed against the viewport,
 * centered over the trigger, flipped below if there's no room above, and clamped
 * to the screen edges so it never gets cut off.
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
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const t = triggerRef.current?.getBoundingClientRect();
    const b = bubbleRef.current?.getBoundingClientRect();
    if (!t || !b) return;
    const gap = 8;
    // Prefer above the trigger; flip below when it would clip the top edge.
    let top = t.top - b.height - gap;
    if (top < gap) top = t.bottom + gap;
    // Centre horizontally over the trigger, clamped to the viewport.
    const center = t.left + t.width / 2 - b.width / 2;
    const left = Math.max(gap, Math.min(center, window.innerWidth - b.width - gap));
    setCoords({ left, top });
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex"
        tabIndex={0}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            role="tooltip"
            style={{
              left: coords?.left ?? 0,
              top: coords?.top ?? 0,
              // Hidden for the one layout pass before its size is measured, so it
              // never flashes at the top-left corner.
              visibility: coords ? "visible" : "hidden",
            }}
            className={cn(
              "rounded-xs border-bdr bg-card text-heading pointer-events-none fixed z-50 border px-2.5 py-1.5 text-[11px] leading-relaxed shadow-lg",
              className,
            )}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
