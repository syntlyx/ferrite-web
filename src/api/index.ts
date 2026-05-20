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
import * as updates from "./updates";

import type {
  QueryFilters,
  AddListBody,
  PatchListBody,
  AddCustomRecordBody,
  PatchSettingsBody,
  AddAliasBody,
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

  // ── Updates ─────────────────────────────────────────────────────────────────
  checkUpdate: updates.check,
  updateServer: updates.updateServer,
  updateWeb: updates.updateWeb,
};

export { getToken };
export type * from "./types";
