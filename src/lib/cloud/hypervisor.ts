import type { SiteKey } from "./model.ts";

export type HypervisorKind = "hyper-v" | "libvirt";
export type HypervisorTransport = "winrm" | "ssh" | "tls";
export type HypervisorStatus = "Online" | "Degraded" | "Offline" | "Unknown";

export type Hypervisor = {
  id: string;
  name: string;
  site: SiteKey;
  kind: HypervisorKind;
  address: string;
  port: number;
  transport: HypervisorTransport;
  login: string;
  status: HypervisorStatus;
  clusterName: string;
  switchName: string;
  storage: string;
  hostId: string;
  uri: string;
  detail: string;
};

export const HYPERVISORS: Hypervisor[] = [
  {
    id: "hv-east-01",
    name: "ph-east-01",
    site: "east",
    kind: "hyper-v",
    address: "10.10.1.11",
    port: 5985,
    transport: "winrm",
    login: "",
    status: "Unknown",
    clusterName: "east-compute",
    switchName: "External",
    storage: "C:/Hyper-V",
    hostId: "ph-east-01",
    uri: "",
    detail: "Recorded with the compute host. The console has not checked WinRM yet.",
  },
  {
    id: "hv-west-01",
    name: "ph-west-01",
    site: "west",
    kind: "hyper-v",
    address: "10.20.2.11",
    port: 5985,
    transport: "winrm",
    login: "",
    status: "Unknown",
    clusterName: "west-compute",
    switchName: "External",
    storage: "C:/Hyper-V",
    hostId: "ph-west-01",
    uri: "",
    detail: "Recorded with the compute host. The console has not checked WinRM yet.",
  },
  {
    id: "hv-central-01",
    name: "ph-central-01",
    site: "central",
    kind: "hyper-v",
    address: "10.30.1.11",
    port: 5985,
    transport: "winrm",
    login: "",
    status: "Unknown",
    clusterName: "central-dr",
    switchName: "External",
    storage: "C:/Hyper-V",
    hostId: "ph-central-01",
    uri: "",
    detail: "Recorded with the compute host. The console has not checked WinRM yet.",
  },
];

export function addressOk(value: string) {
  if (value.length < 1 || value.length > 253) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return value.split(".").every((part) => Number(part) <= 255);
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(value);
}

export function hypervisorDefaults(kind: HypervisorKind) {
  if (kind === "libvirt") return { transport: "ssh" as const, port: 22, switchName: "br0", storage: "default" };
  return { transport: "winrm" as const, port: 5985, switchName: "External", storage: "C:/Hyper-V" };
}

export function hypervisorUri(row: Pick<Hypervisor, "kind" | "transport" | "login" | "address" | "port" | "uri">) {
  const custom = row.uri.trim();
  if (custom) return custom;
  const address = row.address.trim();
  const login = row.login.trim();
  if (row.kind === "hyper-v") return address ? `winrm://${address}:${row.port || 5985}` : "";
  const user = login ? `${login}@` : "";
  if (!address) return "";
  if (row.transport === "tls") return `qemu+tls://${user}${address}:${row.port || 16514}/system`;
  return `qemu+ssh://${user}${address}:${row.port || 22}/system`;
}

export function cleanHypervisor(row: Hypervisor): Hypervisor {
  const kind: HypervisorKind = row.kind === "libvirt" ? "libvirt" : "hyper-v";
  const transport: HypervisorTransport = row.transport === "ssh" || row.transport === "tls" || row.transport === "winrm" ? row.transport : hypervisorDefaults(kind).transport;
  const fallback = hypervisorDefaults(kind).port;
  const port = Number.isInteger(row.port) && row.port >= 1 && row.port <= 65535 ? row.port : fallback;
  const status: HypervisorStatus = row.status === "Online" || row.status === "Degraded" || row.status === "Offline" ? row.status : "Unknown";
  return {
    ...row,
    id: row.id.trim(),
    name: row.name.trim() || row.id.trim(),
    kind,
    address: row.address.trim(),
    port,
    transport,
    login: row.login.trim(),
    status,
    clusterName: row.clusterName.trim(),
    switchName: row.switchName.trim(),
    storage: row.storage.trim(),
    hostId: row.hostId.trim(),
    uri: row.uri.trim(),
    detail: row.detail.trim(),
  };
}
