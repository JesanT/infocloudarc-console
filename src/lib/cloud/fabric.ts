import {
  completeAsset,
  type InventoryItem,
  type NetAlert,
  type NetEvent,
  type NetPort,
  type SiteKey,
  type SnmpConfig,
} from "@/lib/cloud/model";

export const TEMPLATE_HEADERS = [
  "name",
  "category",
  "site",
  "vendor",
  "model",
  "serial",
  "ip",
  "mac",
  "location",
  "owner",
  "deviceType",
  "subnet",
] as const;

export const DEFAULT_SNMP: SnmpConfig = {
  version: "v2c",
  v1: "public",
  v2c: "infocloudarc",
  v3User: "ops",
  v3Auth: "auth-pass",
  v3Priv: "priv-pass",
  notifyEmail: "ops@infocloudarc.internal",
  notifyMobile: "+1-555-0142",
};

const POLLED = new Set(["switch", "router", "firewall", "access-point"]);

export function isPolled(item: InventoryItem): boolean {
  return POLLED.has(item.deviceType);
}

export function assetKey(item: { serial?: string; ip?: string; name?: string }): string {
  const serial = item.serial?.trim().toLowerCase();
  if (serial) return `serial:${serial}`;
  const ip = item.ip?.trim();
  if (ip) return `ip:${ip}`;
  return `name:${item.name?.trim().toLowerCase() ?? ""}`;
}

export function buildPorts(asset: InventoryItem): NetPort[] {
  if (!isPolled(asset)) return [];
  const front = asset.deviceType === "router" || asset.deviceType === "firewall" ? 8 : 24;
  const back = asset.deviceType === "access-point" ? 0 : 4;
  const ports: NetPort[] = [];
  for (let index = 1; index <= front; index += 1) {
    const down = false;
    ports.push(port(asset.id, index, "front", down));
  }
  for (let index = 1; index <= back; index += 1) {
    ports.push(port(asset.id, front + index, "back", false));
  }
  return ports;
}

function port(assetId: string, ifIndex: number, face: "front" | "back", down: boolean): NetPort {
  const group = face === "back" ? "Uplinks" : `Group ${Math.ceil(ifIndex / 8)}`;
  const hot = !down && (ifIndex === 3 || (face === "back" && (ifIndex === 9 || ifIndex === 25)));
  const errors = !down && ifIndex === 6 ? 4 : 0;
  return {
    id: `${assetId}-if${ifIndex}`,
    assetId,
    name: face === "back" ? `Eth-uplink-${ifIndex}` : `Eth1/${ifIndex}`,
    ifIndex,
    admin: "up",
    oper: down ? "down" : "up",
    speed: face === "back" ? "100G" : "25G",
    inMbps: down ? 0 : hot ? 640 : 40 + (ifIndex % 7) * 18,
    outMbps: down ? 0 : hot ? 220 : 20 + (ifIndex % 5) * 12,
    errors,
    face,
    group,
    downSince: null,
    alarmAck: false,
  };
}

export function summarize(asset: InventoryItem, ports: NetPort[], tick: number): InventoryItem {
  const mine = ports.filter((item) => item.assetId === asset.id);
  if (mine.length === 0) return asset;
  const portsUp = mine.filter((item) => item.oper === "up").length;
  const portsDown = mine.length - portsUp;
  const trafficInMbps = Math.round(mine.reduce((sum, item) => sum + item.inMbps, 0));
  const trafficOutMbps = Math.round(mine.reduce((sum, item) => sum + item.outMbps, 0));
  const status = portsUp === 0 ? "Offline" : portsDown > 0 ? "Degraded" : "Online";
  return {
    ...asset,
    portsUp,
    portsDown,
    trafficInMbps,
    trafficOutMbps,
    status,
    lastPoll: "Just now",
    uptime: status === "Offline" ? "down" : `${14 + (tick % 3)}d ${(tick % 24)}h`,
  };
}

export const ALARM_WINDOW_MS = 24 * 60 * 60 * 1000;
export const LOAD_MBPS = 500;

export type PortLamp = "up" | "down" | "load" | "alarm";

export function portLamp(port: NetPort, now = Date.now()): PortLamp {
  if (port.oper === "down") {
    const recent = port.downSince != null && now - port.downSince < ALARM_WINDOW_MS;
    return recent && !port.alarmAck ? "alarm" : "down";
  }
  if (port.errors > 0 || port.inMbps + port.outMbps >= LOAD_MBPS) return "load";
  return "up";
}

