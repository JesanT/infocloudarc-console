import { create } from "zustand";
import { HYPERVISORS, cleanHypervisor, type Hypervisor } from "@/lib/cloud/hypervisor";
import { DEPLOY_IMAGES, DEPLOY_REPOS, DEPLOY_TEMPLATES, pathOk, type DeployImage, type DeployRepository, type DeployTemplate } from "@/lib/cloud/deploy";
import { refreshServices, type WorkloadSample } from "@/lib/cloud/uptime";
import {
  ARRAYS,
  BACKUPS,
  BACKUP_TARGETS,
  CLUSTERS,
  COLLECTORS,
  INVENTORY,
  INSTANCES,
  PHYSICAL_HOSTS,
  POLICIES,
  REPORTS,
  REPOS,
  RESTORE_POINTS,
  SEED_ACTIVITY,
  SERVICES,
  SUBSCRIPTIONS,
  SWITCHES,
  USERS,
  WORKLOAD_APPS,
  WORKLOAD_DATABASES,
  completeAsset,
  canMutateSite,
  inScope,
  siteLabel,
  type Activity,
  type BackupJob,
  type BackupPolicy,
  type BackupTarget,
  type Collector,
  type ComputeCluster,
  type ComputeService,
  type ContentRepo,
  type Instance,
  type InventoryItem,
  type NetAlert,
  type NetEvent,
  type NetPort,
  type Operator,
  type PhysicalHost,
  type WorkloadApp,
  type WorkloadDatabase,
  type ReportDef,
  type RestorePoint,
  type Role,
  type SanSwitch,
  type SiteFilter,
  type SiteKey,
  type SnmpConfig,
  type StorageArray,
  type Subscription,
} from "@/lib/cloud/model";
import {
  DEFAULT_SNMP,
  assetKey,
  buildPorts,
  catalogFor,
  isPolled,
  rowToAsset,
  runPoll,
  summarize,
  type ImportRow,
} from "@/lib/cloud/fabric";

type Notice = string | null;

const seedPorts = INVENTORY.flatMap(buildPorts);
const seedInventory = INVENTORY.map((item) => (isPolled(item) ? summarize(item, seedPorts, 0) : item));

type AssetInput = {
  name: string;
  category: InventoryItem["category"];
  site: SiteKey;
  vendor: string;
  model: string;
  serial: string;
  location: string;
  owner: string;
  ip?: string;
  mac?: string;
  deviceType?: InventoryItem["deviceType"];
  subnet?: string;
};

