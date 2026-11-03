import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DEMO_WRITE_EVENT } from "./events";

/**
 * The strip across the top of the demo build: sample data, nothing is saved,
 * and the way to the real thing. A change made anywhere in the panel gets a
 * short note that the demo didn't keep it.
 */
export function DemoBanner() {
  const { t } = useTranslation();
  const toast = useToast();

  useEffect(() => {
    const onWrite = () => toast(t("demo.not_saved"), "success", 2500);
    window.addEventListener(DEMO_WRITE_EVENT, onWrite);
    return () => window.removeEventListener(DEMO_WRITE_EVENT, onWrite);
  }, [t, toast]);

  return (
    <div className="flex items-center gap-2 border-b border-ember/25 bg-ember/10 px-4 py-2 text-xs text-body">
      <FlaskConical size={13} className="shrink-0 text-ember" />
      <span className="min-w-0 flex-1">{t("demo.banner")}</span>
      <a
        href="/download.html"
        className="shrink-0 font-semibold text-ember transition-colors hover:text-heading"
      >
        {t("demo.install")}
      </a>
    </div>
  );
}
