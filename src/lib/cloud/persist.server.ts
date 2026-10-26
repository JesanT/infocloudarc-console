import { getSql, withTransaction, type Sql } from "@/lib/db";
import type {
  Activity,
  BackupJob,
  BackupPolicy,
  BackupTarget,
  Collector,
  ComputeCluster,
  ComputeService,
  ContentRepo,
  Instance,
  InventoryItem,
  NetAlert,
  NetEvent,
  NetPort,
  Operator,
  PhysicalHost,
  ReportDef,
  RestorePoint,
  SanSwitch,
  SnmpConfig,
  StorageArray,
  Subscription,
  WorkloadApp,
  WorkloadDatabase,
} from "@/lib/cloud/model";
import type { DrAlertRow, DrApp, DrAudit, DrCluster, DrDatabase, DrHost, DrPerf, DrService, DrSignal, DrVm, DrWorkflow } from "@/lib/cloud/dr";
import type { WorkloadSample } from "@/lib/cloud/uptime";
import type { Hypervisor } from "@/lib/cloud/hypervisor";

export type ConsolePayload = {
  v: 1;
  cloud: Record<string, unknown>;
  dr: Record<string, unknown>;
};

type CloudSnap = {
  role?: string;
  site?: string;
  instances?: Instance[];
  inventory?: InventoryItem[];
  repositories?: ContentRepo[];
  subscriptions?: Subscription[];
  activity?: Activity[];
  ports?: NetPort[];
  alerts?: NetAlert[];
  events?: NetEvent[];
  services?: ComputeService[];
  clusters?: ComputeCluster[];
  backups?: BackupJob[];
  reports?: ReportDef[];
  switches?: SanSwitch[];
  arrays?: StorageArray[];
  operators?: Operator[];
  backupTargets?: BackupTarget[];
  restorePoints?: RestorePoint[];
  policies?: BackupPolicy[];
  collectors?: Collector[];
  hosts?: PhysicalHost[];
  hypervisors?: Hypervisor[];
  workloadApps?: WorkloadApp[];
  workloadDatabases?: WorkloadDatabase[];
  workloadSamples?: WorkloadSample[];
  snmp?: SnmpConfig;
  appSubnet?: string;
  appAddress?: string;
  extraSubnets?: string[];
  pollTick?: number;
  lastPollAt?: number;
};

type DrSnap = {
  services?: DrService[];
  hosts?: DrHost[];
  vms?: DrVm[];
  clusters?: DrCluster[];
  apps?: DrApp[];
  databases?: DrDatabase[];
  workflows?: DrWorkflow[];
  performance?: DrPerf[];
  events?: DrSignal[];
  alerts?: DrAlertRow[];
  audit?: DrAudit[];
};

export async function readConsole(): Promise<ConsolePayload | null> {
  const sql = await getSql();
  const ready = await sql<{ id: string }>`select id from console_settings where id = 'primary'`;
  if (ready.length === 0) {
    const legacy = await sql<{ payload: unknown }>`select payload from console_state where id = 'primary'`;
    const payload = asPayload(legacy[0]?.payload);
    if (!payload) return null;
    await writeConsole(payload);
  }
  return assemble();
}

