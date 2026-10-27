export type GuestDisk = {
  target: string;
  path: string;
  device: "disk" | "cdrom";
  bytes: number;
};

export type GuestNic = {
  mac: string;
  source: string;
  model: string;
  address: string;
};

export type GuestView = {
  state: string;
  vcpu: number;
  memoryMb: number;
  disks: GuestDisk[];
  nics: GuestNic[];
};

export function emptyGuest(): GuestView {
  return { state: "", vcpu: 0, memoryMb: 0, disks: [], nics: [] };
}

function afterColon(line: string) {
  const cut = line.indexOf(":");
  return cut < 0 ? "" : line.slice(cut + 1).trim();
}

function section(text: string, name: string) {
  const start = text.indexOf(`##${name}\n`);
  if (start < 0) return "";
  const body = text.slice(start + name.length + 3);
  const next = body.search(/\n##[A-Z]+\n/);
  return (next < 0 ? body : body.slice(0, next)).trim();
}

export function parseLibvirtHardware(raw: string): GuestView {
  const info = section(raw, "INFO");
  const blk = section(raw, "BLK");
  const nics = section(raw, "IF");
  const addr = section(raw, "ADDR");
  const size = section(raw, "SIZE");
  const view = emptyGuest();
  for (const line of info.split("\n")) {
    if (line.startsWith("State:")) view.state = afterColon(line);
    if (line.startsWith("CPU(s):")) view.vcpu = Number(afterColon(line)) || 0;
    if (line.startsWith("Used memory:")) {
      const kb = Number(afterColon(line).split(/\s+/)[0]);
      if (Number.isFinite(kb)) view.memoryMb = Math.round(kb / 1024);
    }
  }
  const bytes = new Map<string, number>();
  let current = "";
  for (const line of size.split("\n")) {
    if (line.startsWith("TARGET ")) current = line.slice(7).trim();
    if (line.startsWith("Capacity:") && current) bytes.set(current, Number(afterColon(line)) || 0);
  }
  for (const line of blk.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4 || parts[0] === "Type" || parts[0].startsWith("-")) continue;
    const device = parts[1] === "cdrom" ? "cdrom" : parts[1] === "disk" ? "disk" : null;
    if (!device) continue;
    const target = parts[2] ?? "";
    const path = parts.slice(3).join(" ");
    view.disks.push({ target, path: path === "-" ? "" : path, device, bytes: bytes.get(target) ?? 0 });
  }
  const addresses = new Map<string, string>();
  for (const line of addr.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4 || parts[0] === "Name" || parts[0].startsWith("-")) continue;
    const mac = (parts[1] ?? "").toLowerCase();
    const protocol = parts[2] ?? "";
    const address = parts[3] ?? "";
    if (protocol === "ipv4" && mac) addresses.set(mac, address.replace(/\/\d+$/, ""));
  }
  for (const line of nics.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5 || parts[0] === "Interface" || parts[0].startsWith("-")) continue;
    const mac = (parts[4] ?? "").toLowerCase();
    view.nics.push({
      mac,
      source: parts[2] ?? "",
      model: parts[3] ?? "",
      address: addresses.get(mac) ?? "",
    });
  }
  return view;
}

export function parseHypervHardware(raw: string): GuestView {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return emptyGuest();
  const body = JSON.parse(raw.slice(start, end + 1)) as {
    state?: string;
    vcpu?: number;
    memoryMb?: number;
    disks?: GuestDisk[];
    nics?: GuestNic[];
  };
  return {
    state: String(body.state ?? ""),
    vcpu: Number(body.vcpu) || 0,
    memoryMb: Number(body.memoryMb) || 0,
    disks: Array.isArray(body.disks)
      ? body.disks.map((disk) => ({
          target: String(disk.target ?? ""),
          path: String(disk.path ?? ""),
          device: disk.device === "cdrom" ? "cdrom" : "disk",
          bytes: Number(disk.bytes) || 0,
        }))
      : [],
    nics: Array.isArray(body.nics)
      ? body.nics.map((nic) => ({
          mac: String(nic.mac ?? "").toLowerCase(),
          source: String(nic.source ?? ""),
          model: String(nic.model ?? "hyper-v"),
          address: String(nic.address ?? ""),
        }))
      : [],
  };
}

export function formatBytes(bytes: number) {
  if (!bytes) return "Unknown";
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${Math.max(1, Math.round(mb))} MB`;
}

export function formatMac(mac: string) {
  const hex = mac.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length !== 12) return mac;
  return hex.toLowerCase().replace(/(.{2})(?=.)/g, "$1:");
}
