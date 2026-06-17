/**
 * Curated catalog of well-known DNS blocklists, surfaced on the Lists page so
 * users can add popular lists in one click instead of hunting for URLs.
 *
 * Adding an entry goes through the normal POST /api/lists path (SSRF-validated,
 * format auto-detected, FST rebuilt), so nothing here needs server support.
 * All URLs are public https endpoints in hosts / Adblock / plain-domain format.
 */
export type CatalogCategory = "ads" | "tracking" | "malware";

export interface CatalogList {
  name: string;
  url: string;
  category: CatalogCategory;
  /** One-line description shown under the name. */
  desc: string;
}

export const LIST_CATALOG: CatalogList[] = [
  {
    name: "OISD Big",
    url: "https://big.oisd.nl",
    category: "ads",
    desc: "Ads, tracking & more — large, low false positives",
  },
  {
    name: "OISD Small",
    url: "https://small.oisd.nl",
    category: "ads",
    desc: "Lighter OISD list for low-memory setups",
  },
  {
    name: "HaGeZi Pro",
    url: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt",
    category: "ads",
    desc: "Balanced, popular all-round blocklist",
  },
  {
    name: "StevenBlack Unified",
    url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    category: "ads",
    desc: "Classic unified hosts: ads + malware",
  },
  {
    name: "AdGuard DNS Filter",
    url: "https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt",
    category: "ads",
    desc: "AdGuard's own DNS ad/tracker filter",
  },
  {
    name: "Peter Lowe's List",
    url: "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext",
    category: "tracking",
    desc: "Long-standing ad & tracking server list",
  },
  {
    name: "HaGeZi Threat Intel",
    url: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/tif.txt",
    category: "malware",
    desc: "Malware, phishing & scam domains",
  },
  {
    name: "URLhaus",
    url: "https://urlhaus.abuse.ch/downloads/hostfile/",
    category: "malware",
    desc: "abuse.ch list of malware-distributing hosts",
  },
];