export async function writeConsole(payload: ConsolePayload): Promise<void> {
  const cloud = payload.cloud as CloudSnap;
  const dr = payload.dr as DrSnap;
  await withTransaction(async (sql) => {
    await writeSettings(sql, cloud);
    await replaceRows(sql, "workload_apps", [], []);
    await replaceRows(sql, "workload_databases", [], []);
    await replaceRows(sql, "instances", [], []);
    await replaceRows(sql, "physical_hosts", [], []);
    await replaceRows(sql, "net_ports", [], []);
    await replaceRows(sql, "net_alerts", ALERT_COLS, (cloud.alerts ?? []).map(alertRow));
    await replaceRows(sql, "net_events", EVENT_COLS, (cloud.events ?? []).map(eventRow));
    await replaceRows(sql, "inventory_assets", ASSET_COLS, (cloud.inventory ?? []).map(assetRow));
    await replaceRows(sql, "net_ports", PORT_COLS, (cloud.ports ?? []).map(portRow));
    await replaceRows(sql, "content_repositories", REPO_COLS, (cloud.repositories ?? []).map(repoRow));
    await replaceRows(sql, "subscriptions", SUB_COLS, (cloud.subscriptions ?? []).map(subRow));
    await replaceRows(sql, "activity_log", ACTIVITY_COLS, (cloud.activity ?? []).map(activityRow));
    await replaceRows(sql, "compute_clusters", CLUSTER_COLS, (cloud.clusters ?? []).map(clusterRow));
    await replaceRows(sql, "compute_services", SERVICE_COLS, (cloud.services ?? []).map(serviceRow));
    await replaceRows(sql, "physical_hosts", HOST_COLS, (cloud.hosts ?? []).map(hostRow));
    await replaceRows(sql, "hypervisors", HYPERVISOR_COLS, (cloud.hypervisors ?? []).map(hypervisorRow));
    await replaceRows(sql, "instances", INSTANCE_COLS, (cloud.instances ?? []).map(instanceRow));
    await replaceRows(sql, "workload_apps", WORKLOAD_APP_COLS, (cloud.workloadApps ?? []).map(workloadAppRow));
    await replaceRows(sql, "workload_databases", WORKLOAD_DB_COLS, (cloud.workloadDatabases ?? []).map(workloadDbRow));
    await replaceRows(sql, "workload_samples", SAMPLE_COLS, (cloud.workloadSamples ?? []).map(sampleRow));
    await replaceRows(sql, "backup_jobs", BACKUP_COLS, (cloud.backups ?? []).map(backupRow));
    await replaceRows(sql, "report_defs", REPORT_COLS, (cloud.reports ?? []).map(reportRow));
    await replaceRows(sql, "san_switches", SWITCH_COLS, (cloud.switches ?? []).map(switchRow));
    await replaceRows(sql, "storage_arrays", ARRAY_COLS, (cloud.arrays ?? []).map(arrayRow));
    await replaceRows(sql, "operators", OPERATOR_COLS, (cloud.operators ?? []).map(operatorRow));
    await replaceRows(sql, "backup_targets", TARGET_COLS, (cloud.backupTargets ?? []).map(targetRow));
    await replaceRows(sql, "restore_points", RESTORE_COLS, (cloud.restorePoints ?? []).map(restoreRow));
    await replaceRows(sql, "backup_policies", POLICY_COLS, (cloud.policies ?? []).map(policyRow));
    await replaceRows(sql, "monitor_collectors", COLLECTOR_COLS, (cloud.collectors ?? []).map(collectorRow));
    await replaceRows(sql, "dr_apps", [], []);
    await replaceRows(sql, "dr_databases", [], []);
    await replaceRows(sql, "dr_workflows", [], []);
    await replaceRows(sql, "dr_vms", [], []);
    await replaceRows(sql, "dr_performance", PERF_COLS, (dr.performance ?? []).map(perfRow));
    await replaceRows(sql, "dr_events", DR_EVENT_COLS, (dr.events ?? []).map(drEventRow));
    await replaceRows(sql, "dr_alerts", DR_ALERT_COLS, (dr.alerts ?? []).map(drAlertRow));
    await replaceRows(sql, "dr_audit", AUDIT_COLS, (dr.audit ?? []).map(auditRow));
    await replaceRows(sql, "dr_services", DR_SERVICE_COLS, (dr.services ?? []).map(drServiceRow));
    await replaceRows(sql, "dr_hosts", DR_HOST_COLS, (dr.hosts ?? []).map(drHostRow));
    await replaceRows(sql, "dr_clusters", DR_CLUSTER_COLS, (dr.clusters ?? []).map(drClusterRow));
    await replaceRows(sql, "dr_vms", DR_VM_COLS, (dr.vms ?? []).map(drVmRow));
    await replaceRows(sql, "dr_apps", DR_APP_COLS, (dr.apps ?? []).map(drAppRow));
    await replaceRows(sql, "dr_databases", DR_DB_COLS, (dr.databases ?? []).map(drDbRow));
    await replaceRows(sql, "dr_workflows", DR_WF_COLS, (dr.workflows ?? []).map(drWfRow));
  });
}

