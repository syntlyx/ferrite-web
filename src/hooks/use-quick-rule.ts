import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api";
import { useToast } from "@/hooks/use-toast";

export type QuickRuleKind = "block" | "allow";

/** The domain as the server keys manual entries: lowercase, no root dot. */
const normalise = (domain: string) => domain.trim().toLowerCase().replace(/\.$/, "");

/**
 * Block or allow a domain in one click, from wherever it is on screen — the
 * query log, the dashboard's top lists. It lands in the manual blacklist or
 * whitelist like an entry typed on the Blocklist page, and the toast offers an
 * undo. An entry that already exists is reported rather than added again, so
 * undo can never remove something the operator put there earlier.
 */
export function useQuickRule() {
  const { t } = useTranslation();
  const toast = useToast();

  return useCallback(
    async (rawDomain: string, kind: QuickRuleKind) => {
      const domain = normalise(rawDomain);
      const block = kind === "block";
      try {
        const existing = block
          ? (await api.getBlacklist()).blacklist
          : (await api.getWhitelist()).whitelist;
        if (existing.includes(domain)) {
          toast(
            t(block ? "quick.already_blocked" : "quick.already_allowed", {
              domain,
              defaultValue: block
                ? "{{domain}} is already on the blacklist"
                : "{{domain}} is already on the whitelist",
            }),
          );
          return;
        }
        await (block ? api.addBlacklist(domain) : api.addWhitelist(domain));
        toast(
          t(block ? "quick.blocked" : "quick.allowed", {
            domain,
            defaultValue: block ? "{{domain}} blocked" : "{{domain}} allowed",
          }),
          "success",
          6000,
          {
            label: t("common.undo", { defaultValue: "Undo" }),
            onClick: () => {
              (block ? api.removeBlacklist(domain) : api.removeWhitelist(domain))
                .then(() =>
                  toast(t("quick.undone", { domain, defaultValue: "Undone: {{domain}}" })),
                )
                .catch((e: Error) => toast(e.message, "error"));
            },
          },
        );
      } catch (e) {
        toast((e as Error).message, "error");
      }
    },
    [t, toast],
  );
}
