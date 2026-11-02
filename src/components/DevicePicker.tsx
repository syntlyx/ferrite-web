import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { deviceTokens } from "@/api/clients";
import { DEVICE_ICON, deviceKind } from "@/lib/device-kind";
import type { ClientEntry } from "@/api/types";

/** Up to this many devices, every one is a chip; past it the picker condenses. */
const ALL_CHIPS_UP_TO = 16;
/** Unselected devices shown before "N more" while condensed. */
const PREVIEW = 12;

/**
 * Pick devices for a scope — a blocking profile or a routing rule. A device is
 * "in" when any of its tokens (MAC preferred, else IPs) is in `scoped`, so it
 * stays selected across every address it uses. Shared by the profiles and the
 * Tunnels rules so the two scopes look and behave the same.
 *
 * A household of a few devices gets every one as a chip. A busy network gets
 * the chosen ones first, a search box, and a short preview of the rest — fifty
 * chips per scope was a wall.
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
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);

  const isOn = (c: ClientEntry) =>
    deviceTokens(c).some((tok) => scoped.includes(tok.toLowerCase()));

  const chip = (c: ClientEntry) => {
    const on = isOn(c);
    const Icon = DEVICE_ICON[deviceKind(c.name)];
    return (
      <button
        key={c.name}
        type="button"
        onClick={() => onToggle(c)}
        title={c.ips.join(", ")}
        aria-pressed={on}
        className={cn(
          "flex items-center gap-1.5 rounded-xs border px-2 py-1 font-mono text-[11px] transition-colors",
          on
            ? "border-ember/40 bg-ember/10 text-ember"
            : "border-bdr/70 text-muted hover:border-ember/40 hover:text-ember",
        )}
      >
        <Icon size={11} className={cn("shrink-0", on ? "opacity-90" : "opacity-60")} />
        {c.name}
      </button>
    );
  };

  if (clients.length <= ALL_CHIPS_UP_TO) {
    return <div className="flex flex-wrap gap-1.5">{clients.map(chip)}</div>;
  }

  const selected = clients.filter(isOn);
  const others = clients.filter((c) => !isOn(c));
  const q = filter.trim().toLowerCase();
  const matching = q
    ? others.filter((c) => c.name.toLowerCase().includes(q) || c.ips.some((ip) => ip.includes(q)))
    : others;
  const shown = q || showAll ? matching : matching.slice(0, PREVIEW);
  const hidden = matching.length - shown.length;

  return (
    <div className="space-y-2">
      {selected.length > 0 && <div className="flex flex-wrap gap-1.5">{selected.map(chip)}</div>}
      <div className="flex max-w-xs items-center gap-2 rounded-xs border border-bdr/70 px-2">
        <Search size={12} className="shrink-0 text-muted" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("devices.find", { defaultValue: "Find a device…" })}
          className="h-7 min-w-0 flex-1 bg-transparent text-[11px] text-body outline-none placeholder:text-muted"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shown.map(chip)}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="px-1.5 py-1 text-[11px] text-muted transition-colors hover:text-ember"
          >
            {t("devices.more", { count: hidden, defaultValue: "+{{count}} more" })}
          </button>
        )}
        {showAll && !q && matching.length > PREVIEW && (
          <button
            type="button"
            onClick={() => setShowAll(false)}
            className="px-1.5 py-1 text-[11px] text-muted transition-colors hover:text-ember"
          >
            {t("devices.fewer", { defaultValue: "Show fewer" })}
          </button>
        )}
        {q && matching.length === 0 && (
          <span className="py-1 text-[11px] text-muted">
            {t("devices.none_match", { defaultValue: "No device matches." })}
          </span>
        )}
      </div>
    </div>
  );
}