async function assemble(): Promise<ConsolePayload> {
  const sql = await getSql();
  const [settings] = await sql<Record<string, unknown>>`select * from console_settings where id = 'primary'`;
  const snmp = settings ?? {};
  return {
    v: 1,
    cloud: {
      role: snmp.role,
      site: snmp.site_filter,
      appSubnet: snmp.app_subnet,
      appAddress: snmp.app_address,
      extraSubnets: asJson<string[]>(snmp.extra_subnets, []),
      pollTick: Number(snmp.poll_tick ?? 0),
      lastPollAt: Number(snmp.last_poll_at ?? 0),
      snmp: {
        version: snmp.snmp_version,
        v1: snmp.snmp_v1,
        v2c: snmp.snmp_v2c,
        v3User: snmp.snmp_v3_user,
        v3Auth: snmp.snmp_v3_auth,
        v3Priv: snmp.snmp_v3_priv,
        notifyEmail: snmp.notify_email,
        notifyMobile: snmp.notify_mobile,
      },
      instances: (await sql<Record<string, unknown>>`select * from instances order by name`).map(instanceFrom),
      inventory: (await sql<Record<string, unknown>>`select * from inventory_assets order by name`).map(assetFrom),
      ports: (await sql<Record<string, unknown>>`select * from net_ports order by asset_id, if_index`).map(portFrom),
      alerts: (await sql<Record<string, unknown>>`select * from net_alerts`).map(alertFrom),
      events: (await sql<Record<string, unknown>>`select * from net_events`).map(eventFrom),
      repositories: (await sql<Record<string, unknown>>`select * from content_repositories order by name`).map(repoFrom),
      subscriptions: (await sql<Record<string, unknown>>`select * from subscriptions order by module`).map(subFrom),
      activity: (await sql<Record<string, unknown>>`select * from activity_log`).map(activityFrom),
      services: (await sql<Record<string, unknown>>`select * from compute_services order by name`).map(serviceFrom),
      clusters: (await sql<Record<string, unknown>>`select * from compute_clusters order by name`).map(clusterFrom),
      backups: (await sql<Record<string, unknown>>`select * from backup_jobs order by job`).map(backupFrom),
      reports: (await sql<Record<string, unknown>>`select * from report_defs order by name`).map(reportFrom),
      switches: (await sql<Record<string, unknown>>`select * from san_switches order by name`).map(switchFrom),
      arrays: (await sql<Record<string, unknown>>`select * from storage_arrays order by name`).map(arrayFrom),
      operators: (await sql<Record<string, unknown>>`select * from operators order by name`).map(operatorFrom),
      backupTargets: (await sql<Record<string, unknown>>`select * from backup_targets order by name`).map(targetFrom),
      restorePoints: (await sql<Record<string, unknown>>`select * from restore_points order by workload`).map(restoreFrom),
      policies: (await sql<Record<string, unknown>>`select * from backup_policies order by name`).map(policyFrom),
      collectors: (await sql<Record<string, unknown>>`select * from monitor_collectors order by name`).map(collectorFrom),
      hosts: (await sql<Record<string, unknown>>`select * from physical_hosts order by name`).map(hostFrom),
      hypervisors: (await sql<Record<string, unknown>>`select * from hypervisors order by name`).map(hypervisorFrom),
      workloadApps: (await sql<Record<string, unknown>>`select * from workload_apps order by name`).map(workloadAppFrom),
      workloadDatabases: (await sql<Record<string, unknown>>`select * from workload_databases order by name`).map(workloadDbFrom),
      workloadSamples: (await sql<Record<string, unknown>>`select * from workload_samples order by hour`).map(sampleFrom),
    },
    dr: {
      services: (await sql<Record<string, unknown>>`select * from dr_services order by name`).map(drServiceFrom),
      hosts: (await sql<Record<string, unknown>>`select * from dr_hosts order by name`).map(drHostFrom),
      clusters: (await sql<Record<string, unknown>>`select * from dr_clusters order by name`).map(drClusterFrom),
      vms: (await sql<Record<string, unknown>>`select * from dr_vms order by name`).map(drVmFrom),
      apps: (await sql<Record<string, unknown>>`select * from dr_apps order by name`).map(drAppFrom),
      databases: (await sql<Record<string, unknown>>`select * from dr_databases order by name`).map(drDbFrom),
      workflows: (await sql<Record<string, unknown>>`select * from dr_workflows order by name`).map(drWfFrom),
      performance: (await sql<Record<string, unknown>>`select * from dr_performance`).map(perfFrom),
      events: (await sql<Record<string, unknown>>`select * from dr_events`).map(drEventFrom),
      alerts: (await sql<Record<string, unknown>>`select * from dr_alerts`).map(drAlertFrom),
      audit: (await sql<Record<string, unknown>>`select * from dr_audit`).map(auditFrom),
    },
  };
}

