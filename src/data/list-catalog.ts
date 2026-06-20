/**
 * Curated catalog of well-known DNS blocklists, surfaced on the Lists page so
 * users can add popular lists in one click instead of hunting for URLs.
 *
 * Adding an entry goes through the normal POST /api/lists path (SSRF-validated,
 * format auto-detected, FST rebuilt), so nothing here needs server support.
 * All URLs are public https endpoints in hosts / Adblock / plain-domain format.
 *
 * Category guide:
 *   general  — all-in-one lists (ads + tracking + malware + phishing). Pick one.
 *   ads      — focused ad blocking, low false positives.
 *   tracking — trackers, telemetry, analytics.
 *   malware  — malware, C2, cryptojacking.
 *   phishing — phishing & scam domains.
 *   adult    — NSFW / pornography (opt-in parental control).
 *   gambling — gambling sites (opt-in parental control).
 */
export type CatalogCategory =
  | "general"
  | "ads"
  | "tracking"
  | "malware"
  | "phishing"
  | "adult"
  | "gambling";

export interface CatalogList {
  name: string;
  url: string;
  category: CatalogCategory;
  /** One-line description shown under the name. */
  desc: string;
  /** Surface as a starter pick in the UI (e.g. a "Recommended" badge). */
  recommended?: boolean;
}

export const LIST_CATALOG: CatalogList[] = [
  // ── General / all-in-one ──────────────────────────────────────────────
  {
    name: "OISD Big",
    url: "https://big.oisd.nl",
    category: "general",
    desc: "Ads, tracking, malware & more — large, very low false positives",
    recommended: true,
  },
  {
    name: "OISD Small",
    url: "https://small.oisd.nl",
    category: "general",
    desc: "Lighter OISD list for low-memory setups",
  },
  {
    name: "HaGeZi Pro",
    url: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt",
    category: "general",
    desc: "Balanced all-rounder — ads, tracking, telemetry, malware",
    recommended: true,
  },
  {
    name: "HaGeZi Pro++",
    url: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.plus.txt",
    category: "general",
    desc: "Aggressive HaGeZi tier — more coverage, rare false positives",
  },
  {
    name: "1Hosts (Lite)",
    url: "https://raw.githubusercontent.com/badmojr/1Hosts/master/Lite/adblock.txt",
    category: "general",
    desc: "Privacy-focused all-rounder, accurate & non-disruptive",
  },
  {
    name: "StevenBlack Unified",
    url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    category: "general",
    desc: "Classic unified hosts file: ads + malware",
  },

  // ── Ads ───────────────────────────────────────────────────────────────
  {
    name: "HaGeZi Light",
    url: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/light.txt",
    category: "ads",
    desc: "Basic protection, lowest false positives — set & forget",
  },
  {
    name: "AdGuard DNS Filter",
    url: "https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt",
    category: "ads",
    desc: "AdGuard's own DNS ad/tracker filter",
  },
  {
    name: "AdAway",
    url: "https://adaway.org/hosts.txt",
    category: "ads",
    desc: "Long-standing mobile-oriented ad hosts list",
  },

  // ── Tracking ──────────────────────────────────────────────────────────
  {
    name: "Peter Lowe's List",
    url: "https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext",
    category: "tracking",
    desc: "Long-standing ad & tracking server list",
  },
  {
    name: "Frogeye First-Party Trackers",
    url: "https://hostfiles.frogeye.fr/firstparty-trackers-hosts.txt",
    category: "tracking",
    desc: "CNAME-cloaked first-party trackers that slip past most lists",
  },

  // ── Malware ───────────────────────────────────────────────────────────
  {
    name: "HaGeZi Threat Intel",
    url: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/tif.txt",
    category: "malware",
    desc: "Malware, phishing, scam & cryptojacking domains",
    recommended: true,
  },
  {
    name: "URLhaus",
    url: "https://urlhaus.abuse.ch/downloads/hostfile/",
    category: "malware",
    desc: "abuse.ch list of malware-distributing hosts",
  },

  // ── Phishing ──────────────────────────────────────────────────────────
  {
    name: "Phishing Army (Extended)",
    url: "https://phishing.army/download/phishing_army_blocklist_extended.txt",
    category: "phishing",
    desc: "Dedicated phishing-domain feed, extended edition",
  },
  {
    name: "Phishing Filter",
    url: "https://malware-filter.gitlab.io/malware-filter/phishing-filter-agh.txt",
    category: "phishing",
    desc: "malware-filter phishing feed (Adblock format)",
  },

  // ── Adult (opt-in) ────────────────────────────────────────────────────
  {
    name: "HaGeZi NSFW",
    url: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/nsfw.txt",
    category: "adult",
    desc: "Adult / pornographic content",
  },
  {
    name: "Sinfonietta Pornography",
    url: "https://raw.githubusercontent.com/Sinfonietta/hostfiles/master/pornography-hosts",
    category: "adult",
    desc: "Alternative adult-content hosts list",
  },

  // ── Gambling (opt-in) ─────────────────────────────────────────────────
  {
    name: "HaGeZi Gambling",
    url: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/gambling.txt",
    category: "gambling",
    desc: "Gambling & betting sites",
  },
];