type CloudState = {
  role: Role;
  site: SiteFilter;
  view: string;
  query: string;
  navOpen: boolean;
  notice: Notice;
  instances: Instance[];
  inventory: InventoryItem[];
  repositories: ContentRepo[];
  subscriptions: Subscription[];
  activity: Activity[];
  ports: NetPort[];
  alerts: NetAlert[];
  events: NetEvent[];
  services: ComputeService[];
  clusters: ComputeCluster[];
  backups: BackupJob[];
  reports: ReportDef[];
  switches: SanSwitch[];
  arrays: StorageArray[];
  operators: Operator[];
  backupTargets: BackupTarget[];
  restorePoints: RestorePoint[];
  policies: BackupPolicy[];
  collectors: Collector[];
  hosts: PhysicalHost[];
  hypervisors: Hypervisor[];
  deployRepos: DeployRepository[];
  deployImages: DeployImage[];
  deployTemplates: DeployTemplate[];
  workloadApps: WorkloadApp[];
  workloadDatabases: WorkloadDatabase[];
  workloadSamples: WorkloadSample[];
  snmp: SnmpConfig;
  appSubnet: string;
  appAddress: string;
  extraSubnets: string[];
  pollTick: number;
  lastPollAt: number;
  setRole: (role: Role, home?: SiteKey) => void;
  setSite: (site: SiteFilter) => void;
  setView: (view: string) => void;
  setQuery: (query: string) => void;
  setNavOpen: (open: boolean) => void;
  flash: (notice: string) => void;
  vmAction: (id: string, action: "stop" | "restart" | "shutdown") => void;
  deployInstance: (input: { name: string; site: SiteKey; kind: Instance["kind"]; os: string; hypervisorId: string; templateId: string; imageId: string; hostId: string | null; clusterName: string | null; configPath: string; diskPath: string; swapPath: string; started: boolean }) => void;
  addAsset: (input: AssetInput) => void;
  importAssets: (rows: ImportRow[]) => void;
  discoverIntoInventory: (cidr: string, live: Array<{ ip: string; ports: number[] }>) => void;
  setAppSubnet: (cidr: string, address: string) => void;
  addExtraSubnet: (cidr: string) => void;
  setSnmp: (patch: Partial<SnmpConfig>) => void;
  poll: () => void;
  captureWorkloads: () => void;
  recordReading: (row: WorkloadSample) => void;
  acknowledgePort: (id: string) => void;
  syncRepo: (id: string) => void;
  renewSubscription: (id: string) => void;
  saveService: (row: ComputeService) => void;
  deleteService: (name: string) => void;
  saveWorkloadApp: (row: WorkloadApp) => void;
  deleteWorkloadApp: (id: string) => void;
  saveWorkloadDatabase: (row: WorkloadDatabase) => void;
  deleteWorkloadDatabase: (id: string) => void;
  saveCluster: (row: ComputeCluster) => void;
  deleteCluster: (name: string) => void;
  saveHost: (row: PhysicalHost) => void;
  deleteHost: (id: string) => void;
  saveHypervisor: (row: Hypervisor) => void;
  deleteHypervisor: (id: string) => void;
  saveDeployRepo: (row: DeployRepository) => void;
  deleteDeployRepo: (id: string) => void;
  saveDeployImage: (row: DeployImage) => void;
  deleteDeployImage: (id: string) => void;
  saveDeployTemplate: (row: DeployTemplate) => void;
  deleteDeployTemplate: (id: string) => void;
  updateInstance: (id: string, input: { hypervisorId: string; templateId: string; imageId: string; hostId: string | null; clusterName: string | null; configPath: string; diskPath: string; swapPath: string }) => void;
  setInstanceAddress: (id: string, ip: string) => void;
  deleteInstance: (id: string) => void;
  saveSwitch: (row: SanSwitch) => void;
  deleteSwitch: (name: string) => void;
  saveArray: (row: StorageArray) => void;
  deleteArray: (name: string) => void;
  saveBackup: (row: BackupJob) => void;
  deleteBackup: (id: string) => void;
  saveBackupTarget: (row: BackupTarget) => void;
  deleteBackupTarget: (id: string) => void;
  savePolicy: (row: BackupPolicy) => void;
  deletePolicy: (id: string) => void;
  saveRestorePoint: (row: RestorePoint) => void;
  deleteRestorePoint: (id: string) => void;
  saveOperator: (row: Operator) => void;
  deleteOperator: (name: string) => void;
};

let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function canOperate(get: () => CloudState, itemSite: SiteKey): boolean {
  const { role, site } = get();
  return canMutateSite(role, site, itemSite);
}