const INSTANCE_COLS = ["id", "name", "site", "status", "cpu", "mem", "ip", "kind", "os", "in_mbps", "out_mbps", "connections", "host_id", "cluster_name"];
const ASSET_COLS = ["id", "name", "category", "site", "vendor", "model", "serial", "status", "location", "owner", "ip", "mac", "device_type", "subnet", "source", "last_poll", "snmp_version", "librenms_id", "uptime", "traffic_in_mbps", "traffic_out_mbps", "ports_up", "ports_down", "sys_descr", "parent_id"];
const PORT_COLS = ["id", "asset_id", "name", "if_index", "admin", "oper", "speed", "in_mbps", "out_mbps", "errors", "face", "port_group", "down_since", "alarm_ack"];
const ALERT_COLS = ["id", "severity", "asset_id", "message", "at", "channel"];
const EVENT_COLS = ["id", "asset_id", "message", "at"];
const REPO_COLS = ["id", "name", "kind", "site", "capacity_tb", "used_pct", "status", "last_sync", "objects"];
const SUB_COLS = ["id", "module", "scope", "site", "plan", "seats", "status", "renews", "annual"];
const ACTIVITY_COLS = ["id", "text", "at"];
const SERVICE_COLS = ["name", "site", "health", "instances", "availability", "performance", "note"];
const CLUSTER_COLS = ["name", "site", "nodes", "ha", "version", "availability", "performance"];
const BACKUP_COLS = ["id", "job", "job_type", "status", "last_run", "size", "site"];
const REPORT_COLS = ["id", "name", "cadence", "audience", "description"];
const SWITCH_COLS = ["name", "site", "vendor", "ports", "status", "note"];
const ARRAY_COLS = ["name", "site", "kind", "usable", "used_pct", "status"];
const OPERATOR_COLS = ["name", "role", "sites", "auth", "status"];
const TARGET_COLS = ["id", "name", "site", "free_space", "status"];
const RESTORE_COLS = ["id", "workload", "points", "latest", "site"];
const POLICY_COLS = ["id", "name", "retention", "copy_to", "scope"];
const COLLECTOR_COLS = ["id", "name", "scope", "interval", "status"];
const HOST_COLS = ["id", "name", "site", "cluster_name", "status", "cpu", "mem", "ip"];
const WORKLOAD_APP_COLS = ["id", "name", "kind", "service_name", "vm_id", "host_id", "port", "status"];
const WORKLOAD_DB_COLS = ["id", "name", "engine", "service_name", "vm_id", "host_id", "status"];
const SAMPLE_COLS = ["id", "kind", "target", "hour", "up", "performance", "source", "detail"];
const DR_SERVICE_COLS = ["id", "name", "site", "standby_site", "tier", "status", "mode", "rpo", "rto", "owner", "service_ip", "owner_vm_id", "owner_source", "owner_checked_at"];
const DR_HOST_COLS = ["id", "name", "site", "pair", "status", "cpu", "mem", "ip"];
const DR_CLUSTER_COLS = ["id", "name", "site", "kind", "nodes", "status"];
const DR_VM_COLS = ["id", "name", "host_id", "cluster_id", "site", "status", "cpu", "mem", "ip", "mac"];
const DR_APP_COLS = ["id", "name", "kind", "service_id", "vm_id", "port", "status"];
const DR_DB_COLS = ["id", "name", "engine", "service_id", "vm_id", "replica", "status"];
const DR_WF_COLS = ["id", "service_id", "name", "mode", "steps", "last_run", "status", "step_state"];
const PERF_COLS = ["id", "target", "kind", "metric", "value", "at"];
const DR_EVENT_COLS = ["id", "target", "message", "at", "severity"];
const DR_ALERT_COLS = ["id", "target", "message", "severity", "state"];
const AUDIT_COLS = ["id", "actor", "action", "target", "at"];

