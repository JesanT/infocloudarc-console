export const SITES = [
  { id: "east", name: "Site-East", code: "DC1" },
  { id: "west", name: "Site-West", code: "DC2" },
  { id: "central", name: "Site-Central", code: "DC3" },
] as const;

export type SiteKey = (typeof SITES)[number]["id"];
export type Scope = SiteKey | "global";
export type Role = "vendor" | "global" | "site";
export type SiteFilter = "all" | SiteKey;

export type Status =
  | "running"
  | "stopped"
  | "Healthy"
  | "Online"
  | "Active"
  | "Success"
  | "Warning"
  | "Degraded"
  | "Trial"
  | "Expiring"
  | "Failed"
  | "Offline"
  | "Critical"
  | "Syncing";

export type Instance = {
  id: string;
  name: string;
  site: SiteKey;
  status: "running" | "stopped";
  cpu: number;
  mem: number;
  ip: string;
  kind: "Compute" | "Database" | "Load Balancer" | "Backup";
  os: string;
  inMbps?: number;
  outMbps?: number;
  connections?: number;
};

export type InventoryItem = {
  id: string;
  name: string;
  category: "Compute" | "Network" | "Storage" | "Software";
  site: SiteKey;
  vendor: string;
  model: string;
  serial: string;
  status: "Online" | "Degraded" | "Offline";
  location: string;
  owner: string;
  ip: string;
  mac: string;
  deviceType: DeviceType;
  subnet: string;
  source: AssetSource;
  lastPoll: string;
  snmpVersion: SnmpVersion;
  librenmsId: string;
  uptime: string;
  trafficInMbps: number;
  trafficOutMbps: number;
  portsUp: number;
  portsDown: number;
  sysDescr: string;
  parentId: string;
};

export type DeviceType = "switch" | "router" | "firewall" | "server" | "storage" | "access-point" | "software";
export type SnmpVersion = "v1" | "v2c" | "v3";
export type AssetSource = "manual" | "import" | "discovery";

export type NetPort = {
  id: string;
  assetId: string;
  name: string;
  ifIndex: number;
  admin: "up" | "down";
  oper: "up" | "down";
  speed: string;
  inMbps: number;
  outMbps: number;
  errors: number;
  face: "front" | "back";
  group: string;
  downSince: number | null;
  alarmAck: boolean;
};

export type NetAlert = {
  id: string;
  severity: "minor" | "major";
  assetId: string;
  message: string;
  at: string;
  channel: "email" | "mobile";
};

export type NetEvent = {
  id: string;
  assetId: string;
  message: string;
  at: string;
};

export type SnmpConfig = {
  version: SnmpVersion;
  v1: string;
  v2c: string;
  v3User: string;
  v3Auth: string;
  v3Priv: string;
  notifyEmail: string;
  notifyMobile: string;
};

export type ContentRepo = {
  id: string;
  name: string;
  kind: "OS mirror" | "VM template" | "Package" | "Config" | "Backup catalog";
  site: Scope;
  capacityTb: number;
  usedPct: number;
  status: "Healthy" | "Syncing" | "Degraded";
  lastSync: string;
  objects: number;
};

export type Subscription = {
  id: string;
  module: string;
  scope: "Site" | "Global";
  site: Scope;
  plan: string;
  seats: string;
  status: "Active" | "Trial" | "Expiring";
  renews: string;
  annual: string;
};

export type ReportDef = {
  id: string;
  name: string;
  cadence: string;
  audience: string;
  description: string;
};

export type Activity = { id: string; text: string; when: string };

export const ROLE_LABEL: Record<Role, string> = {
  vendor: "Vendor",
  global: "Global",
  site: "Site",
};

export function siteLabel(site: Scope | SiteFilter): string {
  if (site === "all") return "All sites";
  if (site === "global") return "Global";
  const found = SITES.find((s) => s.id === site);
  return found ? `${found.name} (${found.code})` : site;
}

export function inScope(role: Role, filter: SiteFilter, itemSite: Scope): boolean {
  if (role === "site") return itemSite === "east";
  if (filter === "all") return true;
  return itemSite === filter || itemSite === "global";
}

