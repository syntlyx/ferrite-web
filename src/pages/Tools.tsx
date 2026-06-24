import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Globe,
  ShieldCheck,
  Network,
  Lock,
  PlugZap,
  Ban,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/layout/Card";
import {
  Input,
  Select,
  Btn,
  SectionLabel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import type {
  ResolveResult,
  WhoisResult,
  DnssecResult,
  EgressCheckResult,
  CertResult,
  CertEntry,
  TcpProbeResult,
  DomainCheckResult,
} from "@/api/types";

const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "PTR", "SRV", "CAA"];

// ── Cross-tool bus ──────────────────────────────────────────────────────────
// One tool's result can be handed to another: dispatch() switches to the target
// tool's tab and bumps a nonce; the target picks the request up via
// useToolIntake(), prefills its inputs and runs.

type ToolId = "dns" | "dnssec" | "domain" | "whois" | "egress" | "cert" | "tcp";

interface ToolRequest {
  host: string;
  port?: number;
  type?: string;
  egress?: string;
}

interface Pending {
  tool: ToolId;
  req: ToolRequest;
  nonce: number;
}

interface ToolsBus {
  dispatch: (tool: ToolId, req: ToolRequest) => void;
  pending: Pending | null;
}

const ToolsCtx = createContext<ToolsBus>({ dispatch: () => {}, pending: null });

const TAB_OF: Record<ToolId, string> = {
  dns: "dns",
  dnssec: "dns",
  domain: "dns",
  whois: "dns",
  egress: "network",
  cert: "network",
  tcp: "network",
};

/** Pick up a cross-tool request addressed to `toolId` and apply it exactly once
 *  per dispatch (the nonce guards against re-running on unrelated re-renders). */
function useToolIntake(toolId: ToolId, apply: (req: ToolRequest) => void) {
  const { pending } = use(ToolsCtx);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const lastNonce = useRef(0);
  useEffect(() => {
    if (pending && pending.tool === toolId && pending.nonce !== lastNonce.current) {
      lastNonce.current = pending.nonce;
      applyRef.current(pending.req);
    }
  }, [pending, toolId]);
}

// ── Shared run state ──────────────────────────────────────────────────────────
// Every tool runs one request at a time and shows loading / error / result. This
// hook owns that lifecycle; tools pass a fetcher capturing their current inputs.

