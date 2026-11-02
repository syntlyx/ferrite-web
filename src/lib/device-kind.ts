import {
  Camera,
  Cpu,
  Gamepad2,
  Laptop,
  Monitor,
  MonitorSmartphone,
  Printer,
  Router,
  Server,
  Smartphone,
  Speaker,
  Tablet,
  Tv,
  Watch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type DeviceKind =
  | "phone"
  | "tablet"
  | "laptop"
  | "desktop"
  | "tv"
  | "speaker"
  | "router"
  | "server"
  | "printer"
  | "watch"
  | "camera"
  | "console"
  | "iot"
  | "unknown";

/**
 * Guess what kind of device a client is from its name — a PTR hostname, an
 * mDNS name or an alias. Hostnames carry the hint more often than not
 * (`alexs-iphone`, `mac-mini`, `archer-c80`, `living-room-tv`); when nothing
 * matches the device stays "unknown" rather than being guessed into a box.
 *
 * Order matters: the more specific pattern goes first (`mac-mini` before
 * `mac`, `ipad` before `pad`).
 */
const RULES: [RegExp, DeviceKind][] = [
  [/ipad|tablet|galaxy-?tab|\btab-?s\d/, "tablet"],
  [/iphone|android|pixel|galaxy|phone|redmi|oneplus|xiaomi|huawei|\b[asm]\d{2}\b/, "phone"],
  [/watch/, "watch"],
  // Power gear named like a PC (`power-tower-bms`) before the desktop rule sees "tower".
  [/\bbms\b|inverter|\bups\b|solar|battery/, "iot"],
  [/mac-?mini|imac|mac-?pro|mac-?studio|desktop|tower|\bpc\b|workstation/, "desktop"],
  [/macbook|laptop|notebook|thinkpad|\bxps\b|zenbook|surface|mac\b|mac$/, "laptop"],
  [/\btv\b|tv$|^tv|firetv|fire-?stick|chromecast|appletv|apple-?tv|roku|shield|bravia|webos|tizen/, "tv"],
  [/sonos|homepod|echo|alexa|speaker|audiocast|soundbar|\bjbl\b|bose|nest-?(mini|audio)/, "speaker"],
  [/router|unifi|archer|mikrotik|openwrt|gateway|keenetic|asus-?rt|tp-?link|\bap\b|access-?point|mesh/, "router"],
  [/\bnas\b|synology|qnap|truenas|unraid|server|proxmox|\bpve\b|raspberry|\brpi\b|\bpi\d?\b/, "server"],
  [/printer|epson|brother|canon|laserjet|officejet/, "printer"],
  // Tapo cameras announce themselves by model alone: c100, c200, c310…
  [/camera|\bcam\b|cam\d|doorbell|ring-|hikvision|reolink|tapo-c|^c[1-5]\d{2}$/, "camera"],
  [/\bps[45]\b|playstation|xbox|nintendo|switch|steam-?deck/, "console"],
  [/espressif|esp\d|esp-|airvisual|thermostat|purifier|tasmota|shelly|sonoff|tuya|zigbee|hue|smart-?plug|vacuum|roborock|miio|yeelight/, "iot"],
];

export function deviceKind(name: string): DeviceKind {
  const n = name.toLowerCase();
  // A bare IP address says nothing about the device behind it.
  if (/^[\d.]+$/.test(n) || n.includes(":")) return "unknown";
  for (const [re, kind] of RULES) if (re.test(n)) return kind;
  return "unknown";
}

export const DEVICE_ICON: Record<DeviceKind, LucideIcon> = {
  phone: Smartphone,
  tablet: Tablet,
  laptop: Laptop,
  desktop: Monitor,
  tv: Tv,
  speaker: Speaker,
  router: Router,
  server: Server,
  printer: Printer,
  watch: Watch,
  camera: Camera,
  console: Gamepad2,
  iot: Cpu,
  unknown: MonitorSmartphone,
};