export function nextPorts(asset: InventoryItem, ports: NetPort[], tick: number): NetPort[] {
  return ports.map((item) => {
    if (item.assetId !== asset.id) return item;
    let oper = item.oper;
    if (asset.id === "inv-04" && item.ifIndex === 12) oper = tick % 2 === 1 ? "down" : "up";
    if (asset.id === "inv-04" && item.ifIndex === 13) oper = tick % 3 === 0 ? "down" : "up";
    if (asset.id === "inv-14" && tick % 4 === 1) oper = "down";
    if (asset.id === "inv-14" && tick % 4 !== 1) oper = "up";
    const live = oper === "up";
    const hot = item.ifIndex === 3 || (item.face === "back" && (item.ifIndex === 9 || item.ifIndex === 25));
    const wave = 1 + ((tick + item.ifIndex) % 5) * 0.08;
    return {
      ...item,
      oper,
      errors: live && item.ifIndex === 6 ? 2 + (tick % 4) : 0,
      inMbps: live ? Math.round((hot ? 640 : 30 + (item.ifIndex % 6) * 20) * wave) : 0,
      outMbps: live ? Math.round((hot ? 220 : 12 + (item.ifIndex % 4) * 14) * wave) : 0,
    };
  });
}

export function runPoll(
  inventory: InventoryItem[],
  ports: NetPort[],
  tick: number,
  snmp: SnmpConfig,
): { inventory: InventoryItem[]; ports: NetPort[]; alerts: NetAlert[]; events: NetEvent[] } {
  const previous = new Map(ports.map((item) => [item.id, item.oper]));
  let next = ports;
  for (const asset of inventory) {
    if (!isPolled(asset)) continue;
    next = nextPorts(asset, next, tick);
  }
  const alerts: NetAlert[] = [];
  const events: NetEvent[] = [];
  const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const byAsset = new Map<string, { down: string[] }>();
  for (const item of next) {
    const before = previous.get(item.id);
    if (!before || before === item.oper) continue;
    const bucket = byAsset.get(item.assetId) ?? { down: [] };
    if (before === "up" && item.oper === "down") bucket.down.push(item.name);
    events.push({
      id: `ev-${tick}-${item.id}`,
      assetId: item.assetId,
      message: `${item.name} ${item.oper === "up" ? "came up" : "went down"}`,
      at: stamp,
    });
    byAsset.set(item.assetId, bucket);
  }
  next = next.map((item) => {
    const before = previous.get(item.id);
    if (item.oper === "down") {
      if (before !== "down") return { ...item, downSince: Date.now(), alarmAck: false };
      return item;
    }
    if (item.downSince == null && !item.alarmAck) return item;
    return { ...item, downSince: null, alarmAck: false };
  });
  for (const [assetId, change] of byAsset) {
    const asset = inventory.find((item) => item.id === assetId);
    const name = asset?.name ?? assetId;
    if (change.down.length >= 2 || (asset && next.filter((item) => item.assetId === assetId && item.oper === "up").length === 0)) {
      alerts.push({
        id: `al-major-${tick}-${assetId}`,
        severity: "major",
        assetId,
        message: change.down.length >= 2 ? `${name}: ${change.down.length} ports down (${change.down.slice(0, 3).join(", ")})` : `${name} is down`,
        at: stamp,
        channel: "mobile",
      });
      events.push({
        id: `ev-note-${tick}-${assetId}`,
        assetId,
        message: `Mobile alert queued to ${snmp.notifyMobile || "unconfigured device"}`,
        at: stamp,
      });
    } else if (change.down.length === 1) {
      alerts.push({
        id: `al-minor-${tick}-${assetId}`,
        severity: "minor",
        assetId,
        message: `${name}: ${change.down[0]} down`,
        at: stamp,
        channel: "email",
      });
      events.push({
        id: `ev-mail-${tick}-${assetId}`,
        assetId,
        message: `Email queued to ${snmp.notifyEmail || "unconfigured address"}`,
        at: stamp,
      });
    }
  }
  const updated = inventory.map((asset) => (isPolled(asset) ? summarize(asset, next, tick) : asset));
  return { inventory: updated, ports: next, alerts, events };
}

