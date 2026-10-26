import { create } from "zustand";
import type { SiteKey } from "@/lib/cloud/model";
import { ROLE_LABEL } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";

export type FailoverMode = "auto" | "manual";
export type AppKind = "tomcat" | "iis" | "other";
export type DbKind = "mssql" | "mysql" | "mongodb" | "postgresql" | "other";
export type Health = "Healthy" | "Warning" | "Degraded" | "Critical" | "Offline";

export type DrService = {
  id: string;
  name: string;
  site: SiteKey;
  standbySite: SiteKey;
  tier: string;
  status: Health;
  mode: FailoverMode;
  rpo: string;
  rto: string;
  owner: string;
};

export type DrHost = {
  id: string;
  name: string;
  site: SiteKey;
  pair: string;
  status: "Online" | "Degraded" | "Offline";
  cpu: number;
  mem: number;
  ip: string;
};

export type DrVm = {
  id: string;
  name: string;
  hostId: string;
  clusterId: string;
  site: SiteKey;
  status: "running" | "stopped";
  cpu: number;
  mem: number;
  ip: string;
};

export type DrCluster = {
  id: string;
  name: string;
  site: SiteKey;
  kind: "Application" | "Database";
  nodes: number;
  status: "Healthy" | "Degraded";
};

export type DrApp = {
  id: string;
  name: string;
  kind: AppKind;
  serviceId: string;
  vmId: string;
  port: number;
  status: Health;
};

export type DrDatabase = {
  id: string;
  name: string;
  engine: DbKind;
  serviceId: string;
  vmId: string;
  replica: string;
  status: Health;
};

export type DrWorkflow = {
  id: string;
  serviceId: string;
  name: string;
  mode: FailoverMode;
  steps: string[];
  lastRun: string;
  status: "Ready" | "Success" | "Failed";
};

export type DrPerf = { id: string; target: string; kind: string; metric: string; value: string; at: string };
export type DrSignal = { id: string; target: string; message: string; at: string; severity: "Info" | "Warning" | "Critical" };
export type DrAlertRow = { id: string; target: string; message: string; severity: "Warning" | "Critical"; state: "Open" | "Ack" };
export type DrAudit = { id: string; actor: string; action: string; target: string; at: string };

export const APP_LABEL: Record<AppKind | "all", string> = {
  tomcat: "Apache Tomcat",
  iis: "IIS",
  other: "Other",
  all: "All applications",
};

export const DB_LABEL: Record<DbKind | "all", string> = {
  mssql: "MSSQL Service",
  mysql: "MYSQL Service",
  mongodb: "Mongodb",
  postgresql: "PostgreSQL",
  other: "Other",
  all: "All databases",
};

const SERVICES: DrService[] = [
  { id: "svc-checkout", name: "checkout-api", site: "east", standbySite: "west", tier: "Gold", status: "Healthy", mode: "auto", rpo: "1 min", rto: "5 min", owner: "Commerce" },
  { id: "svc-portal", name: "intranet-portal", site: "east", standbySite: "central", tier: "Silver", status: "Healthy", mode: "manual", rpo: "1 h", rto: "30 min", owner: "Workplace" },
  { id: "svc-billing", name: "billing-core", site: "west", standbySite: "central", tier: "Gold", status: "Warning", mode: "manual", rpo: "5 min", rto: "10 min", owner: "Finance" },
  { id: "svc-catalog", name: "catalog-search", site: "east", standbySite: "west", tier: "Gold", status: "Healthy", mode: "auto", rpo: "1 min", rto: "5 min", owner: "Commerce" },
  { id: "svc-hr", name: "hr-suite", site: "central", standbySite: "east", tier: "Silver", status: "Healthy", mode: "manual", rpo: "1 h", rto: "20 min", owner: "People" },
];

