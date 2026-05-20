export const QTYPE: Record<number, string> = {
  1: "A",
  5: "CNAME",
  12: "PTR",
  15: "MX",
  16: "TXT",
  28: "AAAA",
  33: "SRV",
  65: "HTTPS",
};
export const RCODE_LABEL: Record<number, string | null> = {
  0: null,
  1: "FORMERR",
  2: "SERVFAIL",
  3: "NXDOMAIN",
};
export const RCODE_COLOR: Record<number, string> = {
  1: "text-warn",
  2: "text-blocked",
  3: "text-blocked",
};
export function qtypeName(n: number): string {
  return QTYPE[n] ?? String(n);
}
