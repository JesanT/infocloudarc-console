import { useEffect, useState } from "react";
import { Button, Empty, Field, Kpi, Panel, Select, StatusPill, Table, TableWrap, Td, Th, fieldClass } from "@/components/ui";
import { inScope, matches, siteLabel, type InventoryItem, type NetPort, type SnmpVersion } from "@/lib/cloud/model";
import { isPolled, portLamp, type PortLamp } from "@/lib/cloud/fabric";
import { useCloud } from "@/lib/cloud/store";

export function PollBar() {
  const lastPollAt = useCloud((s) => s.lastPollAt);
  const poll = useCloud((s) => s.poll);
  const [remain, setRemain] = useState(60);

  useEffect(() => {
    const id = window.setInterval(() => {
      const stamp = useCloud.getState().lastPollAt;
      if (!stamp) {
        setRemain(60);
        return;
      }
      const left = 60 - Math.floor((Date.now() - stamp) / 1000);
      setRemain(left > 0 ? left : 60);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-faint">Poll {remain}s</span>
      <Button onClick={() => poll()}>Poll now</Button>
    </div>
  );
}

export function NetworkView({ mode }: { mode: "discovery" | "topology" | "monitoring" | "diagnostics" }) {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const inventory = useCloud((s) => s.inventory);
  const ports = useCloud((s) => s.ports);
  const alerts = useCloud((s) => s.alerts);
  const events = useCloud((s) => s.events);
  const devices = inventory.filter(
    (item) => isPolled(item) && inScope(role, site, item.site) && matches(query, [item.name, item.ip, item.sysDescr]),
  );
  const up = ports.filter((port) => devices.some((item) => item.id === port.assetId) && port.oper === "up").length;
  const down = ports.filter((port) => devices.some((item) => item.id === port.assetId) && port.oper === "down").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Devices" value={String(devices.length)} />
        <Kpi label="Ports up" value={String(up)} />
        <Kpi label="Ports down" value={String(down)} />
        <Kpi label="Alerts" value={String(alerts.length)} />
      </div>
      {mode === "discovery" && <DiscoveryPanel />}
      {mode === "topology" && <Topology devices={devices} />}
      {mode === "monitoring" && <Monitoring devices={devices} ports={ports} />}
      {mode === "diagnostics" && <Diagnostics alerts={alerts} events={events} />}
      {(mode === "topology" || mode === "monitoring") && <Faceplate devices={devices} ports={ports} />}
    </div>
  );
}

function DiscoveryPanel() {
  const snmp = useCloud((s) => s.snmp);
  const setSnmp = useCloud((s) => s.setSnmp);
  const devices = useCloud((s) => s.inventory).filter(isPolled);
  return (
    <Panel
      title="LibreNMS poller"
      subtitle="Devices enrolled from inventory are polled for status, ports, and traffic every minute over the selected SNMP version."
      action={<PollBar />}
    >
      <p className="mb-3 text-sm text-muted">
        Infocloudarc keeps the LibreNMS device and port model inside the app. A separate LibreNMS server needs PHP, MariaDB, and RRD, which this hosted console cannot install. Community and v3 credentials stay in this session and are applied on each poll.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Version">
          <Select value={snmp.version} onChange={(event) => setSnmp({ version: event.target.value as SnmpVersion })}>
            <option value="v1">v1</option>
            <option value="v2c">v2c</option>
            <option value="v3">v3</option>
          </Select>
        </Field>
        <Field label="v1 community"><input className={fieldClass} value={snmp.v1} onChange={(event) => setSnmp({ v1: event.target.value })} /></Field>
        <Field label="v2c community"><input className={fieldClass} value={snmp.v2c} onChange={(event) => setSnmp({ v2c: event.target.value })} /></Field>
        <Field label="v3 user"><input className={fieldClass} value={snmp.v3User} onChange={(event) => setSnmp({ v3User: event.target.value })} /></Field>
        <Field label="v3 auth"><input className={fieldClass} type="password" value={snmp.v3Auth} onChange={(event) => setSnmp({ v3Auth: event.target.value })} /></Field>
        <Field label="v3 priv"><input className={fieldClass} type="password" value={snmp.v3Priv} onChange={(event) => setSnmp({ v3Priv: event.target.value })} /></Field>
        <Field label="Email for minor alerts"><input className={fieldClass} value={snmp.notifyEmail} onChange={(event) => setSnmp({ notifyEmail: event.target.value })} /></Field>
        <Field label="Mobile for major alerts"><input className={fieldClass} value={snmp.notifyMobile} onChange={(event) => setSnmp({ notifyMobile: event.target.value })} /></Field>
      </div>
      <p className="mt-3 text-sm text-muted">{devices.length} inventory devices are enrolled ({devices.filter((item) => item.librenmsId).length} with a LibreNMS id).</p>
    </Panel>
  );
}

function Topology({ devices }: { devices: InventoryItem[] }) {
  const [layout, setLayout] = useState<"tree" | "hub">("tree");
  const site = useCloud((s) => s.site);
  const scope = site === "all" ? "Full view" : "Single site";
  return (
    <Panel title="Topology" subtitle={`${scope}. Tree and hub use the same live dash. Down links stay solid and highlighted.`}>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={layout === "tree" ? "primary" : "ghost"} onClick={() => setLayout("tree")}>Tree</Button>
        <Button variant={layout === "hub" ? "primary" : "ghost"} onClick={() => setLayout("hub")}>Hub and spoke</Button>
      </div>
      {layout === "tree" ? <Tree devices={devices} /> : <Hub devices={devices} />}
    </Panel>
  );
}

function Tree({ devices }: { devices: InventoryItem[] }) {
  const layout = layoutTree(devices);
  if (layout.nodes.length === 0) return <Empty>No network devices in this view.</Empty>;
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={{ minWidth: layout.width }}
        className="h-auto w-full"
        role="img"
        aria-label="Animated tree topology"
      >
        {layout.links.map((link) => (
          <path
            key={link.id}
            d={`M ${link.x1} ${link.y1} H ${link.mx} V ${link.y2} H ${link.x2}`}
            fill="none"
            strokeWidth="2"
            className={link.bad ? "stroke-danger" : "stroke-info path-dash"}
          />
        ))}
        {layout.nodes.map((node) => {
          const bad = node.item.status !== "Online";
          return (
            <g key={node.item.id}>
              <rect
                x={node.x}
                y={node.y}
                width={NODE_W}
                height={NODE_H}
                rx="8"
                strokeWidth="1.5"
                className={bad ? "fill-panel stroke-danger" : "fill-panel stroke-line-strong"}
              />
              <text x={node.x + NODE_W / 2} y={node.y + 18} textAnchor="middle" className="fill-ink" fontSize="12">
                {node.item.name}
              </text>
              <text x={node.x + NODE_W / 2} y={node.y + 34} textAnchor="middle" className="fill-faint" fontSize="10">
                {node.item.status} · {node.item.portsUp} up
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const NODE_W = 168;
const NODE_H = 46;
const COL_W = 210;
const ROW_H = 72;

function layoutTree(devices: InventoryItem[]) {
  const ids = new Set(devices.map((item) => item.id));
  const children = new Map<string, InventoryItem[]>();
  for (const item of devices) {
    const parent = item.parentId && ids.has(item.parentId) ? item.parentId : "";
    const list = children.get(parent) ?? [];
    list.push(item);
    children.set(parent, list);
  }
  const grid = new Map<string, { x: number; y: number }>();
  let row = 0;
  let depth = 0;
  const place = (item: InventoryItem, level: number): number => {
    depth = Math.max(depth, level);
    const kids = children.get(item.id) ?? [];
    if (kids.length === 0) {
      const y = row;
      row += 1;
      grid.set(item.id, { x: level, y });
      return y;
    }
    const ys = kids.map((kid) => place(kid, level + 1));
    const y = (ys[0] + ys[ys.length - 1]) / 2;
    grid.set(item.id, { x: level, y });
    return y;
  };
  for (const root of children.get("") ?? []) place(root, 0);
  const padX = 16;
  const padY = 12;
  const nodes = devices.flatMap((item) => {
    const pos = grid.get(item.id);
    if (!pos) return [];
    return [{ item, x: padX + pos.x * COL_W, y: padY + pos.y * ROW_H }];
  });
  const links = devices.flatMap((item) => {
    if (!item.parentId || !grid.has(item.parentId) || !grid.has(item.id)) return [];
    const parent = devices.find((entry) => entry.id === item.parentId);
    const from = grid.get(item.parentId);
    const to = grid.get(item.id);
    if (!parent || !from || !to) return [];
    const x1 = padX + from.x * COL_W + NODE_W;
    const y1 = padY + from.y * ROW_H + NODE_H / 2;
    const x2 = padX + to.x * COL_W;
    const y2 = padY + to.y * ROW_H + NODE_H / 2;
    return [{
      id: `${item.parentId}-${item.id}`,
      x1,
      y1,
      x2,
      y2,
      mx: (x1 + x2) / 2,
      bad: parent.status !== "Online" || item.status !== "Online",
    }];
  });
  return {
    nodes,
    links,
    width: padX * 2 + depth * COL_W + NODE_W,
    height: padY * 2 + Math.max(row, 1) * ROW_H,
  };
}

function Hub({ devices }: { devices: InventoryItem[] }) {
  const spokes = devices.filter((item) => item.parentId === "inv-15");
  const rest = spokes.length > 0 ? spokes : devices.slice(0, 6);
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 640 280" className="h-72 min-w-[640px]" role="img" aria-label="Hub and spoke topology">
        <circle cx="320" cy="140" r="36" className="fill-inset stroke-info" strokeWidth="2" />
        <text x="320" y="144" textAnchor="middle" className="fill-ink" fontSize="12">Hub</text>
        {rest.map((item, index) => {
          const angle = (Math.PI * 2 * index) / rest.length - Math.PI / 2;
          const x = 320 + Math.cos(angle) * 210;
          const y = 140 + Math.sin(angle) * 90;
          const bad = item.status !== "Online";
          return (
            <g key={item.id}>
              <line x1="320" y1="140" x2={x} y2={y} className={bad ? "stroke-danger" : "stroke-info path-dash"} strokeWidth="2" />
              <rect x={x - 58} y={y - 18} width="116" height="36" rx="8" className={bad ? "fill-panel stroke-danger" : "fill-panel stroke-line-strong"} strokeWidth="1.5" />
              <text x={x} y={y + 4} textAnchor="middle" className="fill-ink" fontSize="11">{item.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Monitoring({ devices, ports }: { devices: InventoryItem[]; ports: NetPort[] }) {
  return (
    <Panel title="Polled status" subtitle="Device, port, and traffic figures refresh on the one-minute poll." action={<PollBar />}>
      <TableWrap>
        <Table>
          <thead>
            <tr><Th>Device</Th><Th>Site</Th><Th>Status</Th><Th>Ports up</Th><Th>Ports down</Th><Th>In</Th><Th>Out</Th></tr>
          </thead>
          <tbody>
            {devices.map((item) => (
              <tr key={item.id}>
                <Td>{item.name}</Td>
                <Td>{siteLabel(item.site)}</Td>
                <Td><StatusPill value={item.status} /></Td>
                <Td mono>{item.portsUp}</Td>
                <Td mono>{item.portsDown}</Td>
                <Td mono>{item.trafficInMbps}</Td>
                <Td mono>{item.trafficOutMbps}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      <p className="mt-3 text-xs text-faint">{ports.length} interfaces tracked.</p>
    </Panel>
  );
}

function Faceplate({ devices, ports }: { devices: InventoryItem[]; ports: NetPort[] }) {
  const acknowledgePort = useCloud((s) => s.acknowledgePort);
  const [id, setId] = useState(devices[0]?.id ?? "");
  const [face, setFace] = useState<"front" | "back">("front");
  const [pick, setPick] = useState("");
  const selected = devices.find((item) => item.id === id) ?? devices[0];
  if (!selected) return null;
  const mine = ports.filter((port) => port.assetId === selected.id && port.face === face);
  const chosen = mine.find((port) => port.id === pick) ?? null;
  const lamp = chosen ? portLamp(chosen) : null;
  return (
    <Panel title="Switch panel" subtitle={`${selected.name} · ${selected.model}. Up is green, down is grey, loaded or errored ports blink orange. A new down port blinks red for one day until you acknowledge it.`}>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select aria-label="Device" value={selected.id} onChange={(event) => { setId(event.target.value); setPick(""); }}>
          {devices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        <Button variant={face === "front" ? "primary" : "ghost"} onClick={() => { setFace("front"); setPick(""); }}>Front</Button>
        <Button variant={face === "back" ? "primary" : "ghost"} onClick={() => { setFace("back"); setPick(""); }}>Back</Button>
      </div>
      {mine.length === 0 && <Empty>This face has no ports.</Empty>}
      {mine.length > 0 && (
        <div className="chassis-stage">
          <div className="chassis">
            <div className="chassis-bar">
              <span className="chassis-screw" aria-hidden="true" />
              <span className="flex items-center gap-2">
                <span className="power-led" aria-hidden="true" />
                {selected.vendor} {selected.model}
              </span>
              <span className="chassis-screw" aria-hidden="true" />
            </div>
            <div className="port-bay">
              {face === "front" ? <FrontBank ports={mine} pick={pick} onPick={setPick} /> : (
                <div className="port-group">
                  <div className="port-group-label">Uplinks</div>
                  <div className="port-row">
                    {mine.map((port) => (
                      <PortJack key={port.id} port={port} selected={port.id === pick} onSelect={setPick} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        <LampKey lamp="up" label="Up" />
        <LampKey lamp="down" label="Down" />
        <LampKey lamp="load" label="Loaded or errors" />
        <LampKey lamp="alarm" label="Down, unacknowledged" />
      </div>
      {chosen && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-inset px-3 py-3">
          <div>
            <div className="font-medium">{chosen.name}</div>
            <p className="font-mono text-xs text-faint">
              {lampLabel(lamp)} · {chosen.inMbps}/{chosen.outMbps} Mbps · {chosen.errors} errors
              {chosen.alarmAck ? " · acknowledged" : ""}
            </p>
          </div>
          {lamp === "alarm" && <Button onClick={() => acknowledgePort(chosen.id)}>Acknowledge</Button>}
        </div>
      )}
    </Panel>
  );
}

function FrontBank({ ports, pick, onPick }: { ports: NetPort[]; pick: string; onPick: (id: string) => void }) {
  const groups = [...new Set(ports.map((port) => port.group))];
  return (
    <>
      {groups.map((group) => {
        const slice = ports.filter((port) => port.group === group).sort((a, b) => a.ifIndex - b.ifIndex);
        const top = slice.filter((_, index) => index % 2 === 0);
        const bottom = slice.filter((_, index) => index % 2 === 1);
        return (
          <div key={group} className="port-group">
            <div className="port-group-label">{group}</div>
            <div className="port-rows">
              <div className="port-row">{top.map((port) => <PortJack key={port.id} port={port} selected={port.id === pick} onSelect={onPick} />)}</div>
              <div className="port-row">{bottom.map((port) => <PortJack key={port.id} port={port} selected={port.id === pick} onSelect={onPick} />)}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function PortJack({ port, selected, onSelect }: { port: NetPort; selected: boolean; onSelect: (id: string) => void }) {
  const lamp = portLamp(port);
  const blink = lamp === "load" || lamp === "alarm";
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={`${port.name} ${lampLabel(lamp)} ${port.inMbps}/${port.outMbps} Mbps`}
      onClick={() => onSelect(port.id)}
      className={`port-jack ${port.face === "back" ? "port-sfp" : ""} ${selected ? "port-jack-selected" : ""}`}
    >
      <span className={`port-led led-${lamp} ${blink ? "led-blink" : ""}`} />
      <span className="port-mouth" />
      <span className="port-idx">{port.ifIndex}</span>
    </button>
  );
}

function LampKey({ lamp, label }: { lamp: PortLamp; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`port-led led-${lamp} ${lamp === "load" || lamp === "alarm" ? "led-blink" : ""}`} />
      {label}
    </span>
  );
}

function lampLabel(lamp: PortLamp | null): string {
  if (lamp === "up") return "Up";
  if (lamp === "down") return "Down";
  if (lamp === "load") return "Loaded or errors";
  if (lamp === "alarm") return "Down, unacknowledged";
  return "";
}

function Diagnostics({
  alerts,
  events,
}: {
  alerts: ReturnType<typeof useCloud.getState>["alerts"];
  events: ReturnType<typeof useCloud.getState>["events"];
}) {
  return (
    <>
      <Panel title="Alerts" subtitle="Minor events queue email. Device down, or two or more ports that were up, queue a mobile alert." action={<PollBar />}>
        <TableWrap>
          <Table>
            <thead><tr><Th>When</Th><Th>Severity</Th><Th>Channel</Th><Th>Message</Th></tr></thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <Td mono>{alert.at}</Td>
                  <Td><StatusPill value={alert.severity === "major" ? "Critical" : "Warning"} /></Td>
                  <Td>{alert.channel}</Td>
                  <Td>{alert.message}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        {alerts.length === 0 && <Empty>No alerts yet. Poll to compare port state.</Empty>}
      </Panel>
      <Panel title="Events">
        <TableWrap>
          <Table>
            <thead><tr><Th>When</Th><Th>Event</Th></tr></thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}><Td mono>{event.at}</Td><Td>{event.message}</Td></tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        {events.length === 0 && <Empty>No events yet.</Empty>}
      </Panel>
    </>
  );
}