const HOSTS: DrHost[] = [
  { id: "ph-e-01", name: "ph-east-01", site: "east", pair: "pair-a", status: "Online", cpu: 38, mem: 54, ip: "10.10.1.11" },
  { id: "ph-w-01", name: "ph-west-01", site: "west", pair: "pair-a", status: "Online", cpu: 22, mem: 41, ip: "10.20.2.11" },
  { id: "ph-e-02", name: "ph-east-02", site: "east", pair: "pair-b", status: "Online", cpu: 44, mem: 61, ip: "10.10.1.12" },
  { id: "ph-c-01", name: "ph-central-01", site: "central", pair: "pair-b", status: "Online", cpu: 19, mem: 33, ip: "10.30.1.11" },
  { id: "ph-w-02", name: "ph-west-02", site: "west", pair: "pair-c", status: "Degraded", cpu: 71, mem: 77, ip: "10.20.2.12" },
  { id: "ph-c-02", name: "ph-central-02", site: "central", pair: "pair-c", status: "Online", cpu: 28, mem: 46, ip: "10.30.1.12" },
  { id: "ph-c-03", name: "ph-central-03", site: "central", pair: "pair-d", status: "Online", cpu: 35, mem: 49, ip: "10.30.1.13" },
  { id: "ph-e-03", name: "ph-east-03", site: "east", pair: "pair-d", status: "Online", cpu: 17, mem: 29, ip: "10.10.1.13" },
];

const CLUSTERS: DrCluster[] = [
  { id: "cl-east-app", name: "east-app", site: "east", kind: "Application", nodes: 4, status: "Healthy" },
  { id: "cl-west-app", name: "west-app", site: "west", kind: "Application", nodes: 3, status: "Healthy" },
  { id: "cl-east-db", name: "east-db", site: "east", kind: "Database", nodes: 2, status: "Healthy" },
  { id: "cl-west-db", name: "west-db", site: "west", kind: "Database", nodes: 2, status: "Degraded" },
  { id: "cl-central-app", name: "central-app", site: "central", kind: "Application", nodes: 2, status: "Healthy" },
  { id: "cl-central-db", name: "central-db", site: "central", kind: "Database", nodes: 2, status: "Healthy" },
];

