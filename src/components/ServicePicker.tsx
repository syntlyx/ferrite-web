import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { SERVICE_ICONS } from "@/data/service-icons";
import type { ServiceCatalog, ServiceInfo } from "@/api/types";

/** A service's mark from Simple Icons, or its first letter in a square when the
 *  set has no mark for it. Drawn in `currentColor`, so it takes the tone of
 *  whatever holds it. */
export function ServiceIcon({
  service,
  size = 14,
  className,
}: {
  service: Pick<ServiceInfo, "id" | "name">;
  size?: number;
  className?: string;
}) {
  const path = SERVICE_ICONS[service.id];
  if (path) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden
        className={cn("shrink-0", className)}
      >
        <path d={path} />
      </svg>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[3px] border border-current leading-none font-semibold",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}
    >
      {service.name.charAt(0)}
    </span>
  );
}

/** The hover text for a service: its caveat, if it has one, then its domains. */
function serviceTitle(s: ServiceInfo, note: string) {
  const domains = s.domains.join("\n");
  return note ? `${note}\n\n${domains}` : domains;
}

/**
 * Toggle catalog services on or off, grouped by category. Blocking uses it on
 * the Blocklist page (network-wide) and on every device profile, so a service
 * looks the same wherever it is chosen.
 */
export function ServicePicker({
  catalog,
  selected,
  onToggle,
  disabled,
}: {
  catalog: ServiceCatalog;
  /** Ids currently switched on. */
  selected: string[];
  onToggle: (service: ServiceInfo) => void;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div className="space-y-2.5">
      {catalog.categories.map((cat) => {
        const items = catalog.services.filter((s) => s.category === cat);
        if (items.length === 0) return null;
        return (
          <div
            key={cat}
            className="grid grid-cols-1 gap-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-3"
          >
            <span className="pt-1.5 font-mono text-[10px] tracking-widest text-muted uppercase">
              {t(`services.category.${cat}`, { defaultValue: cat })}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {items.map((s) => {
                const on = selected.includes(s.id);
                const noteKey = `services.note.${s.id}`;
                const note = i18n.exists(noteKey) ? t(noteKey) : "";
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggle(s)}
                    aria-pressed={on}
                    title={serviceTitle(s, note)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xs border px-2 py-1 text-[11px] transition-colors disabled:opacity-50",
                      on
                        ? "border-blocked/45 bg-blocked/10 text-blocked"
                        : "border-bdr/70 text-body hover:border-blocked/40 hover:text-blocked",
                    )}
                  >
                    <ServiceIcon service={s} size={12} className={on ? "" : "opacity-70"} />
                    {s.name}
                    {note && <span className="opacity-60">*</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