function instanceRow(row: Instance) {
  return [row.id, row.name, row.site, row.status, row.cpu, row.mem, row.ip, row.kind, row.os, row.inMbps ?? null, row.outMbps ?? null, row.connections ?? null, row.hostId || null, row.clusterName || null];
}
function assetRow(row: InventoryItem) {
  return [row.id, row.name, row.category, row.site, row.vendor, row.model, row.serial, row.status, row.location, row.owner, row.ip, row.mac, row.deviceType, row.subnet, row.source, row.lastPoll, row.snmpVersion, row.librenmsId, row.uptime, row.trafficInMbps, row.trafficOutMbps, row.portsUp, row.portsDown, row.sysDescr, row.parentId];
}
function portRow(row: NetPort) {
  return [row.id, row.assetId, row.name, row.ifIndex, row.admin, row.oper, row.speed, row.inMbps, row.outMbps, row.errors, row.face, row.group, row.downSince, row.alarmAck];
}
function alertRow(row: NetAlert) {
  return [row.id, row.severity, row.assetId, row.message, row.at, row.channel];
}
function eventRow(row: NetEvent) {
  return [row.id, row.assetId, row.message, row.at];
}
function repoRow(row: ContentRepo) {
  return [row.id, row.name, row.kind, row.site, row.capacityTb, row.usedPct, row.status, row.lastSync, row.objects];
}
function subRow(row: Subscription) {
  return [row.id, row.module, row.scope, row.site, row.plan, row.seats, row.status, row.renews, row.annual];
}
function activityRow(row: Activity) {
  return [row.id, row.text, row.when];
}
function serviceRow(row: ComputeService) {
  return [row.name, row.site, row.health, row.instances, row.availability, row.performance, row.note];
}
function clusterRow(row: ComputeCluster) {
  return [row.name, row.site, row.nodes, row.ha, row.version, row.availability, row.performance];
}
function backupRow(row: BackupJob) {
  return [row.id, row.job, row.type, row.status, row.last, row.size, row.site];
}
function reportRow(row: ReportDef) {
  return [row.id, row.name, row.cadence, row.audience, row.description];
}
function switchRow(row: SanSwitch) {
  return [row.name, row.site, row.vendor, row.ports, row.status, row.note];
}
function arrayRow(row: StorageArray) {
  return [row.name, row.site, row.kind, row.usable, row.used, row.status];
}
function operatorRow(row: Operator) {
  return [row.name, row.role, row.sites, row.auth, row.status];
}
function targetRow(row: BackupTarget) {
  return [row.id, row.name, row.site, row.free, row.status];
}
function restoreRow(row: RestorePoint) {
  return [row.id, row.workload, row.points, row.latest, row.site];
}
function policyRow(row: BackupPolicy) {
  return [row.id, row.name, row.retention, row.copy, row.scope];
}
function collectorRow(row: Collector) {
  return [row.id, row.name, row.scope, row.interval, row.status];
}
function hostRow(row: PhysicalHost) {
  return [row.id, row.name, row.site, row.clusterName || null, row.status, row.cpu, row.mem, row.ip];
}
const HYPERVISOR_COLS = ["id", "name", "site", "kind", "address", "port", "transport", "login", "status", "cluster_name", "switch_name", "storage", "host_id", "uri", "detail"];
function hypervisorRow(row: Hypervisor) {
  return [row.id, row.name, row.site, row.kind, row.address, row.port, row.transport, row.login, row.status, row.clusterName, row.switchName, row.storage, row.hostId, row.uri, row.detail];
}
function workloadAppRow(row: WorkloadApp) {
  return [row.id, row.name, row.kind, row.serviceName, row.vmId || null, row.hostId || null, row.port, row.status];
}
function workloadDbRow(row: WorkloadDatabase) {
  return [row.id, row.name, row.engine, row.serviceName, row.vmId || null, row.hostId || null, row.status];
}
function sampleRow(row: WorkloadSample) {
  return [row.id, row.kind, row.target, row.hour, row.up, row.performance, row.source, row.detail];
}
function drServiceRow(row: DrService) {
  const source = row.ownerSource === "cluster" || row.ownerSource === "mac" ? row.ownerSource : "unconfirmed";
  return [row.id, row.name, row.site, row.standbySite, row.tier, row.status, row.mode, row.rpo, row.rto, row.owner, row.serviceIp ?? "", row.ownerVmId || null, source, row.ownerCheckedAt ?? ""];
}
function drHostRow(row: DrHost) {
  return [row.id, row.name, row.site, row.pair, row.status, row.cpu, row.mem, row.ip];
}
function drClusterRow(row: DrCluster) {
  return [row.id, row.name, row.site, row.kind, row.nodes, row.status];
}
function drVmRow(row: DrVm) {
  return [row.id, row.name, row.hostId, row.clusterId, row.site, row.status, row.cpu, row.mem, row.ip, row.mac ?? ""];
}
function drAppRow(row: DrApp) {
  return [row.id, row.name, row.kind, row.serviceId, row.vmId, row.port, row.status];
}
function drDbRow(row: DrDatabase) {
  return [row.id, row.name, row.engine, row.serviceId, row.vmId, row.replica, row.status];
}
function drWfRow(row: DrWorkflow) {
  return [row.id, row.serviceId, row.name, row.mode, JSON.stringify(row.steps ?? []), row.lastRun, row.status, JSON.stringify(row.stepState ?? [])];
}
function perfRow(row: DrPerf) {
  return [row.id, row.target, row.kind, row.metric, row.value, row.at];
}
function drEventRow(row: DrSignal) {
  return [row.id, row.target, row.message, row.at, row.severity];
}
function drAlertRow(row: DrAlertRow) {
  return [row.id, row.target, row.message, row.severity, row.state];
}
function auditRow(row: DrAudit) {
  return [row.id, row.actor, row.action, row.target, row.at];
}

