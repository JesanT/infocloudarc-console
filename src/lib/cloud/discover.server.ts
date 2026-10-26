import net from "node:net";
import os from "node:os";

export type ProbeHost = { ip: string; ports: number[] };

export function readAppSubnet(): { address: string; cidr: string } {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (!isPrivate(entry.address)) continue;
      const prefix = prefixFromMask(entry.netmask);
      const network = networkAddress(entry.address, prefix);
      return { address: entry.address, cidr: `${network}/${prefix}` };
    }
  }
  return { address: "127.0.0.1", cidr: "127.0.0.0/8" };
}

export async function probeCidr(cidr: string): Promise<{ cidr: string; hosts: ProbeHost[] }> {
  const parsed = parseCidr(cidr);
  if (!parsed || !isPrivate(parsed.network)) return { cidr, hosts: [] };
  const targets = new Set<string>();
  targets.add(hostAt(parsed.network, parsed.prefix, 1));
  const local = readAppSubnet();
  if (inCidr(local.address, parsed.network, parsed.prefix)) targets.add(local.address);
  const hosts: ProbeHost[] = [];
  for (const ip of targets) {
    if (!ip) continue;
    const ports = await openPorts(ip);
    if (ports.length > 0 || ip === local.address) hosts.push({ ip, ports });
  }
  return { cidr, hosts };
}

function openPorts(ip: string): Promise<number[]> {
  return Promise.all([22, 80, 443, 161].map(async (port) => ((await probe(ip, port)) ? port : 0))).then((list) =>
    list.filter((port) => port > 0),
  );
}

function probe(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 250 });
    const finish = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function parseCidr(cidr: string): { network: string; prefix: number } | null {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(cidr.trim());
  if (!match) return null;
  const prefix = Number(match[2]);
  if (prefix < 16 || prefix > 30) return null;
  if (!match[1].split(".").every((part) => Number(part) <= 255)) return null;
  return { network: networkAddress(match[1], prefix), prefix };
}

function isPrivate(ip: string): boolean {
  return ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

function prefixFromMask(mask: string): number {
  const bits = mask
    .split(".")
    .map((part) => Number(part).toString(2).padStart(8, "0"))
    .join("");
  return bits.indexOf("0") === -1 ? 32 : bits.indexOf("0");
}

function networkAddress(ip: string, prefix: number): string {
  const value = ip.split(".").reduce((sum, part) => (sum << 8) + Number(part), 0) >>> 0;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (value & mask) >>> 0;
  return [24, 16, 8, 0].map((shift) => (network >>> shift) & 255).join(".");
}

function hostAt(network: string, prefix: number, host: number): string {
  const base = network.split(".").reduce((sum, part) => (sum << 8) + Number(part), 0) >>> 0;
  const size = 2 ** (32 - prefix);
  if (host >= size) return "";
  const value = (base + host) >>> 0;
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

function inCidr(ip: string, network: string, prefix: number): boolean {
  return networkAddress(ip, prefix) === network;
}