function useToolRun<T>() {
  const [result, setResult] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const run = useCallback(async (fetcher: () => Promise<T>) => {
    setLoading(true);
    setErr("");
    try {
      setResult(await fetcher());
    } catch (e) {
      setErr((e as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);
  return { result, loading, err, run, setResult };
}

/** Fetch the egress (tunnel) list once, best-effort — shared by the egress,
 *  cert, and tcp-probe dropdowns. An empty list just means only "Direct". */
function useEgresses() {
  const [egresses, setEgresses] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api
      .getProxy()
      .then((d) => setEgresses(d.proxy.egresses.map((e) => ({ id: e.id, name: e.name }))))
      .catch(() => {});
  }, []);
  return egresses;
}

export default function Tools() {
  const { t } = useTranslation();
  const egresses = useEgresses();
  const [tab, setTab] = useState("dns");
  const [pending, setPending] = useState<Pending | null>(null);

  const dispatch = useCallback((tool: ToolId, req: ToolRequest) => {
    setTab(TAB_OF[tool]);
    setPending((p) => ({ tool, req, nonce: (p?.nonce ?? 0) + 1 }));
  }, []);

  const bus = useMemo<ToolsBus>(() => ({ dispatch, pending }), [dispatch, pending]);

  return (
    <PageContainer>
      <PageHeader
        title={t("tools.title", { defaultValue: "Tools" })}
        subtitle={t("tools.subtitle", {
          defaultValue:
            "DNS, filtering and WHOIS lookups plus egress, certificate and TCP probes — run from the server through its own resolvers and tunnels.",
        })}
      />
      <ToolsCtx value={bus}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="dns">{t("tools.tab_dns", { defaultValue: "DNS" })}</TabsTrigger>
            <TabsTrigger value="network">
              {t("tools.tab_network", { defaultValue: "Network" })}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dns" className="space-y-4 pt-4">
            <DnsLookup />
            <DnssecCheck />
            <DomainCheck />
            <Whois />
          </TabsContent>
          <TabsContent value="network" className="space-y-4 pt-4">
            <EgressCheck egresses={egresses} />
            <CertInspector egresses={egresses} />
            <TcpProbe egresses={egresses} />
          </TabsContent>
        </Tabs>
      </ToolsCtx>
    </PageContainer>
  );
}

// ── Shared chrome ─────────────────────────────────────────────────────────────

/** Card + label + controls row + loading/error, with the result region rendered
 *  as children (shown only once the request settles). */
function ToolPanel({
  title,
  help,
  controls,
  loading,
  err,
  loadingText,
  children,
}: {
  title: string;
  help?: string;
  controls: ReactNode;
  loading: boolean;
  err: string;
  loadingText?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <SectionLabel>{title}</SectionLabel>
      {help && <p className="text-muted mb-2 text-[11px] leading-snug">{help}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">{controls}</div>
      {loading && (
        <p className="text-muted mt-3 text-xs">
          {loadingText ?? t("tools.checking", { defaultValue: "Checking…" })}
        </p>
      )}
      {err && <p className="text-blocked mt-3 text-xs">{err}</p>}
      {!loading && children}
    </Card>
  );
}

/** A "Direct (no tunnel)" option followed by the available egresses. */
function EgressOptions({ egresses }: { egresses: { id: string; name: string }[] }) {
  const { t } = useTranslation();
  return (
    <>
      <option value="">{t("tools.egress_direct", { defaultValue: "Direct (no tunnel)" })}</option>
      {egresses.map((eg) => (
        <option key={eg.id} value={eg.id}>
          {eg.name || eg.id}
        </option>
      ))}
    </>
  );
}

const SENDABLE: ToolId[] = ["dns", "dnssec", "domain", "whois", "cert", "tcp"];

/** Hand a host/domain to another tool with one click. */
function ToolActions({ self, host, port }: { self: ToolId; host: string; port?: number }) {
  const { dispatch } = use(ToolsCtx);
  const { t } = useTranslation();
  const h = host.trim();
  if (!h) return null;

  const label: Record<ToolId, string> = {
    dns: "DNS",
    dnssec: "DNSSEC",
    domain: t("tools.send_filtering", { defaultValue: "Filtering" }),
    whois: "WHOIS",
    cert: t("tools.send_cert", { defaultValue: "Cert" }),
    tcp: `TCP :${port ?? 443}`,
    egress: "",
  };
  const needsPort: Partial<Record<ToolId, boolean>> = { cert: true, tcp: true };

  return (
    <div className="border-bdr/40 mt-1 flex flex-wrap items-center gap-1.5 border-t pt-3">
      <span className="text-muted/70 font-mono text-[10px] uppercase tracking-[0.12em]">
        {t("tools.send_to", { defaultValue: "Send to" })}
      </span>
      {SENDABLE.filter((tool) => tool !== self).map((tool) => (
        <button
          key={tool}
          type="button"
          onClick={() =>
            dispatch(tool, { host: h, port: needsPort[tool] ? (port ?? 443) : undefined })
          }
          className="border-bdr/70 text-muted hover:border-ember/40 hover:text-ember rounded-xs border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors"
        >
          {label[tool]}
        </button>
      ))}
    </div>
  );
}

// ── DNS lookup ──────────────────────────────────────────────────────────────

function DnsLookup() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState("A");
  const { result, loading, err, run } = useToolRun<ResolveResult>();

  const submit = (o?: ToolRequest) => {
    const q = (o?.host ?? name).trim();
    const ty = o?.type ?? type;
    if (!q) return;
    setName(q);
    setType(ty);
    run(() => api.toolsResolve(q, ty));
  };
  useToolIntake("dns", submit);

  return (
    <ToolPanel
      title={t("tools.dns_lookup", { defaultValue: "DNS lookup" })}
      loading={loading}
      err={err}
      loadingText={t("tools.looking_up", { defaultValue: "Looking up…" })}
      controls={
        <>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
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
          <Btn
            onClick={() => submit()}
            disabled={loading || !name.trim()}
            className="min-w-32 shrink-0"
          >
            <Search size={13} /> {t("tools.lookup", { defaultValue: "Look up" })}
          </Btn>
        </>
      }
    >
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
            <AnswersTable answers={result.answers} />
          )}
          <ToolActions self="dns" host={result.query} />
        </div>
      )}
    </ToolPanel>
  );
}