function instanceFrom(row: Record<string, unknown>): Instance {
  const item: Instance = {
    id: str(row.id),
    name: str(row.name),
    site: str(row.site) as Instance["site"],
    status: str(row.status) as Instance["status"],
    cpu: Number(row.cpu),
    mem: Number(row.mem),
    ip: str(row.ip),
    kind: str(row.kind) as Instance["kind"],
    os: str(row.os),
  };
  if (row.in_mbps != null) item.inMbps = Number(row.in_mbps);
  if (row.out_mbps != null) item.outMbps = Number(row.out_mbps);
  if (row.connections != null) item.connections = Number(row.connections);
  item.hostId = row.host_id == null ? null : str(row.host_id);
  item.clusterName = row.cluster_name == null ? null : str(row.cluster_name);
  return item;
}
function assetFrom(row: Record<string, unknown>): InventoryItem {
  return {
    id: str(row.id),
    name: str(row.name),
    category: str(row.category) as InventoryItem["category"],
    site: str(row.site) as InventoryItem["site"],
    vendor: str(row.vendor),
    model: str(row.model),
    serial: str(row.serial),
    status: str(row.status) as InventoryItem["status"],
    location: str(row.location),
    owner: str(row.owner),
    ip: str(row.ip),
    mac: str(row.mac),
    deviceType: str(row.device_type) as InventoryItem["deviceType"],
    subnet: str(row.subnet),
    source: str(row.source) as InventoryItem["source"],
    lastPoll: str(row.last_poll),
    snmpVersion: str(row.snmp_version) as InventoryItem["snmpVersion"],
    librenmsId: str(row.librenms_id),
    uptime: str(row.uptime),
    trafficInMbps: Number(row.traffic_in_mbps),
    trafficOutMbps: Number(row.traffic_out_mbps),
    portsUp: Number(row.ports_up),
    portsDown: Number(row.ports_down),
    sysDescr: str(row.sys_descr),
    parentId: str(row.parent_id),
  };
}
function portFrom(row: Record<string, unknown>): NetPort {
  return {
    id: str(row.id),
    assetId: str(row.asset_id),
    name: str(row.name),
    ifIndex: Number(row.if_index),
    admin: str(row.admin) as NetPort["admin"],
    oper: str(row.oper) as NetPort["oper"],
    speed: str(row.speed),
    inMbps: Number(row.in_mbps),
    outMbps: Number(row.out_mbps),
    errors: Number(row.errors),
    face: str(row.face) as NetPort["face"],
    group: str(row.port_group),
    downSince: row.down_since == null ? null : Number(row.down_since),
    alarmAck: Boolean(row.alarm_ack),
  };
}
function alertFrom(row: Record<string, unknown>): NetAlert {
  return { id: str(row.id), severity: str(row.severity) as NetAlert["severity"], assetId: str(row.asset_id), message: str(row.message), at: str(row.at), channel: str(row.channel) as NetAlert["channel"] };
}
function eventFrom(row: Record<string, unknown>): NetEvent {
  return { id: str(row.id), assetId: str(row.asset_id), message: str(row.message), at: str(row.at) };
}
function repoFrom(row: Record<string, unknown>): ContentRepo {
  return { id: str(row.id), name: str(row.name), kind: str(row.kind) as ContentRepo["kind"], site: str(row.site) as ContentRepo["site"], capacityTb: Number(row.capacity_tb), usedPct: Number(row.used_pct), status: str(row.status) as ContentRepo["status"], lastSync: str(row.last_sync), objects: Number(row.objects) };
}
function subFrom(row: Record<string, unknown>): Subscription {
  return { id: str(row.id), module: str(row.module), scope: str(row.scope) as Subscription["scope"], site: str(row.site) as Subscription["site"], plan: str(row.plan), seats: str(row.seats), status: str(row.status) as Subscription["status"], renews: str(row.renews), annual: str(row.annual) };
}
function activityFrom(row: Record<string, unknown>): Activity {
  return { id: str(row.id), text: str(row.text), when: str(row.at) };
}
function serviceFrom(row: Record<string, unknown>): ComputeService {
  return { name: str(row.name), site: str(row.site) as ComputeService["site"], health: str(row.health) as ComputeService["health"], instances: Number(row.instances), availability: Number(row.availability), performance: Number(row.performance), note: str(row.note) };
}
function clusterFrom(row: Record<string, unknown>): ComputeCluster {
  return { name: str(row.name), site: str(row.site) as ComputeCluster["site"], nodes: Number(row.nodes), ha: str(row.ha) as ComputeCluster["ha"], version: str(row.version), availability: Number(row.availability), performance: Number(row.performance) };
}
function backupFrom(row: Record<string, unknown>): BackupJob {
  return { id: str(row.id), job: str(row.job), type: str(row.job_type), status: str(row.status) as BackupJob["status"], last: str(row.last_run), size: str(row.size), site: str(row.site) as BackupJob["site"] };
}
function reportFrom(row: Record<string, unknown>): ReportDef {
  return { id: str(row.id), name: str(row.name), cadence: str(row.cadence), audience: str(row.audience), description: str(row.description) };
}
function switchFrom(row: Record<string, unknown>): SanSwitch {
  return { name: str(row.name), site: str(row.site) as SanSwitch["site"], vendor: str(row.vendor), ports: Number(row.ports), status: str(row.status) as SanSwitch["status"], note: str(row.note) };
}
function arrayFrom(row: Record<string, unknown>): StorageArray {
  return { name: str(row.name), site: str(row.site) as StorageArray["site"], kind: str(row.kind), usable: str(row.usable), used: Number(row.used_pct), status: str(row.status) as StorageArray["status"] };
}
function operatorFrom(row: Record<string, unknown>): Operator {
  return { name: str(row.name), role: str(row.role), sites: str(row.sites), auth: str(row.auth), status: str(row.status) as Operator["status"] };
}
function targetFrom(row: Record<string, unknown>): BackupTarget {
  return { id: str(row.id), name: str(row.name), site: str(row.site) as BackupTarget["site"], free: str(row.free_space), status: str(row.status) as BackupTarget["status"] };
}
function restoreFrom(row: Record<string, unknown>): RestorePoint {
  return { id: str(row.id), workload: str(row.workload), points: Number(row.points), latest: str(row.latest), site: str(row.site) as RestorePoint["site"] };
}
function policyFrom(row: Record<string, unknown>): BackupPolicy {
  return { id: str(row.id), name: str(row.name), retention: str(row.retention), copy: str(row.copy_to), scope: str(row.scope) };
}
function collectorFrom(row: Record<string, unknown>): Collector {
  return { id: str(row.id), name: str(row.name), scope: str(row.scope), interval: str(row.interval), status: str(row.status) as Collector["status"] };
}
function hostFrom(row: Record<string, unknown>): PhysicalHost {
  return { id: str(row.id), name: str(row.name), site: str(row.site) as PhysicalHost["site"], clusterName: row.cluster_name == null ? null : str(row.cluster_name), status: str(row.status) as PhysicalHost["status"], cpu: Number(row.cpu), mem: Number(row.mem), ip: str(row.ip) };
}
function hypervisorFrom(row: Record<string, unknown>): Hypervisor {
  const kind = str(row.kind) === "libvirt" ? "libvirt" : "hyper-v";
  const transport = str(row.transport);
  const status = str(row.status);
  return {
    id: str(row.id),
    name: str(row.name),
    site: str(row.site) as Hypervisor["site"],
    kind,
    address: str(row.address),
    port: Number(row.port),
    transport: transport === "ssh" || transport === "tls" || transport === "winrm" ? transport : kind === "libvirt" ? "ssh" : "winrm",
    login: str(row.login),
    status: status === "Online" || status === "Degraded" || status === "Offline" ? status : "Unknown",
    clusterName: str(row.cluster_name),
    switchName: str(row.switch_name),
    storage: str(row.storage),
    hostId: str(row.host_id),
    uri: str(row.uri),
    detail: str(row.detail),
  };
}
function workloadAppFrom(row: Record<string, unknown>): WorkloadApp {
  return { id: str(row.id), name: str(row.name), kind: str(row.kind), serviceName: str(row.service_name), vmId: row.vm_id == null ? null : str(row.vm_id), hostId: row.host_id == null ? null : str(row.host_id), port: Number(row.port), status: str(row.status) as WorkloadApp["status"] };
}
function workloadDbFrom(row: Record<string, unknown>): WorkloadDatabase {
  return { id: str(row.id), name: str(row.name), engine: str(row.engine), serviceName: str(row.service_name), vmId: row.vm_id == null ? null : str(row.vm_id), hostId: row.host_id == null ? null : str(row.host_id), status: str(row.status) as WorkloadDatabase["status"] };
}
function sampleFrom(row: Record<string, unknown>): WorkloadSample {
  const kind = str(row.kind);
  return {
    id: str(row.id),
    kind: kind === "app" || kind === "database" || kind === "service" ? kind : "service",
    target: str(row.target),
    hour: str(row.hour),
    up: Number(row.up) === 1 ? 1 : 0,
    performance: Number(row.performance),
    source: str(row.source),
    detail: str(row.detail),
  };
}
function drServiceFrom(row: Record<string, unknown>): DrService {
  const source = str(row.owner_source);
  return {
    id: str(row.id),
    name: str(row.name),
    site: str(row.site) as DrService["site"],
    standbySite: str(row.standby_site) as DrService["standbySite"],
    tier: str(row.tier),
    status: str(row.status) as DrService["status"],
    mode: str(row.mode) as DrService["mode"],
    rpo: str(row.rpo),
    rto: str(row.rto),
    owner: str(row.owner),
    serviceIp: str(row.service_ip),
    ownerVmId: row.owner_vm_id == null || str(row.owner_vm_id) === "" ? null : str(row.owner_vm_id),
    ownerSource: source === "cluster" || source === "mac" ? source : "unconfirmed",
    ownerCheckedAt: str(row.owner_checked_at),
  };
}
function drHostFrom(row: Record<string, unknown>): DrHost {
  return { id: str(row.id), name: str(row.name), site: str(row.site) as DrHost["site"], pair: str(row.pair), status: str(row.status) as DrHost["status"], cpu: Number(row.cpu), mem: Number(row.mem), ip: str(row.ip) };
}
function drClusterFrom(row: Record<string, unknown>): DrCluster {
  return { id: str(row.id), name: str(row.name), site: str(row.site) as DrCluster["site"], kind: str(row.kind) as DrCluster["kind"], nodes: Number(row.nodes), status: str(row.status) as DrCluster["status"] };
}
function drVmFrom(row: Record<string, unknown>): DrVm {
  return { id: str(row.id), name: str(row.name), hostId: str(row.host_id), clusterId: str(row.cluster_id), site: str(row.site) as DrVm["site"], status: str(row.status) as DrVm["status"], cpu: Number(row.cpu), mem: Number(row.mem), ip: str(row.ip), mac: str(row.mac) };
}
function drAppFrom(row: Record<string, unknown>): DrApp {
  return { id: str(row.id), name: str(row.name), kind: str(row.kind) as DrApp["kind"], serviceId: str(row.service_id), vmId: str(row.vm_id), port: Number(row.port), status: str(row.status) as DrApp["status"] };
}
function drDbFrom(row: Record<string, unknown>): DrDatabase {
  return { id: str(row.id), name: str(row.name), engine: str(row.engine) as DrDatabase["engine"], serviceId: str(row.service_id), vmId: str(row.vm_id), replica: str(row.replica), status: str(row.status) as DrDatabase["status"] };
}
function drWfFrom(row: Record<string, unknown>): DrWorkflow {
  return { id: str(row.id), serviceId: str(row.service_id), name: str(row.name), mode: str(row.mode) as DrWorkflow["mode"], steps: asJson<string[]>(row.steps, []), stepState: asJson<DrWorkflow["stepState"]>(row.step_state, []), lastRun: str(row.last_run), status: str(row.status) as DrWorkflow["status"] };
}
function perfFrom(row: Record<string, unknown>): DrPerf {
  return { id: str(row.id), target: str(row.target), kind: str(row.kind), metric: str(row.metric), value: str(row.value), at: str(row.at) };
}
function drEventFrom(row: Record<string, unknown>): DrSignal {
  return { id: str(row.id), target: str(row.target), message: str(row.message), at: str(row.at), severity: str(row.severity) as DrSignal["severity"] };
}
function drAlertFrom(row: Record<string, unknown>): DrAlertRow {
  return { id: str(row.id), target: str(row.target), message: str(row.message), severity: str(row.severity) as DrAlertRow["severity"], state: str(row.state) as DrAlertRow["state"] };
}
function auditFrom(row: Record<string, unknown>): DrAudit {
  return { id: str(row.id), actor: str(row.actor), action: str(row.action), target: str(row.target), at: str(row.at) };
}