const VMS: DrVm[] = [
  { id: "vm-chk-e", name: "vm-checkout-e", hostId: "ph-e-01", clusterId: "cl-east-app", site: "east", status: "running", cpu: 36, mem: 48, ip: "10.10.1.41" },
  { id: "vm-chk-w", name: "vm-checkout-w", hostId: "ph-w-01", clusterId: "cl-west-app", site: "west", status: "running", cpu: 12, mem: 30, ip: "10.20.2.41" },
  { id: "vm-pg-e", name: "vm-pg-e", hostId: "ph-e-02", clusterId: "cl-east-db", site: "east", status: "running", cpu: 52, mem: 70, ip: "10.10.1.51" },
  { id: "vm-pg-w", name: "vm-pg-w", hostId: "ph-w-01", clusterId: "cl-west-db", site: "west", status: "running", cpu: 18, mem: 40, ip: "10.20.2.51" },
  { id: "vm-iis-e", name: "vm-portal-e", hostId: "ph-e-01", clusterId: "cl-east-app", site: "east", status: "running", cpu: 24, mem: 38, ip: "10.10.1.42" },
  { id: "vm-iis-c", name: "vm-portal-c", hostId: "ph-c-01", clusterId: "cl-central-app", site: "central", status: "running", cpu: 9, mem: 22, ip: "10.30.1.42" },
  { id: "vm-ot-e", name: "vm-cache-e", hostId: "ph-e-02", clusterId: "cl-east-db", site: "east", status: "running", cpu: 15, mem: 28, ip: "10.10.1.61" },
  { id: "vm-ot-c", name: "vm-cache-c", hostId: "ph-c-01", clusterId: "cl-central-db", site: "central", status: "stopped", cpu: 0, mem: 0, ip: "10.30.1.61" },
  { id: "vm-bill-w", name: "vm-billing-w", hostId: "ph-w-02", clusterId: "cl-west-app", site: "west", status: "running", cpu: 61, mem: 66, ip: "10.20.2.43" },
  { id: "vm-bill-c", name: "vm-billing-c", hostId: "ph-c-02", clusterId: "cl-central-app", site: "central", status: "running", cpu: 11, mem: 26, ip: "10.30.1.43" },
  { id: "vm-ms-w", name: "vm-mssql-w", hostId: "ph-w-02", clusterId: "cl-west-db", site: "west", status: "running", cpu: 74, mem: 81, ip: "10.20.2.52" },
  { id: "vm-ms-c", name: "vm-mssql-c", hostId: "ph-c-02", clusterId: "cl-central-db", site: "central", status: "running", cpu: 14, mem: 34, ip: "10.30.1.52" },
  { id: "vm-cat-e", name: "vm-catalog-e", hostId: "ph-e-03", clusterId: "cl-east-app", site: "east", status: "running", cpu: 29, mem: 44, ip: "10.10.1.44" },
  { id: "vm-cat-w", name: "vm-catalog-w", hostId: "ph-w-01", clusterId: "cl-west-app", site: "west", status: "running", cpu: 10, mem: 24, ip: "10.20.2.44" },
  { id: "vm-mo-e", name: "vm-mongo-e", hostId: "ph-e-03", clusterId: "cl-east-db", site: "east", status: "running", cpu: 33, mem: 58, ip: "10.10.1.53" },
  { id: "vm-mo-w", name: "vm-mongo-w", hostId: "ph-w-01", clusterId: "cl-west-db", site: "west", status: "running", cpu: 8, mem: 21, ip: "10.20.2.53" },
  { id: "vm-hr-c", name: "vm-hr-c", hostId: "ph-c-03", clusterId: "cl-central-app", site: "central", status: "running", cpu: 21, mem: 36, ip: "10.30.1.45" },
  { id: "vm-hr-e", name: "vm-hr-e", hostId: "ph-e-03", clusterId: "cl-east-app", site: "east", status: "running", cpu: 7, mem: 18, ip: "10.10.1.45" },
  { id: "vm-my-c", name: "vm-mysql-c", hostId: "ph-c-03", clusterId: "cl-central-db", site: "central", status: "running", cpu: 27, mem: 49, ip: "10.30.1.54" },
  { id: "vm-my-e", name: "vm-mysql-e", hostId: "ph-e-02", clusterId: "cl-east-db", site: "east", status: "running", cpu: 9, mem: 20, ip: "10.10.1.54" },
];

const APPS: DrApp[] = [
  { id: "app-chk-e", name: "checkout-web", kind: "tomcat", serviceId: "svc-checkout", vmId: "vm-chk-e", port: 8080, status: "Healthy" },
  { id: "app-chk-w", name: "checkout-web", kind: "tomcat", serviceId: "svc-checkout", vmId: "vm-chk-w", port: 8080, status: "Healthy" },
  { id: "app-iis-e", name: "intranet-portal", kind: "iis", serviceId: "svc-portal", vmId: "vm-iis-e", port: 443, status: "Healthy" },
  { id: "app-iis-c", name: "intranet-portal", kind: "iis", serviceId: "svc-portal", vmId: "vm-iis-c", port: 443, status: "Healthy" },
  { id: "app-bill-w", name: "billing-ui", kind: "other", serviceId: "svc-billing", vmId: "vm-bill-w", port: 8443, status: "Degraded" },
  { id: "app-bill-c", name: "billing-ui", kind: "other", serviceId: "svc-billing", vmId: "vm-bill-c", port: 8443, status: "Healthy" },
  { id: "app-cat-e", name: "catalog-api", kind: "other", serviceId: "svc-catalog", vmId: "vm-cat-e", port: 8081, status: "Healthy" },
  { id: "app-cat-w", name: "catalog-api", kind: "other", serviceId: "svc-catalog", vmId: "vm-cat-w", port: 8081, status: "Healthy" },
];

