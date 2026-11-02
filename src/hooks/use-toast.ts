import { createContext, use } from "react";

export type ToastType = "success" | "error";
/** A button on the toast — "Undo" after a one-click change. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}
export type ToastFn = (
  message: string,
  type?: ToastType,
  duration?: number,
  action?: ToastAction,
) => void;

/** Shared context — value is set by ToastProvider */
export const ToastContext = createContext<ToastFn | null>(null);

/** Returns `toast(message, type?)` */
export function useToast() {
  const ctx = use(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
