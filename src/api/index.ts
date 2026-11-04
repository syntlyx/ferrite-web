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
import * as pause from "./pause";
import * as backup from "./backup";
import * as importer from "./importer";
import * as sync from "./sync";
import * as dhcp from "./dhcp";
import * as secureDns from "./secure-dns";
import * as setup from "./setup";
import * as relay from "./relay";
import * as services from "./services";
import * as notifications from "./notifications";

import type {
  QueryFilters,
  AddListBody,
  PatchListBody,
  AddCustomRecordBody,
  PatchSettingsBody,
  AddAliasBody,
  ProxyConfig,
  BlocklistProfile,
  McpSettings,
  NotificationsSettings,
  SafeSearchSettings,
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
  sessions: auth.sessions,
  revokeSession: auth.revokeSession,
  revokeOtherSessions: auth.revokeOtherSessions,

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
  deviceStats: (device: string, hours?: number) => clients.stats(device, hours),
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

  checkDomain: (domain: string, client?: string) => blocklist.checkDomain(domain, client),

  getProfiles: blocklist.getProfiles,
  putProfiles: (profiles: BlocklistProfile[]) => blocklist.putProfiles(profiles),

  // ── Service catalog ─────────────────────────────────────────────────────────
  serviceCatalog: services.catalog,
  getBlockedServices: services.getBlocked,
  putBlockedServices: (ids: string[]) => services.putBlocked(ids),
  getNotifications: notifications.get,
  putNotifications: (body: NotificationsSettings) => notifications.put(body),
  testNotification: (target?: NotificationsSettings) => notifications.test(target),
  getMcpSettings: notifications.getMcp,
  putMcpSettings: (body: McpSettings) => notifications.putMcp(body),

  getSafeSearch: services.getSafeSearch,
  putSafeSearch: (body: SafeSearchSettings) => services.putSafeSearch(body),

  // ── Subscription lists ──────────────────────────────────────────────────────
  getLists: lists.getAll,
  addList: (body: AddListBody) => lists.add(body),
  toggleList: (name: string, body: PatchListBody) => lists.toggle(name, body),
  removeList: (name: string) => lists.remove(name),
  refreshList: (name: string) => lists.refresh(name),
  refreshAllLists: lists.refreshAll,

  // ── Allowlist subscriptions ─────────────────────────────────────────────────
  getAllowlists: lists.getAllAllow,
  addAllowlist: (body: AddListBody) => lists.addAllow(body),
  toggleAllowlist: (name: string, body: PatchListBody) => lists.toggleAllow(name, body),
  removeAllowlist: (name: string) => lists.removeAllow(name),
  refreshAllowlist: (name: string) => lists.refreshAllow(name),

  // ── Custom DNS ──────────────────────────────────────────────────────────────
  getCustomRecords: dns.getAll,
  addCustomRecord: (body: AddCustomRecordBody) => dns.add(body),
  removeCustomRecord: (domain: string) => dns.remove(domain),

  // ── Settings ────────────────────────────────────────────────────────────────
  getPause: pause.get,
  pauseBlocking: (minutes: number, clients?: string[]) => pause.pause(minutes, clients),
  resumeBlocking: (clients?: string[]) => pause.resume(clients),

  exportConfig: backup.exportConfig,
  previewImport: importer.preview,
  getSecureDns: secureDns.get,
  putSecureDns: secureDns.put,
  renewSecureDns: secureDns.renew,
  secureDnsProfileLink: secureDns.profileLink,
  secureDnsDevice: secureDns.device,
  makeSecureDnsDevice: secureDns.makeDevice,
  setupInfo: setup.info,
  setupClaim: setup.claim,
  getRelay: relay.get,
  putRelay: relay.put,
  getDhcp: dhcp.get,
  putDhcp: dhcp.put,
  dhcpLeases: dhcp.leases,
  dhcpCheck: dhcp.check,
  dhcpForget: dhcp.forget,
  getSync: sync.get,
  putSync: sync.put,
  syncNow: sync.now,
  applyImport: importer.apply,
  importConfig: (toml: string) => backup.importConfig(toml),

  getSettings: settings.get,
  patchSettings: (body: PatchSettingsBody) => settings.patch(body),
  storageLocations: settings.locations,

  // ── Proxy / Tunnels ───────────────────────────────────────────────────────────
  getProxy: proxy.get,
  putProxy: (body: ProxyConfig) => proxy.put(body),
  proxyStats: proxy.stats,
  proxyCompanions: proxy.companions,

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