export const useCloud = create<CloudState>((set, get) => ({
  role: "vendor",
  site: "all",
  view: "dashboard",
  query: "",
  navOpen: false,
  notice: null,
  instances: INSTANCES,
  inventory: seedInventory,
  repositories: REPOS,
  subscriptions: SUBSCRIPTIONS,
  activity: SEED_ACTIVITY,
  ports: seedPorts,
  alerts: [],
  events: [],
  services: SERVICES,
  clusters: CLUSTERS,
  backups: BACKUPS,
  reports: REPORTS,
  switches: SWITCHES,
  arrays: ARRAYS,
  operators: USERS,
  backupTargets: BACKUP_TARGETS,
  restorePoints: RESTORE_POINTS,
  policies: POLICIES,
  collectors: COLLECTORS,
  hosts: PHYSICAL_HOSTS,
  hypervisors: HYPERVISORS,
  deployRepos: DEPLOY_REPOS,
  deployImages: DEPLOY_IMAGES,
  deployTemplates: DEPLOY_TEMPLATES,
  workloadApps: WORKLOAD_APPS,
  workloadDatabases: WORKLOAD_DATABASES,
  workloadSamples: [],
  snmp: DEFAULT_SNMP,
  appSubnet: "",
  appAddress: "",
  extraSubnets: [],
  pollTick: 0,
  lastPollAt: 0,
  setRole: (role, home) => {
    if (role === "site") {
      const current = home ?? get().site;
      const site = current === "east" || current === "west" || current === "central" ? current : "east";
      set({ role, site });
      return;
    }
    set({ role });
  },
  setSite: (site) => {
    if (get().role === "site") return;
    set({ site });
  },
  setView: (view) => set({ view, navOpen: false, query: "" }),
  setQuery: (query) => set({ query }),
  setNavOpen: (navOpen) => set({ navOpen }),
  flash: (notice) => {
    if (noticeTimer) clearTimeout(noticeTimer);
    set({ notice });
    noticeTimer = setTimeout(() => set({ notice: null }), 3200);
  },
  vmAction: (id, action) => {
    const { role, instances, flash, activity } = get();
    const vm = instances.find((item) => item.id === id);
    if (!vm) return;
    if (!canOperate(get, vm.site)) {
      flash(`Site access cannot change workloads outside ${siteLabel(get().site === "all" ? "east" : get().site)}.`);
      return;
    }
    const status = action === "restart" ? "running" : "stopped";
    const verb = action === "restart" ? "Restarted" : action === "stop" ? "Stopped" : "Shut down";
    set({
      instances: instances.map((item) =>
        item.id === id
          ? { ...item, status, cpu: status === "running" ? Math.max(item.cpu, 12) : 0, mem: status === "running" ? Math.max(item.mem, 20) : 0 }
          : item,
      ),
      activity: [{ id: `a-${Date.now()}`, text: `${verb} ${vm.name} (${siteLabel(vm.site)})`, when: "now" }, ...activity].slice(0, 8),
    });
    flash(`${verb} ${vm.name}.`);
    get().captureWorkloads();
  },
  deployInstance: (input) => {
    const { role, instances, flash, activity } = get();
    if (role !== "vendor") {
      flash("Only vendor access can deploy instances.");
      return;
    }
    const name = input.name.trim();
    if (!name) {
      flash("Instance name is required.");
      return;
    }
    if (instances.some((item) => item.name === name)) {
      flash("An instance with that name already exists.");
      return;
    }
    const next: Instance = {
      id: `vm-${Date.now()}`,
      name,
      site: input.site,
      status: input.started ? "running" : "stopped",
      cpu: 0,
      mem: 0,
      ip: "",
      kind: input.kind,
      os: input.os,
      hypervisorId: input.hypervisorId,
      templateId: input.templateId,
      imageId: input.imageId,
      hostId: input.hostId,
      clusterName: input.clusterName,
      configPath: input.configPath,
      diskPath: input.diskPath,
      swapPath: input.swapPath,
    };
    set({
      instances: [next, ...instances],
      activity: [{ id: `a-${Date.now()}`, text: `Deployed ${name} on ${input.site}${input.diskPath ? ` at ${input.diskPath}` : ""}`, when: "now" }, ...activity].slice(0, 8),
    });
    flash(input.started ? `Deployed ${name}.` : `Recorded ${name}. The hypervisor did not start it.`);
    get().captureWorkloads();
  },
  updateInstance: (id, input) => {
    const row = get().instances.find((item) => item.id === id);
    if (!row || !allowSite(get, row.site)) return;
    set({
      instances: get().instances.map((item) =>
        item.id === id
          ? {
              ...item,
              hypervisorId: input.hypervisorId,
              templateId: input.templateId,
              imageId: input.imageId,
              hostId: input.hostId,
              clusterName: input.clusterName,
              configPath: input.configPath,
              diskPath: input.diskPath,
              swapPath: input.swapPath,
            }
          : item,
      ),
    });
    get().flash(`Updated ${row.name}. Files on the hypervisor were not moved.`);
  },
  setInstanceAddress: (id, ip) => {
    const row = get().instances.find((item) => item.id === id);
    if (!row || !allowSite(get, row.site) || !ip || row.ip === ip) return;
    set({ instances: get().instances.map((item) => (item.id === id ? { ...item, ip } : item)) });
  },
  addAsset: (input) => {
    const { role, inventory, ports, flash } = get();
    if (role === "site") {
      flash("Site access cannot add inventory.");
      return;
    }
    if (!input.name.trim() || !input.serial.trim()) {
      flash("Name and serial are required.");
      return;
    }
    const item = completeAsset({
      ...input,
      id: `inv-${Date.now()}`,
      status: "Online",
      source: "manual",
      name: input.name.trim(),
      serial: input.serial.trim(),
    });
    if (inventory.some((existing) => assetKey(existing) === assetKey(item))) {
      flash("That serial or address is already in inventory.");
      return;
    }
    const created = buildPorts(item);
    const withCounts = isPolled(item) ? summarize(item, created, get().pollTick) : item;
    set({ inventory: [withCounts, ...inventory], ports: [...created, ...ports] });
    flash(`Added ${item.name} to inventory.`);
  },
  importAssets: (rows) => {
    const { role } = get();
    if (role === "site") {
      get().flash("Site access cannot import inventory.");
      return;
    }
    const incoming = rows.filter((row) => row.name).map((row) => rowToAsset(row, "import"));
    const added = mergeAssets(set, get, incoming);
    get().flash(added ? `Imported ${added} assets. Duplicates skipped.` : "No new assets. Every row was already in inventory.");
  },
  discoverIntoInventory: (cidr, live) => {
    if (get().role === "site") {
      get().flash("Site access cannot run discovery.");
      return;
    }
    const address = get().appAddress;
    const rows = [...catalogFor(cidr)];
    for (const host of live) {
      const isApp = Boolean(address) && host.ip === address;
      rows.push({
        name: isApp ? "infocloudarc-app" : `host-${host.ip.replaceAll(".", "-")}`,
        category: "Compute",
        site: siteForCidr(cidr),
        vendor: "Discovered",
        model: host.ports.length ? `tcp ${host.ports.join("/")}` : "application server",
        serial: `DISC-${host.ip}`,
        ip: host.ip,
        mac: "",
        location: "Scan",
        owner: "Platform",
        deviceType: "server",
        subnet: cidr,
      });
    }
    const incoming = rows.map((row) => rowToAsset(row, "discovery"));
    const added = mergeAssets(set, get, incoming);
    get().flash(
      added
        ? `Discovery on ${cidr} added ${added} devices. Existing addresses were left as-is.`
        : `Discovery on ${cidr} found no new devices.`,
    );
  },
  setAppSubnet: (appSubnet, appAddress) => set({ appSubnet, appAddress }),
  addExtraSubnet: (cidr) => {
    const value = cidr.trim();
    if (!/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(value)) {
      get().flash("Enter a CIDR such as 10.10.1.0/24.");
      return;
    }
    if (get().extraSubnets.includes(value) || get().appSubnet === value) {
      get().flash("That subnet is already listed.");
      return;
    }
    set({ extraSubnets: [...get().extraSubnets, value] });
  },
  setSnmp: (patch) => {
    if (get().role === "site") {
      get().flash("Site access cannot change monitoring credentials.");
      return;
    }
    set({ snmp: { ...get().snmp, ...patch } });
  },
  poll: () => {
    const state = get();
    const tick = state.pollTick + 1;
    const selected = state.inventory.filter((item) => inScope(state.role, state.site, item.site));
    const selectedIds = new Set(selected.map((item) => item.id));
    const selectedPorts = state.ports.filter((port) => selectedIds.has(port.assetId));
    const result = runPoll(selected, selectedPorts, tick, state.snmp);
    const returned = new Set(result.ports.map((port) => port.id));
    set({
      inventory: [...result.inventory, ...state.inventory.filter((item) => !selectedIds.has(item.id))],
      ports: [...result.ports, ...state.ports.filter((port) => !returned.has(port.id) && !selectedIds.has(port.assetId))],
      alerts: [...result.alerts, ...state.alerts].slice(0, 40),
      events: [...result.events, ...state.events].slice(0, 40),
      pollTick: tick,
      lastPollAt: Date.now(),
    });
    get().captureWorkloads();
    if (result.alerts.some((alert) => alert.severity === "major")) {
      state.flash("Major alert queued to the mobile target.");
    } else if (result.alerts.length > 0) {
      state.flash("Minor alert queued to email.");
    }
  },
  acknowledgePort: (id) => {
    const port = get().ports.find((item) => item.id === id);
    if (!port) return;
    const asset = get().inventory.find((item) => item.id === port.assetId);
    if (asset && !canMutateSite(get().role, get().site, asset.site)) {
      get().flash("Site access cannot acknowledge ports outside its site.");
      return;
    }
    if (port.oper !== "down") {
      get().flash("That port is up. Nothing to acknowledge.");
      return;
    }
    if (port.alarmAck) {
      get().flash("That port alarm is already acknowledged.");
      return;
    }
    set({
      ports: get().ports.map((item) => (item.id === id ? { ...item, alarmAck: true } : item)),
    });
    get().flash(`${port.name} acknowledged. Red alarm suppressed.`);
  },
  captureWorkloads: () => {
    const state = get();
    const built = refreshServices({
      services: state.services,
      apps: state.workloadApps,
      databases: state.workloadDatabases,
      samples: state.workloadSamples,
    });
    const sameSamples = built.samples.length === state.workloadSamples.length && built.samples.every((row) => {
      const old = state.workloadSamples.find((item) => item.id === row.id);
      return !!old && old.up === row.up && old.performance === row.performance && old.source === row.source && old.detail === row.detail;
    });
    const sameScores = built.services.length === state.services.length && built.services.every((row, index) => {
      const old = state.services[index];
      return !!old && old.name === row.name && old.availability === row.availability && old.performance === row.performance;
    });
    if (sameSamples && sameScores) return;
    set({ workloadSamples: built.samples, services: built.services });
  },
  recordReading: (row) => {
    if (!row.source) return;
    const state = get();
    set({
      workloadSamples: [...state.workloadSamples.filter((item) => item.id !== row.id), row],
    });
    get().captureWorkloads();
    get().flash(row.performance < 0 ? `Recorded ${row.target} without a performance number.` : `Recorded ${row.target}.`);
  },
  syncRepo: (id) => {
    const { repositories, flash, activity } = get();
    const repo = repositories.find((item) => item.id === id);
    if (!repo) return;
    if (!canMutateSite(get().role, get().site, repo.site)) {
      flash("Site access cannot sync a repository outside its site.");
      return;
    }
    set({
      repositories: repositories.map((item) =>
        item.id === id ? { ...item, status: "Healthy", lastSync: "Just now" } : item,
      ),
      activity: [{ id: `a-${Date.now()}`, text: `Synced repository ${repo.name} (${siteLabel(repo.site)})`, when: "now" }, ...activity].slice(0, 8),
    });
    flash(`Synced ${repo.name}.`);
  },
  renewSubscription: (id) => {
    const { role, subscriptions, flash, activity } = get();
    if (role !== "vendor") {
      flash("Only vendor access can renew subscriptions.");
      return;
    }
    const sub = subscriptions.find((item) => item.id === id);
    if (!sub) return;
    set({
      subscriptions: subscriptions.map((item) =>
        item.id === id ? { ...item, status: "Active", renews: "26 Oct 2027" } : item,
      ),
      activity: [{ id: `a-${Date.now()}`, text: `Renewed ${sub.module} (${sub.scope})`, when: "now" }, ...activity].slice(0, 8),
    });
    flash(`Renewed ${sub.module}.`);
  },
  saveService: (row) => {
    if (!allowSite(get, row.site)) return;
    const apps = get().workloadApps.filter((item) => item.serviceName === row.name);
    const databases = get().workloadDatabases.filter((item) => item.serviceName === row.name);
    const linked = new Set([...apps.map((item) => item.vmId), ...databases.map((item) => item.vmId)].filter(Boolean));
    set({
      services: upsert(get().services, { ...row, instances: Math.max(row.instances, linked.size) }, "name"),
    });
    get().flash(`Saved service ${row.name}.`);
    get().captureWorkloads();
  },
  deleteService: (name) => {
    const row = get().services.find((item) => item.name === name);
    if (!row || !allowSite(get, row.site)) return;
    set({
      services: get().services.filter((item) => item.name !== name),
      workloadApps: get().workloadApps.filter((item) => item.serviceName !== name),
      workloadDatabases: get().workloadDatabases.filter((item) => item.serviceName !== name),
    });
    get().flash(`Deleted service ${name}.`);
    get().captureWorkloads();
  },
  saveWorkloadApp: (row) => {
    const service = get().services.find((item) => item.name === row.serviceName);
    if (!service || !allowSite(get, service.site)) return;
    if (!row.vmId && !row.hostId) {
      get().flash("An application needs a virtual machine or a physical host.");
      return;
    }
    set({ workloadApps: upsert(get().workloadApps, row, "id") });
    get().flash(`Saved application ${row.name}.`);
    get().captureWorkloads();
  },
  deleteWorkloadApp: (id) => {
    const row = get().workloadApps.find((item) => item.id === id);
    const service = row && get().services.find((item) => item.name === row.serviceName);
    if (!row || !service || !allowSite(get, service.site)) return;
    set({ workloadApps: get().workloadApps.filter((item) => item.id !== id) });
    get().flash(`Deleted application ${row.name}.`);
    get().captureWorkloads();
  },
  saveWorkloadDatabase: (row) => {
    const service = get().services.find((item) => item.name === row.serviceName);
    if (!service || !allowSite(get, service.site)) return;
    if (!row.vmId && !row.hostId) {
      get().flash("A database needs a virtual machine or a physical host.");
      return;
    }
    set({ workloadDatabases: upsert(get().workloadDatabases, row, "id") });
    get().flash(`Saved database ${row.name}.`);
    get().captureWorkloads();
  },
  deleteWorkloadDatabase: (id) => {
    const row = get().workloadDatabases.find((item) => item.id === id);
    const service = row && get().services.find((item) => item.name === row.serviceName);
    if (!row || !service || !allowSite(get, service.site)) return;
    set({ workloadDatabases: get().workloadDatabases.filter((item) => item.id !== id) });
    get().flash(`Deleted database ${row.name}.`);
    get().captureWorkloads();
  },
  saveCluster: (row) => {
    if (!allowSite(get, row.site)) return;
    set({ clusters: upsert(get().clusters, row, "name") });
    get().flash(`Saved cluster ${row.name}.`);
  },
  deleteCluster: (name) => {
    const row = get().clusters.find((item) => item.name === name);
    if (!row || !allowSite(get, row.site)) return;
    set({
      clusters: get().clusters.filter((item) => item.name !== name),
      hosts: get().hosts.map((item) => (item.clusterName === name ? { ...item, clusterName: null } : item)),
      instances: get().instances.map((item) => (item.clusterName === name ? { ...item, clusterName: null } : item)),
    });
    get().flash(`Deleted cluster ${name}.`);
  },
  saveHost: (row) => {
    if (!allowSite(get, row.site)) return;
    set({ hosts: upsert(get().hosts, row, "id") });
    get().flash(`Saved host ${row.name}.`);
    get().captureWorkloads();
  },
  deleteHost: (id) => {
    const row = get().hosts.find((item) => item.id === id);
    if (!row || !allowSite(get, row.site)) return;
    const clear = <T extends { hostId: string | null; vmId: string | null }>(rows: T[]) =>
      rows.flatMap((item) => {
        if (item.hostId !== id) return [item];
        if (item.vmId) return [{ ...item, hostId: null }];
        return [];
      });
    set({
      hosts: get().hosts.filter((item) => item.id !== id),
      instances: get().instances.map((item) => (item.hostId === id ? { ...item, hostId: null } : item)),
      workloadApps: clear(get().workloadApps),
      workloadDatabases: clear(get().workloadDatabases),
    });
    get().flash(`Deleted host ${row.name}.`);
    get().captureWorkloads();
  },
  saveHypervisor: (row) => {
    const next = cleanHypervisor(row);
    if (!allowSite(get, next.site)) return;
    set({ hypervisors: upsert(get().hypervisors, next, "id") });
    get().flash(`Saved hypervisor ${next.name}.`);
  },
  deleteHypervisor: (id) => {
    const row = get().hypervisors.find((item) => item.id === id);
    if (!row || !allowSite(get, row.site)) return;
    set({ hypervisors: get().hypervisors.filter((item) => item.id !== id) });
    get().flash(`Deleted hypervisor ${row.name}.`);
  },
  saveDeployRepo: (row) => {
    if (!allowSite(get, row.site)) return;
    if (!pathOk(row.path) && row.kind !== "nas") {
      get().flash("Path is not valid.");
      return;
    }
    if (row.kind === "nas" && !row.address.trim()) {
      get().flash("A NAS repository needs an address.");
      return;
    }
    set({ deployRepos: upsert(get().deployRepos, { ...row, id: row.id.trim(), name: row.name.trim() || row.id.trim(), path: row.path.trim(), address: row.address.trim() }, "id") });
    get().flash(`Saved repository ${row.name}.`);
  },
  deleteDeployRepo: (id) => {
    const row = get().deployRepos.find((item) => item.id === id);
    if (!row || !allowSite(get, row.site)) return;
    if (get().deployImages.some((item) => item.repositoryId === id) || get().hypervisors.some((item) => item.configRepoId === id || item.diskRepoId === id || item.swapRepoId === id)) {
      get().flash("That repository is still used by an image or a hypervisor.");
      return;
    }
    set({ deployRepos: get().deployRepos.filter((item) => item.id !== id) });
    get().flash(`Deleted repository ${row.name}.`);
  },
  saveDeployImage: (row) => {
    if (!allowSite(get, row.site)) return;
    if (!get().deployRepos.some((item) => item.id === row.repositoryId)) {
      get().flash("Choose a repository for the image file.");
      return;
    }
    set({ deployImages: upsert(get().deployImages, { ...row, id: row.id.trim(), name: row.name.trim() || row.id.trim(), file: row.file.trim() }, "id") });
    get().flash(`Saved image ${row.name}.`);
  },
  deleteDeployImage: (id) => {
    const row = get().deployImages.find((item) => item.id === id);
    if (!row || !allowSite(get, row.site)) return;
    if (get().deployTemplates.some((item) => item.imageId === id)) {
      get().flash("That image is still used by a template.");
      return;
    }
    set({ deployImages: get().deployImages.filter((item) => item.id !== id) });
    get().flash(`Deleted image ${row.name}.`);
  },
  saveDeployTemplate: (row) => {
    if (!allowSite(get, row.site)) return;
    if (!get().deployImages.some((item) => item.id === row.imageId)) {
      get().flash("Choose an image for the template.");
      return;
    }
    const vcpu = Math.max(1, Math.min(128, Math.round(row.vcpu) || 1));
    const memoryMb = Math.max(256, Math.min(1048576, Math.round(row.memoryMb) || 2048));
    const diskGb = Math.max(1, Math.min(65536, Math.round(row.diskGb) || 40));
    set({ deployTemplates: upsert(get().deployTemplates, { ...row, id: row.id.trim(), name: row.name.trim() || row.id.trim(), vcpu, memoryMb, diskGb }, "id") });
    get().flash(`Saved template ${row.name}.`);
  },
  deleteDeployTemplate: (id) => {
    const row = get().deployTemplates.find((item) => item.id === id);
    if (!row || !allowSite(get, row.site)) return;
    set({ deployTemplates: get().deployTemplates.filter((item) => item.id !== id) });
    get().flash(`Deleted template ${row.name}.`);
  },
  deleteInstance: (id) => {
    const row = get().instances.find((item) => item.id === id);
    if (!row || !allowSite(get, row.site)) return;
    set({ instances: get().instances.filter((item) => item.id !== id) });
    get().flash(`Removed ${row.name} from the console. Disks on the hypervisor were not deleted.`);
  },
  saveSwitch: (row) => {
    if (!allowSite(get, row.site)) return;
    set({ switches: upsert(get().switches, row, "name") });
    get().flash(`Saved SAN switch ${row.name}.`);
  },
  deleteSwitch: (name) => {
    const row = get().switches.find((item) => item.name === name);
    if (!row || !allowSite(get, row.site)) return;
    set({ switches: get().switches.filter((item) => item.name !== name) });
    get().flash(`Deleted SAN switch ${name}.`);
  },
  saveArray: (row) => {
    if (!allowSite(get, row.site)) return;
    set({ arrays: upsert(get().arrays, row, "name") });
    get().flash(`Saved array ${row.name}.`);
  },
  deleteArray: (name) => {
    const row = get().arrays.find((item) => item.name === name);
    if (!row || !allowSite(get, row.site)) return;
    set({ arrays: get().arrays.filter((item) => item.name !== name) });
    get().flash(`Deleted array ${name}.`);
  },
  saveBackup: (row) => {
    if (!allowSite(get, row.site)) return;
    set({ backups: upsert(get().backups, row, "id") });
    get().flash(`Saved backup job ${row.job}.`);
  },
  deleteBackup: (id) => {
    const row = get().backups.find((item) => item.id === id);
    if (!row || !allowSite(get, row.site)) return;
    set({ backups: get().backups.filter((item) => item.id !== id) });
    get().flash(`Deleted backup job ${row.job}.`);
  },
  saveBackupTarget: (row) => {
    if (!allowSite(get, row.site)) return;
    set({ backupTargets: upsert(get().backupTargets, row, "id") });
    get().flash(`Saved repository ${row.name}.`);
  },
  deleteBackupTarget: (id) => {
    const row = get().backupTargets.find((item) => item.id === id);
    if (!row || !allowSite(get, row.site)) return;
    set({ backupTargets: get().backupTargets.filter((item) => item.id !== id) });
    get().flash(`Deleted repository ${row.name}.`);
  },
  savePolicy: (row) => {
    if (get().role === "site") {
      get().flash("Site access cannot change backup policies.");
      return;
    }
    set({ policies: upsert(get().policies, row, "id") });
    get().flash(`Saved policy ${row.name}.`);
  },
  deletePolicy: (id) => {
    if (get().role === "site") {
      get().flash("Site access cannot change backup policies.");
      return;
    }
    const row = get().policies.find((item) => item.id === id);
    if (!row) return;
    set({ policies: get().policies.filter((item) => item.id !== id) });
    get().flash(`Deleted policy ${row.name}.`);
  },
  saveRestorePoint: (row) => {
    if (!allowSite(get, row.site)) return;
    set({ restorePoints: upsert(get().restorePoints, row, "id") });
    get().flash(`Saved restore point ${row.workload}.`);
  },
  deleteRestorePoint: (id) => {
    const row = get().restorePoints.find((item) => item.id === id);
    if (!row || !allowSite(get, row.site)) return;
    set({ restorePoints: get().restorePoints.filter((item) => item.id !== id) });
    get().flash(`Deleted restore point ${row.workload}.`);
  },
  saveOperator: (row) => {
    if (get().role === "site") {
      get().flash("Site access cannot change operators.");
      return;
    }
    set({ operators: upsert(get().operators, row, "name") });
    get().flash(`Saved operator ${row.name}.`);
  },
  deleteOperator: (name) => {
    if (get().role === "site") {
      get().flash("Site access cannot change operators.");
      return;
    }
    set({ operators: get().operators.filter((item) => item.name !== name) });
    get().flash(`Deleted operator ${name}.`);
  },
}));

