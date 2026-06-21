import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Globe } from "lucide-react";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/layout/Card";
import { Input, Select, Btn, SectionLabel } from "@/components/ui";
import type { ResolveResult, WhoisResult } from "@/api/types";

const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "PTR", "SRV", "CAA"];

export default function Tools() {
  const { t } = useTranslation();
  return (
    <div className="p-6">
      <PageHeader
        title={t("tools.title", { defaultValue: "Tools" })}
        subtitle={t("tools.subtitle", {
          defaultValue: "DNS lookup and WHOIS, run from the server through its own resolvers.",
        })}
      />
      <div className="space-y-4">
        <DnsLookup />
        <Whois />
      </div>
    </div>
  );
}

function DnsLookup() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState("A");
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    const q = name.trim();
    if (!q) return;
    setLoading(true);
    setErr("");
    try {
      setResult(await api.toolsResolve(q, type));
    } catch (e) {
      setErr((e as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <SectionLabel>{t("tools.dns_lookup", { defaultValue: "DNS lookup" })}</SectionLabel>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="example.com"
          className="w-full font-mono"
        />
        <Select value={type} onChange={(e) => setType(e.target.value)} className="sm:w-32">
          {RECORD_TYPES.map((rt) => (
            <option key={rt} value={rt}>
              {rt}
            </option>
          ))}
        </Select>
        <Btn onClick={run} disabled={loading || !name.trim()} className="shrink-0">
          <Search size={13} /> {t("tools.lookup", { defaultValue: "Look up" })}
        </Btn>
      </div>
      {err && <p className="text-blocked mt-3 text-xs">{err}</p>}
      {result && (
        <div className="mt-4 space-y-2">
          <p className="text-muted text-[11px]">
            {t("tools.via", { defaultValue: "via" })}{" "}
            <span className="font-mono">{result.upstream}</span> · {result.rcode}
          </p>
          {result.answers.length === 0 ? (
            <p className="text-muted text-xs">
              {t("tools.no_answers", { defaultValue: "No records." })}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted/70 text-[10px] uppercase tracking-[0.1em]">
                  <tr>
                    <th className="py-1 pr-4 font-medium">
                      {t("tools.col_name", { defaultValue: "Name" })}
                    </th>
                    <th className="py-1 pr-4 font-medium">
                      {t("tools.col_type", { defaultValue: "Type" })}
                    </th>
                    <th className="py-1 pr-4 font-medium">TTL</th>
                    <th className="py-1 font-medium">
                      {t("tools.col_data", { defaultValue: "Data" })}
                    </th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {result.answers.map((a, i) => (
                    <tr key={i} className="border-bdr/40 border-t">
                      <td className="py-1 pr-4 align-top">{a.name}</td>
                      <td className="text-ember py-1 pr-4 align-top">{a.type}</td>
                      <td className="text-muted py-1 pr-4 align-top tabular-nums">{a.ttl}</td>
                      <td className="py-1 align-top break-all">{a.data}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Whois() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<WhoisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setErr("");
    try {
      setResult(await api.toolsWhois(q));
    } catch (e) {
      setErr((e as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <SectionLabel>{t("tools.whois", { defaultValue: "WHOIS" })}</SectionLabel>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="example.com"
          className="w-full font-mono"
        />
        <Btn onClick={run} disabled={loading || !query.trim()} className="shrink-0">
          <Globe size={13} /> {t("tools.lookup", { defaultValue: "Look up" })}
        </Btn>
      </div>
      {err && <p className="text-blocked mt-3 text-xs">{err}</p>}
      {result && (
        <div className="mt-4 space-y-2">
          <p className="text-muted text-[11px]">
            {t("tools.server", { defaultValue: "server" })}{" "}
            <span className="font-mono">{result.server}</span>
          </p>
          <pre className="border-bdr/60 bg-sidebar/60 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-xs border p-3 font-mono text-[11px] leading-relaxed">
            {result.result}
          </pre>
        </div>
      )}
    </Card>
  );
}