export type ImportRow = {
  name: string;
  category: InventoryItem["category"];
  site: SiteKey;
  vendor: string;
  model: string;
  serial: string;
  ip: string;
  mac: string;
  location: string;
  owner: string;
  deviceType: InventoryItem["deviceType"];
  subnet: string;
};

export function parseCsv(text: string): ImportRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsv(lines[0]).map((cell) => cell.trim().toLowerCase());
  return lines.slice(1).map((line) => rowFrom(headers, splitCsv(line))).filter((row) => row.name);
}

function splitCsv(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells;
}

function rowFrom(headers: string[], cells: string[]): ImportRow {
  const get = (key: string) => cells[headers.indexOf(key)]?.trim() ?? "";
  const category = (["Compute", "Network", "Storage", "Software"].includes(get("category"))
    ? get("category")
    : "Network") as InventoryItem["category"];
  const site = (["east", "west", "central"].includes(get("site")) ? get("site") : "east") as SiteKey;
  const deviceType = (["switch", "router", "firewall", "server", "storage", "access-point", "software"].includes(get("devicetype"))
    ? get("devicetype")
    : category === "Network"
      ? "switch"
      : category === "Compute"
        ? "server"
        : category === "Storage"
          ? "storage"
          : "software") as InventoryItem["deviceType"];
  return {
    name: get("name"),
    category,
    site,
    vendor: get("vendor"),
    model: get("model"),
    serial: get("serial"),
    ip: get("ip"),
    mac: get("mac"),
    location: get("location"),
    owner: get("owner") || "Network",
    deviceType,
    subnet: get("subnet"),
  };
}

export function rowToAsset(row: ImportRow, source: InventoryItem["source"]): InventoryItem {
  return completeAsset({
    id: `inv-${row.serial || row.ip || row.name}`.replace(/\s+/g, "-").toLowerCase(),
    name: row.name,
    category: row.category,
    site: row.site,
    vendor: row.vendor,
    model: row.model,
    serial: row.serial || `DISC-${row.ip}`,
    status: "Online",
    location: row.location || "Discovered",
    owner: row.owner,
    ip: row.ip,
    mac: row.mac,
    deviceType: row.deviceType,
    subnet: row.subnet,
    source,
    sysDescr: source === "discovery" ? "SNMP discovered" : row.model,
  });
}

export function catalogFor(cidr: string): ImportRow[] {
  const tables: Record<string, ImportRow[]> = {
    "10.10.1.0/24": [
      { name: "leaf-east-03", category: "Network", site: "east", vendor: "Arista", model: "7050X3", serial: "ARI-7050-318", ip: "10.10.1.6", mac: "00:1c:73:aa:01:06", location: "Row C ToR", owner: "Network", deviceType: "switch", subnet: cidr },
      { name: "ap-east-01", category: "Network", site: "east", vendor: "Cisco", model: "C9120", serial: "C9120-1104", ip: "10.10.1.40", mac: "00:2a:10:bb:01:28", location: "Hall A", owner: "Network", deviceType: "access-point", subnet: cidr },
    ],
    "10.20.2.0/24": [
      { name: "leaf-west-05", category: "Network", site: "west", vendor: "Arista", model: "7050X3", serial: "ARI-7050-505", ip: "10.20.2.5", mac: "00:1c:73:cc:02:05", location: "Row A ToR", owner: "Network", deviceType: "switch", subnet: cidr },
    ],
    "10.30.1.0/24": [
      { name: "leaf-central-02", category: "Network", site: "central", vendor: "Cisco", model: "Nexus 93180", serial: "NX9K-6621", ip: "10.30.1.6", mac: "00:2a:10:dd:03:06", location: "DR hall", owner: "Network", deviceType: "switch", subnet: cidr },
    ],
  };
  return tables[cidr] ?? [];
}

export function templateCsv(): string {
  const sample = [
    "leaf-east-04",
    "Network",
    "east",
    "Arista",
    "7050X3",
    "ARI-7050-404",
    "10.10.1.7",
    "00:1c:73:aa:01:07",
    "Row D ToR",
    "Network",
    "switch",
    "10.10.1.0/24",
  ];
  return `${TEMPLATE_HEADERS.join(",")}\n${sample.join(",")}\n`;
}