/** The answers table shared by DNS lookup and the DNSSEC check. */
function AnswersTable({ answers }: { answers: ResolveResult["answers"] }) {
  const { t } = useTranslation();
  return (
    <div className="border-bdr/60 rounded-xs overflow-x-auto border">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-bdr/60 border-b">
            <th className="text-muted px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
              {t("tools.col_name", { defaultValue: "Name" })}
            </th>
            <th className="text-muted px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
              {t("tools.col_type", { defaultValue: "Type" })}
            </th>
            <th className="text-muted px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
              TTL
            </th>
            <th className="text-muted px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
              {t("tools.col_data", { defaultValue: "Data" })}
            </th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {answers.map((a, i) => (
            <tr key={i} className="border-bdr/40 hover:bg-white/3 border-t transition-colors">
              <td className="text-body px-3 py-2 align-top">{a.name}</td>
              <td className="text-ember px-3 py-2 align-top">{a.type}</td>
              <td className="text-muted px-3 py-2 align-top tabular-nums">{a.ttl}</td>
              <td className="text-body break-all px-3 py-2 align-top">{a.data}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── DNSSEC check ──────────────────────────────────────────────────────────────

function DnssecCheck() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState("A");
  const { result, loading, err, run } = useToolRun<DnssecResult>();

  const submit = (o?: ToolRequest) => {
    const q = (o?.host ?? name).trim();
    const ty = o?.type ?? type;
    if (!q) return;
    setName(q);
    setType(ty);
    run(() => api.toolsDnssec(q, ty));
  };
  useToolIntake("dnssec", submit);

  return (
    <ToolPanel
      title={t("tools.dnssec", { defaultValue: "DNSSEC check" })}
      loading={loading}
      err={err}
      controls={
        <>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
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
          <Btn
            onClick={() => submit()}
            disabled={loading || !name.trim()}
            className="min-w-32 shrink-0"
          >
            <ShieldCheck size={13} /> {t("tools.check", { defaultValue: "Check" })}
          </Btn>
        </>
      }
    >
      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                "rounded-xs flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]",
                result.authenticated
                  ? "border-cached/25 bg-cached/10 text-cached"
                  : "border-blocked/25 bg-blocked/10 text-blocked",
              )}
            >
              <ShieldCheck size={12} />
              {result.authenticated
                ? t("tools.dnssec_authenticated", { defaultValue: "Authenticated" })
                : t("tools.dnssec_unauthenticated", { defaultValue: "Not authenticated" })}
            </span>
            <span className="text-muted text-[11px]">
              {t("tools.dnssec_rrsig", { defaultValue: "RRSIG records" })}:{" "}
              <span className="text-body font-mono tabular-nums">{result.rrsig_count}</span>
            </span>
          </div>
          <p className="text-muted text-[11px]">
            {t("tools.via", { defaultValue: "via" })}{" "}
            <span className="font-mono">{result.upstream}</span> · {result.rcode}
          </p>
          {result.answers.length === 0 ? (
            <p className="text-muted text-xs">
              {t("tools.no_answers", { defaultValue: "No records." })}
            </p>
          ) : (
            <AnswersTable answers={result.answers} />
          )}
          <ToolActions self="dnssec" host={result.query} />
        </div>
      )}
    </ToolPanel>
  );
}

// ── Domain check ──────────────────────────────────────────────────────────────

/** Filtering check: would this domain be blocked, why, and where it routes.
 *  Diagnostic only — management of the black/whitelist lives on the Blocklist page. */