export function tone(status: string): "ok" | "warn" | "danger" | "info" {
  if (["running", "Healthy", "Online", "Active", "Success"].includes(status)) return "ok";
  if (["Warning", "Degraded", "Trial", "Expiring", "Syncing"].includes(status)) return "warn";
  if (["stopped", "Failed", "Offline", "Critical"].includes(status)) return "danger";
  return "info";
}

export const INSTANCES: Instance[] = [
  { id: "vm-001", name: "web-prod-01", site: "east", status: "running", cpu: 45, mem: 62, ip: "10.10.1.21", kind: "Compute", os: "Ubuntu 22.04" },
  { id: "vm-002", name: "db-primary", site: "east", status: "running", cpu: 78, mem: 85, ip: "10.10.1.50", kind: "Database", os: "RHEL 9" },
  { id: "vm-003", name: "app-worker-02", site: "west", status: "stopped", cpu: 0, mem: 0, ip: "10.20.2.15", kind: "Compute", os: "Ubuntu 22.04" },
  { id: "vm-004", name: "lb-frontend", site: "east", status: "running", cpu: 22, mem: 35, ip: "10.10.1.10", kind: "Load Balancer", os: "HAProxy", inMbps: 640, outMbps: 610, connections: 1840 },
  { id: "vm-005", name: "backup-proxy", site: "central", status: "running", cpu: 15, mem: 40, ip: "10.30.1.100", kind: "Backup", os: "Ubuntu 22.04" },
  { id: "vm-006", name: "db-replica", site: "west", status: "running", cpu: 41, mem: 58, ip: "10.20.2.50", kind: "Database", os: "RHEL 9" },
];

export function inferDeviceType(category: InventoryItem["category"]): DeviceType {
  if (category === "Network") return "switch";
  if (category === "Compute") return "server";
  if (category === "Storage") return "storage";
  return "software";
}

export function completeAsset(
  partial: Partial<InventoryItem> &
    Pick<InventoryItem, "id" | "name" | "category" | "site" | "vendor" | "model" | "serial" | "status" | "location" | "owner">,
): InventoryItem {
  const deviceType = partial.deviceType ?? inferDeviceType(partial.category);
  const polled = deviceType === "switch" || deviceType === "router" || deviceType === "firewall" || deviceType === "access-point";
  return {
    ip: "",
    mac: "",
    subnet: "",
    source: "manual",
    lastPoll: "Not polled",
    snmpVersion: "v2c",
    librenmsId: polled ? `lnms-${partial.id}` : "",
    uptime: polled ? "14d 3h" : "",
    trafficInMbps: 0,
    trafficOutMbps: 0,
    portsUp: 0,
    portsDown: 0,
    sysDescr: "",
    parentId: "",
    ...partial,
    deviceType,
  };
}

