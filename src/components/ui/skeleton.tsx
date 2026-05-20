import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

/** Pulsing placeholder block. Use className to set h-* and w-* / rounded-*. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-bdr", className)} aria-hidden="true" />;
}