function DomainCheck() {
  const { t } = useTranslation();
  const [domain, setDomain] = useState("");
  const { result, loading, err, run, setResult } = useToolRun<DomainCheckResult>();

  const submit = (o?: ToolRequest) => {
    const d = (o?.host ?? domain).trim().toLowerCase();
    if (!d) return;
    setDomain(d);
    run(() => api.checkDomain(d));
  };
  useToolIntake("domain", submit);

  return (
    <ToolPanel
      title={t("tools.domain_check", { defaultValue: "Domain check" })}
      help={t("tools.domain_check_help", {
        defaultValue: "Check whether a domain would be filtered, why, and where its traffic routes.",
      })}
      loading={loading}
      err={err}
      controls={
        <>
          <Input
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setResult(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={t("blocklist.check_placeholder", {
              defaultValue: "Check domain — e.g. doubleclick.net",
            })}
            className="w-full font-mono"
          />
          <Btn
            onClick={() => submit()}
            disabled={loading || !domain.trim()}
            className="min-w-32 shrink-0"
          >
            <Search size={13} /> {t("tools.check", { defaultValue: "Check" })}
          </Btn>
        </>
      }
    >
      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <span
              className={cn(
                "rounded-xs flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]",
                result.blocked
                  ? "border-blocked/25 bg-blocked/10 text-blocked"
                  : "border-cached/25 bg-cached/10 text-cached",
              )}
            >
              {result.blocked ? <Ban size={12} /> : <CheckCircle2 size={12} />}
              {result.blocked
                ? t("blocklist.status_blocked", { defaultValue: "Blocked" })
                : t("blocklist.status_allowed", { defaultValue: "Allowed" })}
            </span>
            <span className="text-heading min-w-0 truncate font-mono text-sm">{result.domain}</span>
            {result.whitelisted && (
              <span className="border-upstream/25 bg-upstream/10 text-upstream rounded-xs border px-2 py-0.5 text-[10px] font-medium">
                {t("blocklist.whitelisted", { defaultValue: "Whitelisted" })}
              </span>
            )}
          </div>

          {/* Why: the whitelist entry that exempts it, and which sources match. */}
          {result.whitelist_match && (
            <p className="text-muted text-xs">
              {t("blocklist.why_whitelisted", { defaultValue: "Whitelisted by" })}{" "}
              <span className="text-upstream font-mono">{result.whitelist_match.entry}</span>
              {result.whitelist_match.matched !== result.domain && (
                <span className="text-muted/70">
                  {" "}
                  ({t("blocklist.matched_on", { defaultValue: "matched on" })}{" "}
                  <span className="font-mono">{result.whitelist_match.matched}</span>)
                </span>
              )}
            </p>
          )}
          {(result.sources?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <p className="text-muted font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
                {t("blocklist.matched_sources", { defaultValue: "Matched by" })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.sources!.map((s, i) => (
                  <span
                    key={`${s.kind}-${s.name}-${i}`}
                    className="border-bdr/70 bg-panel/40 rounded-xs flex max-w-full items-center gap-1.5 border px-2 py-1 font-mono text-[11px]"
                    title={`${t("blocklist.matched_on", { defaultValue: "matched on" })} ${s.matched}`}
                  >
                    <span className="text-muted/70 shrink-0 text-[10px] uppercase">{s.kind}</span>
                    <span className="text-body truncate">{s.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Selective-routing decision: whether/where this domain is tunneled. */}
          {result.routing &&
            (result.routing.match ? (
              <p className="text-muted text-xs">
                {t("blocklist.routed_through", { defaultValue: "Routed through" })}{" "}
                <span className="text-upstream font-mono">{result.routing.match.egress}</span>
                {result.routing.match.client_scoped && (
                  <span className="text-muted/70">
                    {" "}
                    · {t("blocklist.routing_clients_only", { defaultValue: "clients only" })}
                  </span>
                )}
                {!result.routing.enabled && (
                  <span className="text-muted/70">
                    {" "}
                    ({t("blocklist.routing_disabled", { defaultValue: "routing disabled" })})
                  </span>
                )}
              </p>
            ) : (
              <p className="text-muted text-xs">
                {t("blocklist.routed_direct", { defaultValue: "Not routed (direct)" })}
              </p>
            ))}

          <ToolActions self="domain" host={result.domain} />
        </div>
      )}
    </ToolPanel>
  );
}

// ── WHOIS ───────────────────────────────────────────────────────────────────

function Whois() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const { result, loading, err, run } = useToolRun<WhoisResult>();

  const submit = (o?: ToolRequest) => {
    const q = (o?.host ?? query).trim();
    if (!q) return;
    setQuery(q);
    run(() => api.toolsWhois(q));
  };
  useToolIntake("whois", submit);

  return (
    <ToolPanel
      title={t("tools.whois", { defaultValue: "WHOIS" })}
      loading={loading}
      err={err}
      loadingText={t("tools.looking_up", { defaultValue: "Looking up…" })}
      controls={
        <>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="example.com"
            className="w-full font-mono"
          />
          <Btn
            onClick={() => submit()}
            disabled={loading || !query.trim()}
            className="min-w-32 shrink-0"
          >
            <Globe size={13} /> {t("tools.lookup", { defaultValue: "Look up" })}
          </Btn>
        </>
      }
    >
      {result && (
        <div className="mt-4 space-y-2">
          <p className="text-muted text-[11px]">
            {t("tools.server", { defaultValue: "server" })}{" "}
            <span className="font-mono">{result.server}</span>
          </p>
          <pre className="border-bdr/60 bg-sidebar/60 rounded-xs max-h-96 overflow-auto whitespace-pre-wrap break-all border p-3 font-mono text-[11px] leading-relaxed">
            {result.result}
          </pre>
          <ToolActions self="whois" host={result.query} />
        </div>
      )}
    </ToolPanel>
  );
}

// ── Egress check ──────────────────────────────────────────────────────────────

function EgressCheck({ egresses }: { egresses: { id: string; name: string }[] }) {
  const { t } = useTranslation();
  const [egress, setEgress] = useState("");
  const { result, loading, err, run } = useToolRun<EgressCheckResult>();

  const submit = () => run(() => api.toolsEgressCheck(egress || undefined));

  return (
    <ToolPanel
      title={t("tools.egress_check", { defaultValue: "Egress check" })}
      help={t("tools.egress_check_help", {
        defaultValue: "Connect out through a tunnel and report the observed exit IP.",
      })}
      loading={loading}
      err={err}
      controls={
        <>
          <Select
            value={egress}
            onChange={(e) => setEgress(e.target.value)}
            className="w-full sm:flex-1"
          >
            <EgressOptions egresses={egresses} />
          </Select>
          <Btn onClick={submit} disabled={loading} className="min-w-32 shrink-0">
            <Network size={13} /> {t("tools.check", { defaultValue: "Check" })}
          </Btn>
        </>
      }
    >
      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                "rounded-xs flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]",
                result.healthy === null
                  ? "border-bdr/70 bg-panel/40 text-muted"
                  : result.healthy
                    ? "border-cached/25 bg-cached/10 text-cached"
                    : "border-blocked/25 bg-blocked/10 text-blocked",
              )}
            >
              <Network size={12} />
              {result.healthy === null
                ? t("tools.unknown", { defaultValue: "Unknown" })
                : result.healthy
                  ? t("tools.healthy", { defaultValue: "Healthy" })
                  : t("tools.unhealthy", { defaultValue: "Unhealthy" })}
            </span>
            <span className="text-muted text-[11px]">
              {t("tools.connect_ms", { defaultValue: "Connect" })}:{" "}
              <span className="text-body font-mono tabular-nums">{result.connect_ms} ms</span>
            </span>
          </div>
          <div className="border-bdr/60 bg-sidebar/60 rounded-xs border p-3">
            <p className="text-muted font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
              {t("tools.exit_ip", { defaultValue: "Exit IP" })}
            </p>
            <p className="text-heading mt-1 break-all font-mono text-lg tabular-nums">
              {result.exit_ip ?? "—"}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-3">
            <Field label={t("tools.country", { defaultValue: "Country" })} value={result.country} />
            <Field label={t("tools.colo", { defaultValue: "Colo" })} value={result.colo} />
            <Field label="TLS" value={result.tls} />
          </dl>
        </div>
      )}
    </ToolPanel>
  );
}