export const INVENTORY: InventoryItem[] = ([
  { id: "inv-01", name: "rack-e-04-host-12", category: "Compute", site: "east", vendor: "Dell", model: "PowerEdge R760", serial: "DLE760-4412", status: "Online", location: "Row C / RU 12", owner: "Compute", ip: "10.10.1.21", deviceType: "server", subnet: "10.10.1.0/24", parentId: "" },
  { id: "inv-02", name: "rack-w-02-host-03", category: "Compute", site: "west", vendor: "HPE", model: "ProLiant DL380", serial: "HPE380-1903", status: "Online", location: "Row A / RU 8", owner: "Compute", ip: "10.20.2.21", deviceType: "server", subnet: "10.20.2.0/24", parentId: "" },
  { id: "inv-03", name: "core-sw-east-01", category: "Network", site: "east", vendor: "Cisco", model: "Nexus 9336", serial: "NX9K-7710", status: "Online", location: "MMR-1", owner: "Network", ip: "10.10.1.2", deviceType: "switch", subnet: "10.10.1.0/24", parentId: "inv-15", sysDescr: "Cisco NX-OS 10.4" },
  { id: "inv-04", name: "leaf-west-04", category: "Network", site: "west", vendor: "Arista", model: "7050X3", serial: "ARI-7050-204", status: "Degraded", location: "Row B ToR", owner: "Network", ip: "10.20.2.4", deviceType: "switch", subnet: "10.20.2.0/24", parentId: "inv-13", sysDescr: "Arista EOS 4.32" },
  { id: "inv-05", name: "san-sw-east-01", category: "Storage", site: "east", vendor: "Brocade", model: "G720", serial: "BRC-G720-018", status: "Online", location: "SAN cage", owner: "Storage", ip: "10.10.1.30", deviceType: "switch", subnet: "10.10.1.0/24", parentId: "inv-03", sysDescr: "Brocade FOS 9.2" },
  { id: "inv-06", name: "array-a", category: "Storage", site: "east", vendor: "Pure", model: "FlashArray //X", serial: "PFA-X90-332", status: "Online", location: "SAN cage", owner: "Storage", ip: "10.10.1.31", deviceType: "storage", subnet: "10.10.1.0/24", parentId: "" },
  { id: "inv-07", name: "array-c", category: "Storage", site: "central", vendor: "NetApp", model: "AFF A400", serial: "NTA-A400-077", status: "Degraded", location: "DR hall", owner: "Storage", ip: "10.30.1.31", deviceType: "storage", subnet: "10.30.1.0/24", parentId: "" },
  { id: "inv-08", name: "veeam-enterprise", category: "Software", site: "east", vendor: "Veeam", model: "Backup & Replication", serial: "LIC-BKP-2026", status: "Online", location: "Control plane", owner: "Backup", deviceType: "software", parentId: "" },
  { id: "inv-09", name: "ad-connector", category: "Software", site: "central", vendor: "Microsoft", model: "AD DS", serial: "SVC-AD-01", status: "Online", location: "Identity", owner: "IAM", deviceType: "software", parentId: "" },
  { id: "inv-10", name: "san-sw-central-01", category: "Storage", site: "central", vendor: "Cisco", model: "MDS 9148", serial: "MDS-9148-551", status: "Online", location: "DR hall", owner: "Storage", ip: "10.30.1.30", deviceType: "switch", subnet: "10.30.1.0/24", parentId: "inv-14", sysDescr: "Cisco MDS NX-OS 9.4" },
  { id: "inv-11", name: "mgmt-jump-01", category: "Compute", site: "east", vendor: "Dell", model: "PowerEdge R650", serial: "DLE650-1008", status: "Online", location: "Row C / RU 2", owner: "Platform", ip: "10.10.1.8", deviceType: "server", subnet: "10.10.1.0/24", parentId: "" },
  { id: "inv-12", name: "wan-edge-west", category: "Network", site: "west", vendor: "Juniper", model: "MX204", serial: "JN-MX204-063", status: "Online", location: "Meet-me", owner: "Network", ip: "10.20.2.1", deviceType: "router", subnet: "10.20.2.0/24", parentId: "inv-13", sysDescr: "Junos 23.4" },
  { id: "inv-13", name: "core-sw-west-01", category: "Network", site: "west", vendor: "Cisco", model: "Nexus 9336", serial: "NX9K-8802", status: "Online", location: "MMR-1", owner: "Network", ip: "10.20.2.2", deviceType: "switch", subnet: "10.20.2.0/24", parentId: "inv-15", sysDescr: "Cisco NX-OS 10.4" },
  { id: "inv-14", name: "core-sw-central-01", category: "Network", site: "central", vendor: "Cisco", model: "Nexus 93180", serial: "NX9K-4419", status: "Online", location: "DR hall", owner: "Network", ip: "10.30.1.2", deviceType: "switch", subnet: "10.30.1.0/24", parentId: "inv-15", sysDescr: "Cisco NX-OS 10.3" },
  { id: "inv-15", name: "fw-east-01", category: "Network", site: "east", vendor: "Palo Alto", model: "PA-1410", serial: "PA1410-019", status: "Online", location: "MMR-1", owner: "Network", ip: "10.10.1.1", deviceType: "firewall", subnet: "10.10.1.0/24", parentId: "", sysDescr: "PAN-OS 11.2" },
] as Array<Partial<InventoryItem> & Pick<InventoryItem, "id" | "name" | "category" | "site" | "vendor" | "model" | "serial" | "status" | "location" | "owner">>).map(completeAsset);

