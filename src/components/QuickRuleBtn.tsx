import { Ban, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useQuickRule } from "@/hooks/use-quick-rule";
import type { QuickRuleKind } from "@/hooks/use-quick-rule";

/**
 * A one-click block or allow for `domain`. Shown on hover where a pointer can
 * hover, always on touch screens. Swallows the click so it can sit inside a
 * clickable row.
 */
export function QuickRuleBtn({
  domain,
  kind,
  className,
}: {
  domain: string;
  kind: QuickRuleKind;
  className?: string;
}) {
  const { t } = useTranslation();
  const apply = useQuickRule();
  const block = kind === "block";
  const label = block
    ? t("quick.block", { defaultValue: "Block" })
    : t("quick.allow", { defaultValue: "Allow" });
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void apply(domain, kind);
      }}
      title={`${label} ${domain}`}
      aria-label={`${label} ${domain}`}
      className={cn(
        "text-muted ml-1 inline-flex shrink-0 opacity-0 transition-all group-hover:opacity-100 [@media(hover:none)]:opacity-100",
        block ? "hover:text-blocked" : "hover:text-cached",
        className,
      )}
    >
      {block ? <Ban size={11} /> : <ShieldCheck size={11} />}
    </button>
  );
}
