import { useSyncExternalStore } from "react";
import { closeDevicePanel } from "@/stores/device-panel";

/**
 * Which domain the side panel shows, if any — one panel for the whole app, so
 * the query log, the dashboard and the command palette all open the same one.
 */
export interface DomainPanelTarget {
  domain: string;
  /** The device the domain was seen from, for its own decision. */
  client?: string;
}

let target: DomainPanelTarget | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function openDomainPanel(domain: string, client?: string) {
  closeDevicePanel();
  target = { domain: domain.trim().toLowerCase().replace(/\.$/, ""), client };
  emit();
}

export function closeDomainPanel() {
  if (!target) return;
  target = null;
  emit();
}

export function useDomainPanel(): DomainPanelTarget | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => target,
  );
}
