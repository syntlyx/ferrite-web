import { PanelRightOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { openDevicePanel, type DevicePanelTarget } from "@/stores/device-panel";

/**
 * Open the device side panel. Hover-revealed like the other row actions;
 * swallows the click so it can sit inside a clickable row.
 */
export function DeviceInfoBtn({
  device,
  label,
  className,
}: {
  device: DevicePanelTarget;
  /** What the device is called here, for the button's title. */
  label: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const title = `${t("device.open", { defaultValue: "Device details" })}: ${label}`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openDevicePanel(device);
      }}
      title={title}
      aria-label={title}
      className={cn(
        "ml-1 inline-flex shrink-0 text-muted opacity-0 transition-all group-hover:opacity-100 hover:text-ember [@media(hover:none)]:opacity-100",
        className,
      )}
    >
      <PanelRightOpen size={11} />
    </button>
  );
}