/** A muted label over a mono value, used by the egress/cert detail grids. */
function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
        {label}
      </dt>
      <dd className="text-body break-all font-mono">{value ?? "—"}</dd>
    </div>
  );
}

// ── Certificate inspector ─────────────────────────────────────────────────────

const SOON_SECONDS = 30 * 24 * 60 * 60; // flag certs expiring within 30 days

function CertInspector({ egresses }: { egresses: { id: string; name: string }[] }) {
  const { t } = useTranslation();
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [egress, setEgress] = useState("");
  const { result, loading, err, run } = useToolRun<CertResult>();

  const submit = (o?: ToolRequest) => {
    const h = (o?.host ?? host).trim();
    if (!h) return;
    const portStr = o?.port != null ? String(o.port) : port;
    const eg = o?.egress ?? egress;
    setHost(h);
    setPort(portStr);
    setEgress(eg);
    const p = portStr.trim() ? Number(portStr.trim()) : undefined;
    run(() => api.toolsCert(h, p, eg || undefined));
  };
  useToolIntake("cert", submit);

  return (
    <ToolPanel
      title={t("tools.cert", { defaultValue: "Certificate inspector" })}
      loading={loading}
      err={err}
      controls={
        <>
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="example.com"
            className="w-full font-mono sm:flex-1"
          />
          <Input
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="443"
            className="font-mono tabular-nums sm:w-24"
          />
          <Select value={egress} onChange={(e) => setEgress(e.target.value)} className="sm:w-44">
            <EgressOptions egresses={egresses} />
          </Select>
          <Btn
            onClick={() => submit()}
            disabled={loading || !host.trim()}
            className="min-w-32 shrink-0"
          >
            <Lock size={13} /> {t("tools.inspect", { defaultValue: "Inspect" })}
          </Btn>
        </>
      }
    >
      {result && (
        <div className="mt-4 space-y-3">
          <p className="text-muted text-[11px]">
            <span className="font-mono">
              {result.host}:{result.port}
            </span>{" "}
            · {t("tools.connect_ms", { defaultValue: "Connect" })}{" "}
            <span className="text-body font-mono tabular-nums">{result.connect_ms} ms</span>
          </p>
          {result.chain.length === 0 ? (
            <p className="text-muted text-xs">
              {t("tools.cert_empty", { defaultValue: "No certificates returned." })}
            </p>
          ) : (
            <div className="space-y-2">
              {result.chain.map((c, i) => (
                <CertCard key={i} entry={c} index={i} />
              ))}
            </div>
          )}
          <ToolActions self="cert" host={result.host} port={result.port} />
        </div>
      )}
    </ToolPanel>
  );
}