export const REPOS: ContentRepo[] = [
  { id: "repo-1", name: "ubuntu-mirror", kind: "OS mirror", site: "global", capacityTb: 8, usedPct: 61, status: "Healthy", lastSync: "18 min ago", objects: 84220 },
  { id: "repo-2", name: "golden-images", kind: "VM template", site: "global", capacityTb: 12, usedPct: 44, status: "Healthy", lastSync: "2 h ago", objects: 36 },
  { id: "repo-3", name: "site-east-packages", kind: "Package", site: "east", capacityTb: 4, usedPct: 72, status: "Healthy", lastSync: "41 min ago", objects: 1204 },
  { id: "repo-4", name: "fabric-config", kind: "Config", site: "global", capacityTb: 1, usedPct: 18, status: "Syncing", lastSync: "syncing", objects: 890 },
  { id: "repo-5", name: "backup-catalog-central", kind: "Backup catalog", site: "central", capacityTb: 40, usedPct: 81, status: "Degraded", lastSync: "6 h ago", objects: 15440 },
];

export const SUBSCRIPTIONS: Subscription[] = [
  { id: "sub-1", module: "Computing", scope: "Site", site: "east", plan: "Per site", seats: "120 sockets", status: "Active", renews: "12 Dec 2027", annual: "$48,000" },
  { id: "sub-2", module: "Computing", scope: "Site", site: "west", plan: "Per site", seats: "80 sockets", status: "Active", renews: "03 Mar 2027", annual: "$32,000" },
  { id: "sub-3", module: "Computing", scope: "Site", site: "central", plan: "Per site", seats: "40 sockets", status: "Expiring", renews: "10 Dec 2026", annual: "$18,000" },
  { id: "sub-4", module: "Networking", scope: "Global", site: "global", plan: "All sites", seats: "Unlimited devices", status: "Active", renews: "01 Jun 2027", annual: "$22,400" },
  { id: "sub-5", module: "SAN", scope: "Site", site: "east", plan: "Per site", seats: "4 fabrics", status: "Active", renews: "19 Aug 2027", annual: "$15,600" },
  { id: "sub-6", module: "Backup and Restore", scope: "Global", site: "global", plan: "All sites", seats: "240 workloads", status: "Active", renews: "28 Jan 2027", annual: "$36,000" },
  { id: "sub-7", module: "Monitoring and Alerting", scope: "Global", site: "global", plan: "All sites", seats: "1,500 metrics", status: "Trial", renews: "26 Nov 2026", annual: "$0" },
  { id: "sub-8", module: "Audit and Reporting", scope: "Global", site: "global", plan: "Global view", seats: "Included", status: "Active", renews: "01 Jun 2027", annual: "$9,200" },
];

export const REPORTS: ReportDef[] = [
  { id: "rpt-inventory", name: "Asset inventory", cadence: "Weekly", audience: "Site and global", description: "Hardware and software assets by site, owner, and status." },
  { id: "rpt-capacity", name: "Capacity and utilization", cadence: "Daily", audience: "Global", description: "Compute, storage, and repository headroom across sites." },
  { id: "rpt-backup", name: "Backup compliance", cadence: "Daily", audience: "Site and global", description: "Job outcomes, last success, and unprotected workloads." },
  { id: "rpt-subs", name: "Subscription utilization", cadence: "Monthly", audience: "Vendor", description: "Module subscriptions, renewal dates, and seat use." },
  { id: "rpt-audit", name: "Audit activity", cadence: "On demand", audience: "Global", description: "Operator actions: power, deploy, sync, and renewals." },
];

export const BACKUPS = [
  { job: "Daily-VM-Backup", type: "Full", status: "Success" as const, last: "2 h ago", size: "1.2 TB", site: "east" as SiteKey },
  { job: "DB-Incremental", type: "Incremental", status: "Warning" as const, last: "45 min ago", size: "340 GB", site: "east" as SiteKey },
  { job: "File-Share-Weekly", type: "Full", status: "Success" as const, last: "1 d ago", size: "890 GB", site: "west" as SiteKey },
  { job: "DR-Replication", type: "Continuous", status: "Warning" as const, last: "10 min ago", size: "2.1 TB", site: "central" as SiteKey },
];

export const SERVICES = [
  { name: "edge-gateway", site: "east" as SiteKey, health: "Healthy" as const, instances: 2, availability: 99.98, performance: 97, note: "Public ingress" },
  { name: "app-api", site: "east" as SiteKey, health: "Healthy" as const, instances: 4, availability: 99.95, performance: 93, note: "Stateless API" },
  { name: "identity", site: "central" as SiteKey, health: "Healthy" as const, instances: 2, availability: 99.99, performance: 96, note: "Local + AD" },
  { name: "metrics", site: "west" as SiteKey, health: "Degraded" as const, instances: 1, availability: 98.4, performance: 71, note: "Scrape lag" },
];

