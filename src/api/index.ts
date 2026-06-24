/**
 * Public API surface.
 *
 *   import { api } from '@/api'
 *
 * fetch  →  client.ts
 * types  →  types.ts
 * each domain lives in its own file
 */

import { getToken, setToken } from "./client";
import * as auth from "./auth";
import * as stats from "./stats";
import * as queries from "./queries";
import * as clients from "./clients";
import * as blocklist from "./blocklist";
import * as lists from "./lists";
import * as dns from "./dns";
import * as settings from "./settings";
import * as proxy from "./proxy";
import * as logs from "./logs";
import * as updates from "./updates";
import * as tools from "./tools";

import type {
  QueryFilters,
  AddListBody,
  PatchListBody,
  AddCustomRecordBody,
  PatchSettingsBody,
  AddAliasBody,
  ProxyConfig,
} from "./types";

export const api = {
  // ── Auth ────────────────────────────────────────────────────────────────────
  checkAuth: auth.checkAuth,
  login: (password: string) =>
    auth.login(password).then((d) => {
      setToken(d.token);
      return d;
    }),
  logout: () => auth.logout().finally(() => setToken(null)),

  // ── Stats ───────────────────────────────────────────────────────────────────
  statsSummary: stats.summary,
  statsTimeseries: stats.timeseries,
  statsTopBlocked: stats.topBlocked,
  statsTopDomains: stats.topDomains,
  statsTopClients: stats.topClients,
  statsSystem: stats.systemStats,

  // ── Query log ───────────────────────────────────────────────────────────────
  queries: (filters?: QueryFilters) => queries.list(filters),
  purgeQueryLog: queries.purge,

  // ── Clients ─────────────────────────────────────────────────────────────────
  clients: (limit?: number) => clients.list(limit),
  getAliases: clients.getAliases,
  addAlias: (body: AddAliasBody) => clients.addAlias(body),
  removeAlias: (key: string) => clients.removeAlias(key),

  // ── Blocklist ───────────────────────────────────────────────────────────────
  getBlacklist: blocklist.getBlacklist,
  addBlacklist: (domain: string) => blocklist.addBlacklist(domain),
  removeBlacklist: (domain: string) => blocklist.removeBlacklist(domain),

  getWhitelist: blocklist.getWhitelist,
  addWhitelist: (domain: string) => blocklist.addWhitelist(domain),
  removeWhitelist: (domain: string) => blocklist.removeWhitelist(domain),

  checkDomain: (domain: string) => blocklist.checkDomain(domain),

  // ── Subscription lists ──────────────────────────────────────────────────────
  getLists: lists.getAll,
  addList: (body: AddListBody) => lists.add(body),
  toggleList: (name: string, body: PatchListBody) => lists.toggle(name, body),
  removeList: (name: string) => lists.remove(name),
  refreshList: (name: string) => lists.refresh(name),
  refreshAllLists: lists.refreshAll,

  // ── Custom DNS ──────────────────────────────────────────────────────────────
  getCustomRecords: dns.getAll,
  addCustomRecord: (body: AddCustomRecordBody) => dns.add(body),
  removeCustomRecord: (domain: string) => dns.remove(domain),

  // ── Settings ────────────────────────────────────────────────────────────────
  getSettings: settings.get,
  patchSettings: (body: PatchSettingsBody) => settings.patch(body),

  // ── Proxy / Tunnels ───────────────────────────────────────────────────────────
  getProxy: proxy.get,
  putProxy: (body: ProxyConfig) => proxy.put(body),

  // ── Server logs ───────────────────────────────────────────────────────────────
  getLogs: (params: { after_id?: number; level?: string; limit?: number }) => logs.get(params),

  // ── Updates ─────────────────────────────────────────────────────────────────
  checkUpdate: updates.check,
  updateServer: updates.updateServer,
  updateWeb: updates.updateWeb,

  // ── Diagnostic tools ──────────────────────────────────────────────────────────
  toolsResolve: (name: string, type: string) => tools.resolve(name, type),
  toolsWhois: (query: string) => tools.whois(query),
  toolsDnssec: (name: string, type: string) => tools.dnssec(name, type),
  toolsEgressCheck: (egress?: string) => tools.egressCheck(egress),
  toolsCert: (host: string, port?: number, egress?: string) => tools.cert(host, port, egress),
  toolsTcpProbe: (host: string, port: number, egress?: string) =>
    tools.tcpProbe(host, port, egress),
};

export { getToken };
export type * from "./types";
