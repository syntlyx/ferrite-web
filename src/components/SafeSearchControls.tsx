import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui";
import type { SafeSearchSettings, YoutubeRestrict } from "@/api/types";

const LEVELS: YoutubeRestrict[] = ["off", "moderate", "strict"];

/**
 * SafeSearch and YouTube Restricted Mode, for the whole network or one
 * profile. `floor` is the network-wide setting when editing a profile: a
 * profile can only be stricter, so anything looser is shown as taken and
 * can't be picked.
 */
export function SafeSearchControls({
  value,
  onChange,
  floor,
  disabled,
}: {
  value: SafeSearchSettings;
  onChange: (next: SafeSearchSettings) => void;
  floor?: SafeSearchSettings;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const searchForced = !!floor?.safe_search;
  const floorLevel = LEVELS.indexOf(floor?.youtube_restricted ?? "off");
  const level = Math.max(LEVELS.indexOf(value.youtube_restricted), floorLevel);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-body">
            {t("safesearch.search_label", {
              defaultValue: "SafeSearch on Google, Bing and DuckDuckGo",
            })}
          </p>
          {searchForced && (
            <p className="mt-0.5 text-[11px] text-muted">
              {t("safesearch.network_on", { defaultValue: "On for the whole network" })}
            </p>
          )}
        </div>
        <Switch
          checked={value.safe_search || searchForced}
          disabled={disabled || searchForced}
          onCheckedChange={(v) => onChange({ ...value, safe_search: v })}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-body">
          {t("safesearch.youtube_label", { defaultValue: "YouTube Restricted Mode" })}
        </p>
        <div className="inline-flex self-start rounded-xs border border-bdr/70 p-0.5">
          {LEVELS.map((lvl, i) => {
            const active = i === level;
            const locked = i < floorLevel;
            return (
              <button
                key={lvl}
                type="button"
                aria-pressed={active}
                disabled={disabled || locked}
                onClick={() => onChange({ ...value, youtube_restricted: lvl })}
                title={
                  locked
                    ? t("safesearch.network_on", { defaultValue: "On for the whole network" })
                    : undefined
                }
                className={cn(
                  "rounded-xs px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed",
                  active
                    ? "bg-ember/12 text-ember"
                    : locked
                      ? "text-muted/40"
                      : "text-muted hover:text-ember",
                )}
              >
                {t(`safesearch.level_${lvl}`, { defaultValue: lvl })}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