const DATABASES: DrDatabase[] = [
  { id: "db-pg-e", name: "checkout-pg", engine: "postgresql", serviceId: "svc-checkout", vmId: "vm-pg-e", replica: "Streaming", status: "Healthy" },
  { id: "db-pg-w", name: "checkout-pg", engine: "postgresql", serviceId: "svc-checkout", vmId: "vm-pg-w", replica: "Streaming", status: "Healthy" },
  { id: "db-ms-w", name: "billing-mssql", engine: "mssql", serviceId: "svc-billing", vmId: "vm-ms-w", replica: "Always On", status: "Warning" },
  { id: "db-ms-c", name: "billing-mssql", engine: "mssql", serviceId: "svc-billing", vmId: "vm-ms-c", replica: "Always On", status: "Healthy" },
  { id: "db-my-c", name: "hr-mysql", engine: "mysql", serviceId: "svc-hr", vmId: "vm-my-c", replica: "Async", status: "Healthy" },
  { id: "db-my-e", name: "hr-mysql", engine: "mysql", serviceId: "svc-hr", vmId: "vm-my-e", replica: "Async", status: "Healthy" },
  { id: "db-mo-e", name: "catalog-mongo", engine: "mongodb", serviceId: "svc-catalog", vmId: "vm-mo-e", replica: "Replica set", status: "Healthy" },
  { id: "db-mo-w", name: "catalog-mongo", engine: "mongodb", serviceId: "svc-catalog", vmId: "vm-mo-w", replica: "Replica set", status: "Healthy" },
  { id: "db-ot-e", name: "portal-cache", engine: "other", serviceId: "svc-portal", vmId: "vm-ot-e", replica: "None", status: "Healthy" },
  { id: "db-ot-c", name: "portal-cache", engine: "other", serviceId: "svc-portal", vmId: "vm-ot-c", replica: "None", status: "Offline" },
];

const WORKFLOWS: DrWorkflow[] = SERVICES.map((service) => ({
  id: `wf-${service.id}`,
  serviceId: service.id,
  name: `${service.name} failover`,
  mode: service.mode,
  steps: ["Quiesce writes", "Promote standby database", "Start application on standby host", "Move service address", "Verify health"],
  lastRun: service.id === "svc-billing" ? "6 h ago" : "Not run",
  status: "Ready" as const,
}));

const PERF: DrPerf[] = [
  { id: "p1", target: "checkout-api", kind: "service", metric: "Latency", value: "42 ms", at: "1 min" },
  { id: "p2", target: "checkout-web", kind: "application", metric: "Requests", value: "820/s", at: "1 min" },
  { id: "p3", target: "checkout-pg", kind: "database", metric: "Commit lag", value: "0.4 s", at: "1 min" },
  { id: "p4", target: "vm-mssql-w", kind: "vm", metric: "CPU", value: "74%", at: "1 min" },
  { id: "p5", target: "ph-west-02", kind: "host", metric: "Memory", value: "77%", at: "1 min" },
  { id: "p6", target: "hr-mysql", kind: "database", metric: "Connections", value: "86", at: "1 min" },
];

const EVENTS: DrSignal[] = [
  { id: "e1", target: "billing-mssql", message: "Always On commit lag above 2s", at: "12 min", severity: "Warning" },
  { id: "e2", target: "ph-west-02", message: "Host memory above 75%", at: "18 min", severity: "Warning" },
  { id: "e3", target: "checkout-api", message: "Automated workflow armed", at: "1 d", severity: "Info" },
];

const ALERTS: DrAlertRow[] = [
  { id: "al1", target: "billing-core", message: "Standby cache offline at Site-Central", severity: "Warning", state: "Open" },
  { id: "al2", target: "ph-west-02", message: "Physical host degraded", severity: "Critical", state: "Open" },
];

const AUDIT: DrAudit[] = [
  { id: "au1", actor: "Vendor", action: "Armed automated failover", target: "checkout-api", at: "1 d" },
  { id: "au2", actor: "Global", action: "Updated RPO", target: "billing-core", at: "3 d" },
];