function CertCard({ entry, index }: { entry: CertEntry; index: number }) {
  const { t } = useTranslation();
  const now = Math.floor(Date.now() / 1000);
  const expired = entry.not_after_unix != null && entry.not_after_unix < now;
  const expiringSoon =
    !expired && entry.not_after_unix != null && entry.not_after_unix - now < SOON_SECONDS;

  return (
    <div className="border-bdr/60 bg-sidebar/40 rounded-xs border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-ember font-mono text-[11px] font-semibold tabular-nums">
          #{index + 1}
        </span>
        {entry.is_leaf && (
          <span className="border-ember/25 bg-ember/10 text-ember rounded-xs border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em]">
            {t("tools.cert_leaf", { defaultValue: "Leaf" })}
          </span>
        )}
        {expired && (
          <span className="border-blocked/25 bg-blocked/10 text-blocked rounded-xs border px-2 py-0.5 text-[10px] font-medium">
            {t("tools.cert_expired", { defaultValue: "Expired" })}
          </span>
        )}
        {expiringSoon && (
          <span className="border-ember/25 bg-ember/10 text-ember rounded-xs border px-2 py-0.5 text-[10px] font-medium">
            {t("tools.cert_expiring_soon", { defaultValue: "Expiring soon" })}
          </span>
        )}
      </div>
      {entry.parse_error ? (
        <div className="space-y-1.5 text-[11px]">
          <p className="text-blocked">
            {t("tools.cert_parse_error", { defaultValue: "Could not parse certificate" })}:{" "}
            <span className="font-mono">{entry.parse_error}</span>
          </p>
          <Field label="SHA-256" value={entry.sha256} />
        </div>
      ) : (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-2">
          <Field
            label={t("tools.cert_subject", { defaultValue: "Subject" })}
            value={entry.subject}
          />
          <Field label={t("tools.cert_issuer", { defaultValue: "Issuer" })} value={entry.issuer} />
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-muted font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
              {t("tools.cert_sans", { defaultValue: "SANs" })}
            </dt>
            <dd className="text-body break-all font-mono">
              {entry.sans && entry.sans.length > 0 ? entry.sans.join(", ") : "—"}
            </dd>
          </div>
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-muted font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
              {t("tools.cert_validity", { defaultValue: "Validity" })}
            </dt>
            <dd className="text-body break-all font-mono">
              {entry.not_before ?? "—"} → {entry.not_after ?? "—"}
            </dd>
          </div>
          <Field label={t("tools.cert_serial", { defaultValue: "Serial" })} value={entry.serial} />
          <Field
            label={t("tools.cert_sig_alg", { defaultValue: "Signature" })}
            value={entry.sig_alg}
          />
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-muted font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
              SHA-256
            </dt>
            <dd className="text-body break-all font-mono">{entry.sha256}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

// ── TCP probe ─────────────────────────────────────────────────────────────────

function TcpProbe({ egresses }: { egresses: { id: string; name: string }[] }) {
  const { t } = useTranslation();
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [egress, setEgress] = useState("");
  const { result, loading, err, run } = useToolRun<TcpProbeResult>();

  const submit = (o?: ToolRequest) => {
    const h = (o?.host ?? host).trim();
    const portStr = o?.port != null ? String(o.port) : port;
    const eg = o?.egress ?? egress;
    const p = Number(portStr.trim());
    if (!h || !p) return;
    setHost(h);
    setPort(portStr);
    setEgress(eg);
    run(() => api.toolsTcpProbe(h, p, eg || undefined));
  };
  useToolIntake("tcp", submit);

  const portNum = Number(port.trim());
  const valid = host.trim() !== "" && Number.isFinite(portNum) && portNum > 0;

  return (
    <ToolPanel
      title={t("tools.tcp_probe", { defaultValue: "TCP probe" })}
      loading={loading}
      err={err}
      controls={
        <>
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="example.com"
            className="w-full font-mono sm:flex-1"
          />
          <Input
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="443"
            className="font-mono tabular-nums sm:w-24"
          />
          <Select value={egress} onChange={(e) => setEgress(e.target.value)} className="sm:w-44">
            <EgressOptions egresses={egresses} />
          </Select>
          <Btn
            onClick={() => submit()}
            disabled={loading || !valid}
            className="min-w-32 shrink-0"
          >
            <PlugZap size={13} /> {t("tools.probe", { defaultValue: "Probe" })}
          </Btn>
        </>
      }
    >
      {result && (
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                "rounded-xs flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]",
                result.reachable
                  ? "border-cached/25 bg-cached/10 text-cached"
                  : "border-blocked/25 bg-blocked/10 text-blocked",
              )}
            >
              <PlugZap size={12} />
              {result.reachable
                ? t("tools.reachable", { defaultValue: "Reachable" })
                : t("tools.unreachable", { defaultValue: "Unreachable" })}
            </span>
            <span className="text-muted min-w-0 truncate font-mono text-sm">
              {result.host}:{result.port}
            </span>
          </div>
          {result.reachable ? (
            <p className="text-muted text-[11px]">
              {t("tools.connect_ms", { defaultValue: "Connect" })}:{" "}
              <span className="text-body font-mono tabular-nums">{result.connect_ms} ms</span>
            </p>
          ) : (
            result.error && <p className="text-blocked font-mono text-[11px]">{result.error}</p>
          )}
          <ToolActions self="tcp" host={result.host} port={result.port} />
        </div>
      )}
    </ToolPanel>
  );
}