function allowSite(get: () => CloudState, site: SiteKey): boolean {
  const { role, site: filter, flash } = get();
  if (!canMutateSite(role, filter, site)) {
    const home = filter === "east" || filter === "west" || filter === "central" ? filter : "east";
    flash(`Site access can change ${siteLabel(home)} only.`);
    return false;
  }
  return true;
}

function upsert<T>(rows: T[], row: T, key: keyof T): T[] {
  const index = rows.findIndex((item) => item[key] === row[key]);
  if (index < 0) return [...rows, row];
  return rows.map((item, itemIndex) => (itemIndex === index ? row : item));
}

function siteForCidr(cidr: string): SiteKey {
  if (cidr.startsWith("10.20.")) return "west";
  if (cidr.startsWith("10.30.")) return "central";
  return "east";
}

function mergeAssets(
  set: (partial: Partial<CloudState>) => void,
  get: () => CloudState,
  incoming: InventoryItem[],
): number {
  const { inventory, ports } = get();
  const keys = new Set(inventory.map((item) => assetKey(item)));
  const fresh = incoming.filter((item) => {
    const key = assetKey(item);
    if (!item.name || keys.has(key)) return false;
    keys.add(key);
    return true;
  });
  if (fresh.length === 0) return 0;
  const created = fresh.flatMap((item) => buildPorts(item));
  const counted = fresh.map((item) => (isPolled(item) ? summarize(item, created, get().pollTick) : item));
  set({ inventory: [...counted, ...inventory], ports: [...created, ...ports] });
  return fresh.length;
}
