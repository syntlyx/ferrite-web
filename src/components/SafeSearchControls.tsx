import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui";
import type { SafeSearchSettings, YoutubeRestrict } from "@/api/types";
import { Segmented } from "@/components/ui/segmented";

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
        <Segmented
          className="self-start"
          disabled={disabled}
          value={LEVELS[level]}
          onChange={(lvl) => onChange({ ...value, youtube_restricted: lvl })}
          options={LEVELS.map((lvl, i) => ({
            value: lvl,
            label: t(`safesearch.level_${lvl}`, { defaultValue: lvl }),
            // Below the network's own level: a profile can only be stricter.
            disabled: i < floorLevel,
            title:
              i < floorLevel
                ? t("safesearch.network_on", { defaultValue: "On for the whole network" })
                : undefined,
          }))}
        />
      </div>
    </div>
  );
}
