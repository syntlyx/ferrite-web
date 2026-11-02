import { PanelRightOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { openDomainPanel } from "@/stores/domain-panel";

/**
 * Open the domain side panel for `domain` (seen from `client`, if known).
 * Hover-revealed like the other row actions; swallows the click so it can sit
 * inside a clickable row.
 */
export function DomainInfoBtn({
  domain,
  client,
  className,
}: {
  domain: string;
  client?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = t("domain.open", { defaultValue: "Details" });
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openDomainPanel(domain, client);
      }}
      title={`${label}: ${domain}`}
      aria-label={`${label}: ${domain}`}
      className={cn(
        "ml-1 inline-flex shrink-0 text-muted opacity-0 transition-all group-hover:opacity-100 hover:text-ember [@media(hover:none)]:opacity-100",
        className,
      )}
    >
      <PanelRightOpen size={11} />
    </button>
  );
}