async function writeSettings(sql: Sql, cloud: CloudSnap) {
  const snmp = cloud.snmp;
  await sql.query(
    `insert into console_settings (
      id, role, site_filter, app_subnet, app_address, extra_subnets, poll_tick, last_poll_at,
      snmp_version, snmp_v1, snmp_v2c, snmp_v3_user, snmp_v3_auth, snmp_v3_priv, notify_email, notify_mobile
    ) values ('primary', $1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    on conflict (id) do update set
      role = excluded.role, site_filter = excluded.site_filter, app_subnet = excluded.app_subnet,
      app_address = excluded.app_address, extra_subnets = excluded.extra_subnets, poll_tick = excluded.poll_tick,
      last_poll_at = excluded.last_poll_at, snmp_version = excluded.snmp_version, snmp_v1 = excluded.snmp_v1,
      snmp_v2c = excluded.snmp_v2c, snmp_v3_user = excluded.snmp_v3_user, snmp_v3_auth = excluded.snmp_v3_auth,
      snmp_v3_priv = excluded.snmp_v3_priv, notify_email = excluded.notify_email, notify_mobile = excluded.notify_mobile`,
    [
      cloud.role ?? "vendor",
      cloud.site ?? "all",
      cloud.appSubnet ?? "",
      cloud.appAddress ?? "",
      JSON.stringify(cloud.extraSubnets ?? []),
      cloud.pollTick ?? 0,
      cloud.lastPollAt ?? 0,
      snmp?.version ?? "v2c",
      snmp?.v1 ?? "",
      snmp?.v2c ?? "",
      snmp?.v3User ?? "",
      snmp?.v3Auth ?? "",
      snmp?.v3Priv ?? "",
      snmp?.notifyEmail ?? "",
      snmp?.notifyMobile ?? "",
    ],
  );
}

async function replaceRows(sql: Sql, table: string, columns: string[], rows: unknown[][]) {
  await sql.query(`delete from ${table}`);
  if (columns.length === 0 || rows.length === 0) return;
  const jsonAt = new Set(columns.map((name, index) => (name === "steps" || name === "step_state" || name === "extra_subnets" ? index : -1)).filter((index) => index >= 0));
  for (const row of rows) {
    const marks = columns.map((_, index) => (jsonAt.has(index) ? `$${index + 1}::jsonb` : `$${index + 1}`));
    await sql.query(`insert into ${table} (${columns.join(", ")}) values (${marks.join(", ")})`, row);
  }
}

function asPayload(value: unknown): ConsolePayload | null {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Partial<ConsolePayload>;
  if (row.v !== 1 || !row.cloud || !row.dr) return null;
  return { v: 1, cloud: row.cloud, dr: row.dr };
}

function asJson<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value as T) ?? fallback;
}

function str(value: unknown) {
  return value == null ? "" : String(value);
}
