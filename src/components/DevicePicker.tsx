import { cn } from "@/lib/utils";
import { deviceTokens } from "@/api/clients";
import { DEVICE_ICON, deviceKind } from "@/lib/device-kind";
import type { ClientEntry } from "@/api/types";

/**
 * Pick devices for a scope — a blocking profile or a routing rule. A device is
 * "in" when any of its tokens (MAC preferred, else IPs) is in `scoped`, so it
 * stays selected across every address it uses. Shared by the Blocklist
 * profiles and the Tunnels rules so the two scopes look and behave the same.
 */
export function DevicePicker({
  clients,
  scoped,
  onToggle,
}: {
  clients: ClientEntry[];
  /** Lower-cased tokens currently in the scope. */
  scoped: string[];
  onToggle: (client: ClientEntry) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {clients.map((c) => {
        const tokens = deviceTokens(c).map((x) => x.toLowerCase());
        const on = tokens.some((tok) => scoped.includes(tok));
        const Icon = DEVICE_ICON[deviceKind(c.name)];
        return (
          <button
            key={c.name}
            type="button"
            onClick={() => onToggle(c)}
            title={c.ips.join(", ")}
            aria-pressed={on}
            className={cn(
              "rounded-xs flex items-center gap-1.5 border px-2 py-1 font-mono text-[11px] transition-colors",
              on
                ? "border-ember/40 bg-ember/10 text-ember"
                : "border-bdr/70 text-muted hover:border-ember/40 hover:text-ember",
            )}
          >
            <Icon size={11} className={cn("shrink-0", on ? "opacity-90" : "opacity-60")} />
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
