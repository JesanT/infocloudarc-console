import { create } from "zustand";
import {
  ARRAYS,
  BACKUPS,
  BACKUP_TARGETS,
  CLUSTERS,
  COLLECTORS,
  INVENTORY,
  INSTANCES,
  POLICIES,
  REPORTS,
  REPOS,
  RESTORE_POINTS,
  SEED_ACTIVITY,
  SERVICES,
  SUBSCRIPTIONS,
  SWITCHES,
  USERS,
  completeAsset,
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
  snmp: SnmpConfig;
  appSubnet: string;
  appAddress: string;
  extraSubnets: string[];
  pollTick: number;
  lastPollAt: number;
  setRole: (role: Role) => void;
  setSite: (site: SiteFilter) => void;
  setView: (view: string) => void;
  setQuery: (query: string) => void;
  setNavOpen: (open: boolean) => void;
  flash: (notice: string) => void;
  vmAction: (id: string, action: "stop" | "restart" | "shutdown") => void;
  deployInstance: (input: { name: string; site: SiteKey; kind: Instance["kind"]; os: string }) => void;
  addAsset: (input: AssetInput) => void;
  importAssets: (rows: ImportRow[]) => void;
  discoverIntoInventory: (cidr: string, live: Array<{ ip: string; ports: number[] }>) => void;
  setAppSubnet: (cidr: string, address: string) => void;
  addExtraSubnet: (cidr: string) => void;
  setSnmp: (patch: Partial<SnmpConfig>) => void;
  poll: () => void;
  acknowledgePort: (id: string) => void;
  syncRepo: (id: string) => void;
  renewSubscription: (id: string) => void;
};

let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function canOperate(role: Role, itemSite: SiteKey): boolean {
  if (role === "vendor" || role === "global") return true;
  return itemSite === "east";
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
  snmp: DEFAULT_SNMP,
  appSubnet: "",
  appAddress: "",
  extraSubnets: [],
  pollTick: 0,
  lastPollAt: 0,
  setRole: (role) =>
    set({
      role,
      site: role === "site" ? "east" : get().site,
    }),
  setSite: (site) => set({ site }),
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
    if (!canOperate(role, vm.site)) {
      flash("Site access cannot change workloads outside Site-East.");
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
      activity: [{ id: `a-${Date.now()}`, text: `${verb} ${vm.name}`, when: "now" }, ...activity].slice(0, 8),
    });
    flash(`${verb} ${vm.name}.`);
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
      status: "running",
      cpu: 8,
      mem: 16,
      ip: "10.0.0.0",
      kind: input.kind,
      os: input.os,
    };
    set({
      instances: [next, ...instances],
      activity: [{ id: `a-${Date.now()}`, text: `Deployed ${name} on ${input.site}`, when: "now" }, ...activity].slice(0, 8),
    });
    flash(`Deployed ${name}.`);
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
  setSnmp: (patch) => set({ snmp: { ...get().snmp, ...patch } }),
  poll: () => {
    const state = get();
    const tick = state.pollTick + 1;
    const result = runPoll(state.inventory, state.ports, tick, state.snmp);
    set({
      inventory: result.inventory,
      ports: result.ports,
      alerts: [...result.alerts, ...state.alerts].slice(0, 40),
      events: [...result.events, ...state.events].slice(0, 40),
      pollTick: tick,
      lastPollAt: Date.now(),
    });
    if (result.alerts.some((alert) => alert.severity === "major")) {
      state.flash("Major alert queued to the mobile target.");
    } else if (result.alerts.length > 0) {
      state.flash("Minor alert queued to email.");
    }
  },
  acknowledgePort: (id) => {
    const port = get().ports.find((item) => item.id === id);
    if (!port) return;
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
  syncRepo: (id) => {
    const { repositories, flash, activity } = get();
    const repo = repositories.find((item) => item.id === id);
    if (!repo) return;
    set({
      repositories: repositories.map((item) =>
        item.id === id ? { ...item, status: "Healthy", lastSync: "Just now" } : item,
      ),
      activity: [{ id: `a-${Date.now()}`, text: `Synced repository ${repo.name}`, when: "now" }, ...activity].slice(0, 8),
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
}));

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
