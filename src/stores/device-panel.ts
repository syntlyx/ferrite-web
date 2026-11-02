import { useSyncExternalStore } from "react";
import { closeDomainPanel } from "@/stores/domain-panel";

/**
 * Which device the side panel shows, if any. Any of its MACs, IPs or name is
 * enough — the panel finds the device they belong to. One side panel at a
 * time: opening this one closes the domain panel, and the other way round.
 */
export interface DevicePanelTarget {
  macs?: string[];
  ips?: string[];
  name?: string;
}

let target: DevicePanelTarget | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function openDevicePanel(next: DevicePanelTarget) {
  closeDomainPanel();
  target = next;
  emit();
}

export function closeDevicePanel() {
  if (!target) return;
  target = null;
  emit();
}

export function useDevicePanel(): DevicePanelTarget | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => target,
  );
}