type DrState = {
  services: DrService[];
  hosts: DrHost[];
  vms: DrVm[];
  clusters: DrCluster[];
  apps: DrApp[];
  databases: DrDatabase[];
  workflows: DrWorkflow[];
  performance: DrPerf[];
  events: DrSignal[];
  alerts: DrAlertRow[];
  audit: DrAudit[];
  setMode: (serviceId: string, mode: FailoverMode) => void;
  runFailover: (serviceId: string, trigger: FailoverMode) => void;
};

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function allowed(service: DrService): boolean {
  const { role } = useCloud.getState();
  if (role === "vendor" || role === "global") return true;
  return service.site === "east" || service.standbySite === "east";
}

export const useDr = create<DrState>((set, get) => ({
  services: SERVICES,
  hosts: HOSTS,
  vms: VMS,
  clusters: CLUSTERS,
  apps: APPS,
  databases: DATABASES,
  workflows: WORKFLOWS,
  performance: PERF,
  events: EVENTS,
  alerts: ALERTS,
  audit: AUDIT,
  setMode: (serviceId, mode) => {
    const service = get().services.find((item) => item.id === serviceId);
    if (!service) return;
    const cloud = useCloud.getState();
    if (!allowed(service)) {
      cloud.flash("Site access can change failover only for Site-East services.");
      return;
    }
    const at = nowLabel();
    set({
      services: get().services.map((item) => (item.id === serviceId ? { ...item, mode } : item)),
      workflows: get().workflows.map((item) => (item.serviceId === serviceId ? { ...item, mode } : item)),
      audit: [{ id: `au-${Date.now()}`, actor: ROLE_LABEL[cloud.role], action: mode === "auto" ? "Armed automated failover" : "Set manual failover", target: service.name, at }, ...get().audit].slice(0, 20),
    });
    cloud.flash(`${service.name} is now ${mode === "auto" ? "automated" : "manual"} failover.`);
  },
  runFailover: (serviceId, trigger) => {
    const service = get().services.find((item) => item.id === serviceId);
    if (!service) return;
    const cloud = useCloud.getState();
    if (!allowed(service)) {
      cloud.flash("Site access can fail over only Site-East services.");
      return;
    }
    if (trigger === "auto" && service.mode !== "auto") {
      cloud.flash("Arm automated failover before running this workflow.");
      return;
    }
    if (trigger === "manual" && service.mode === "auto") {
      cloud.flash("This service is armed for automated failover. Run the workflow, or switch it to manual.");
      return;
    }
    const at = nowLabel();
    const from = service.site;
    const to = service.standbySite;
    set({
      services: get().services.map((item) => (item.id === serviceId ? { ...item, site: to, standbySite: from, status: "Healthy" } : item)),
      workflows: get().workflows.map((item) => (item.serviceId === serviceId ? { ...item, lastRun: "Just now", status: "Success" } : item)),
      events: [{ id: `ev-${Date.now()}`, target: service.name, message: `${trigger === "auto" ? "Automated" : "Manual"} failover ${from} to ${to}`, at, severity: "Info" as const }, ...get().events].slice(0, 20),
      alerts: [{ id: `al-${Date.now()}`, target: service.name, message: `Failover completed. Verify ${to} health.`, severity: "Warning" as const, state: "Open" as const }, ...get().alerts].slice(0, 20),
      audit: [{ id: `au-${Date.now()}`, actor: ROLE_LABEL[cloud.role], action: `${trigger === "auto" ? "Automated" : "Manual"} failover`, target: `${service.name} ${from} → ${to}`, at }, ...get().audit].slice(0, 20),
      performance: [{ id: `pf-${Date.now()}`, target: service.name, kind: "service", metric: "Failover", value: trigger === "auto" ? "38 s" : "2 min", at }, ...get().performance].slice(0, 24),
    });
    cloud.flash(`${service.name} failed over from ${from} to ${to}.`);
  },
}));