export const CLUSTERS = [
  { name: "east-compute", site: "east" as SiteKey, nodes: 12, ha: "Healthy" as const, version: "Hyper-V 2022", availability: 99.99, performance: 94 },
  { name: "west-compute", site: "west" as SiteKey, nodes: 8, ha: "Healthy" as const, version: "Hyper-V 2022", availability: 99.95, performance: 92 },
  { name: "central-dr", site: "central" as SiteKey, nodes: 6, ha: "Degraded" as const, version: "Hyper-V 2019", availability: 98.1, performance: 74 },
];

export const SWITCHES = [
  { name: "SAN-SW-East-01", site: "east" as SiteKey, vendor: "Brocade", ports: 64, status: "Online" as const, note: "All ports healthy" },
  { name: "SAN-SW-West-01", site: "west" as SiteKey, vendor: "Cisco MDS", ports: 48, status: "Degraded" as const, note: "2 ports flapping" },
  { name: "SAN-SW-Central-01", site: "central" as SiteKey, vendor: "Brocade", ports: 48, status: "Online" as const, note: "Healthy" },
];

export const ARRAYS = [
  { name: "Array-A", site: "east" as SiteKey, kind: "All-flash", usable: "120 TB", used: 68, status: "Online" as const },
  { name: "Array-B", site: "west" as SiteKey, kind: "Hybrid", usable: "240 TB", used: 45, status: "Online" as const },
  { name: "Array-C", site: "central" as SiteKey, kind: "All-flash", usable: "80 TB", used: 81, status: "Degraded" as const },
];

export const USERS = [
  { name: "vendor.admin", role: "Vendor", sites: "All", auth: "Local", status: "Active" as const },
  { name: "global.ops", role: "Global", sites: "All", auth: "Active Directory", status: "Active" as const },
  { name: "site.east.eng", role: "Site", sites: "Site-East", auth: "Local", status: "Active" as const },
  { name: "site.west.ops", role: "Site", sites: "Site-West", auth: "Active Directory", status: "Active" as const },
];

export const SEED_ACTIVITY: Activity[] = [
  { id: "a1", text: "Backup job Daily-VM-Backup completed", when: "2 h" },
  { id: "a2", text: "SAN port warning cleared on SAN-SW-East-01", when: "3 h" },
  { id: "a3", text: "Site-East computing license verified", when: "1 d" },
];

export const VIEW_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  services: "Services",
  databases: "Databases",
  loadbalancers: "Load balancers",
  clusters: "Clusters",
  instances: "Instance overview",
  "instance-ops": "Instance operations",
  "net-discovery": "Network discovery",
  "net-topology": "Network topology",
  "net-monitoring": "Network monitoring",
  "net-diagnostics": "Network diagnostics",
  "san-switches": "SAN switches",
  "storage-arrays": "Storage arrays",
  "mon-config": "Monitoring configuration",
  "mon-site": "Site monitoring",
  "mon-global": "Global monitoring",
  "backup-jobs": "Backup jobs",
  "backup-repos": "Backup repositories",
  "backup-restore": "Restore",
  "backup-policies": "Policies",
  "iam-rbac": "RBAC",
  "iam-users": "Users and access",
  licensing: "Licensing",
  inventory: "Inventory",
  repository: "Repository",
  subscriptions: "Subscriptions",
  reports: "Reports",
  "dr-app-tomcat": "Apache Tomcat",
  "dr-app-iis": "IIS",
  "dr-app-other": "Other applications",
  "dr-app-all": "All applications",
  "dr-db-mssql": "MSSQL Service",
  "dr-db-mysql": "MYSQL Service",
  "dr-db-mongodb": "Mongodb",
  "dr-db-postgresql": "PostgreSQL",
  "dr-db-other": "Other databases",
  "dr-db-all": "All databases",
  "dr-all": "All services",
};

export function matches(query: string, parts: Array<string | number>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return parts.some((p) => String(p).toLowerCase().includes(q));
}
