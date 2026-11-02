import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Copy text to the clipboard. The panel is often served over plain http on
 *  the LAN, where `navigator.clipboard` doesn't exist, so fall back to a
 *  hidden textarea and `execCommand`. */
export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const el = Object.assign(document.createElement("textarea"), {
      value: text,
      style: "position:fixed;opacity:0;pointer-events:none",
    });
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    if (ok) resolve();
    else reject(new Error("Copy failed"));
  });
}

/**
 * A manual block/allow entry as the server stores it: names lower-cased, a
 * `/regex/` kept as typed — lower-casing it would turn `\D` into `\d`.
 */
export function normalizeEntry(value: string): string {
  const v = value.trim();
  return /^\/.+\/$/.test(v) ? v : v.toLowerCase();
}
