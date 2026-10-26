import { useEffect, useState } from "react";
import { Button, Empty, Field, Kpi, Panel, Select, StatusPill, Table, TableWrap, Td, Th, fieldClass } from "@/components/ui";
import { inScope, matches, siteLabel, siteOptions, type InventoryItem, type SiteKey } from "@/lib/cloud/model";
import { parseCsv, templateCsv, type ImportRow } from "@/lib/cloud/fabric";
import { getAppSubnet, scanSubnet } from "@/lib/cloud/discover";
import { useCloud } from "@/lib/cloud/store";
import { PollBar } from "@/components/views/network";

const CATEGORIES = ["All", "Compute", "Network", "Storage", "Software"] as const;

export function InventoryView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const inventory = useCloud((s) => s.inventory);
  const addAsset = useCloud((s) => s.addAsset);
  const importAssets = useCloud((s) => s.importAssets);
  const discover = useCloud((s) => s.discoverIntoInventory);
  const appSubnet = useCloud((s) => s.appSubnet);
  const extraSubnets = useCloud((s) => s.extraSubnets);
  const addExtraSubnet = useCloud((s) => s.addExtraSubnet);
  const setAppSubnet = useCloud((s) => s.setAppSubnet);
  const flash = useCloud((s) => s.flash);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [table, setTable] = useState<"main" | "network" | "compute" | "storage">("main");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [cidr, setCidr] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "Network" as InventoryItem["category"],
    site: "east" as SiteKey,
    vendor: "",
    model: "",
    serial: "",
    ip: "",
    mac: "",
    location: "",
    owner: "Network",
    deviceType: "switch" as InventoryItem["deviceType"],
    subnet: "",
  });

  useEffect(() => {
    void getAppSubnet()
      .then((result) => {
        if (result.cidr) setAppSubnet(result.cidr, result.address);
      })
      .catch(() => undefined);
  }, [setAppSubnet]);

  const rows = inventory.filter(
    (item) =>
      inScope(role, site, item.site) &&
      (category === "All" || item.category === category) &&
      matches(query, [item.name, item.vendor, item.model, item.serial, item.ip, item.deviceType, item.librenmsId]),
  );
  const shown =
    table === "network"
      ? rows.filter((item) => item.category === "Network" || item.deviceType === "switch")
      : table === "compute"
        ? rows.filter((item) => item.category === "Compute")
        : table === "storage"
          ? rows.filter((item) => item.category === "Storage")
          : rows;
  const current = inventory.find((item) => item.id === selected) ?? null;
  const canEdit = role !== "site";
  const choices = siteOptions(role, site);

  async function onImport(file: File) {
    const parsed = file.name.toLowerCase().endsWith(".csv") ? parseCsv(await file.text()) : await parseSheet(file);
    importAssets(parsed);
  }

  async function runScan(target: string) {
    setBusy(true);
    try {
      const result = await scanSubnet({ data: { cidr: target } });
      discover(target, result.hosts);
    } catch {
      flash("That subnet could not be scanned. Use a private CIDR such as 10.10.1.0/24.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Assets" value={String(rows.length)} />
        <Kpi label="Online" value={String(rows.filter((item) => item.status === "Online").length)} />
        <Kpi label="Degraded" value={String(rows.filter((item) => item.status === "Degraded").length)} />
        <Kpi label="Offline" value={String(rows.filter((item) => item.status === "Offline").length)} />
      </div>
      <Panel
        title="Inventory"
        subtitle="Main asset table. Subtype columns from network, compute, and storage stay linked on the same record."
        action={<PollBar />}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {CATEGORIES.map((item) => (
            <button key={item} type="button" onClick={() => setCategory(item)} className={chip(category === item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["main", "Main assets"],
              ["network", "Network"],
              ["compute", "Compute"],
              ["storage", "Storage"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTable(id)} className={chip(table === id)}>
              {label}
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setOpen((value) => !value)}>{open ? "Close form" : "Add manually"}</Button>
            <Button onClick={() => downloadText("infocloudarc-inventory-template.csv", templateCsv(), "text/csv")}>CSV template</Button>
            <Button onClick={() => void downloadWorkbook("xlsx")}>XLSX template</Button>
            <Button onClick={() => void downloadWorkbook("xls")}>XLS template</Button>
            <label className="inline-flex h-11 cursor-pointer items-center rounded-md border border-line bg-inset px-3 text-sm">
              Import file
              <input
                className="sr-only"
                type="file"
                accept=".csv,.xls,.xlsx"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onImport(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        )}
        {open && (
          <form
            className="mb-4 grid gap-3 rounded-lg border border-line bg-inset p-3 md:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              addAsset(form);
              setForm({ ...form, name: "", serial: "", model: "", vendor: "", ip: "", mac: "" });
              setOpen(false);
            }}
          >
            <Field label="Name"><input className={fieldClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as InventoryItem["category"] })}>
                <option>Compute</option><option>Network</option><option>Storage</option><option>Software</option>
              </Select>
            </Field>
            <Field label="Type">
              <Select value={form.deviceType} onChange={(e) => setForm({ ...form, deviceType: e.target.value as InventoryItem["deviceType"] })}>
                <option value="switch">switch</option>
                <option value="router">router</option>
                <option value="firewall">firewall</option>
                <option value="access-point">access-point</option>
                <option value="server">server</option>
                <option value="storage">storage</option>
                <option value="software">software</option>
              </Select>
            </Field>
            <Field label="Site">
              <Select value={choices.includes(form.site) ? form.site : choices[0]} onChange={(e) => setForm({ ...form, site: e.target.value as SiteKey })}>
                {choices.map((item) => <option key={item} value={item}>{siteLabel(item)}</option>)}
              </Select>
            </Field>
            <Field label="Vendor"><input className={fieldClass} value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></Field>
            <Field label="Model"><input className={fieldClass} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
            <Field label="Serial"><input className={fieldClass} value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} /></Field>
            <Field label="IP"><input className={fieldClass} value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} /></Field>
            <Field label="MAC"><input className={fieldClass} value={form.mac} onChange={(e) => setForm({ ...form, mac: e.target.value })} /></Field>
            <Field label="Subnet"><input className={fieldClass} value={form.subnet} onChange={(e) => setForm({ ...form, subnet: e.target.value })} placeholder="10.10.1.0/24" /></Field>
            <Field label="Location"><input className={fieldClass} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
            <div className="flex items-end"><Button variant="primary" type="submit">Save asset</Button></div>
          </form>
        )}
        <AssetTable rows={shown} table={table} selected={selected} onSelect={setSelected} />
        {shown.length === 0 && <Empty>No assets match this filter.</Empty>}
        {current && <AssetDetail item={current} />}
      </Panel>

      <Panel title="Auto discovery" subtitle="Starts from this application server subnet. Add optional CIDRs. Matching IP or serial is never inserted twice.">
        <p className="mb-3 text-sm text-muted">
          Server subnet {appSubnet || "detecting"} · SNMP v1, v2c, and v3 communities are on Networking / Discovery.
        </p>
        <div className="flex flex-wrap gap-2">
          {canEdit && appSubnet && (
            <Button disabled={busy} onClick={() => void runScan(appSubnet)}>Scan {appSubnet}</Button>
          )}
          {canEdit && extraSubnets.map((item) => (
            <Button key={item} disabled={busy} onClick={() => void runScan(item)}>Scan {item}</Button>
          ))}
          {!canEdit && <p className="text-sm text-muted">Discovery is limited to global and vendor access.</p>}
        </div>
        {canEdit && (
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              addExtraSubnet(cidr);
              setCidr("");
            }}
          >
            <input className={`${fieldClass} w-56`} value={cidr} onChange={(e) => setCidr(e.target.value)} placeholder="Optional CIDR" />
            <Button type="submit">Add subnet</Button>
            <Button type="button" onClick={() => { addExtraSubnet("10.10.1.0/24"); }}>Use 10.10.1.0/24</Button>
          </form>
        )}
      </Panel>
    </div>
  );
}

function chip(active: boolean) {
  return `h-11 rounded-md px-3 text-sm ${active ? "bg-accent text-accent-ink" : "border border-line bg-inset text-muted"}`;
}

function AssetTable({
  rows,
  table,
  selected,
  onSelect,
}: {
  rows: InventoryItem[];
  table: "main" | "network" | "compute" | "storage";
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Name</Th><Th>Type</Th><Th>Site</Th><Th>IP</Th><Th>Serial</Th>
            {table !== "compute" && <Th>LibreNMS</Th>}
            <Th>Ports</Th><Th>Traffic</Th><Th>Status</Th><Th>Last poll</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id} onClick={() => onSelect(item.id === selected ? null : item.id)} className="cursor-pointer hover:bg-inset">
              <Td>
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-faint">{item.vendor} {item.model}</div>
              </Td>
              <Td>{item.deviceType}</Td>
              <Td>{siteLabel(item.site)}</Td>
              <Td mono>{item.ip || "—"}</Td>
              <Td mono>{item.serial}</Td>
              {table !== "compute" && <Td mono>{item.librenmsId || "—"}</Td>}
              <Td mono>{item.portsUp + item.portsDown > 0 ? `${item.portsUp}/${item.portsDown}` : "—"}</Td>
              <Td mono>{item.trafficInMbps || item.trafficOutMbps ? `${item.trafficInMbps}/${item.trafficOutMbps}` : "—"}</Td>
              <Td><StatusPill value={item.status} /></Td>
              <Td>{item.lastPoll}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

function AssetDetail({ item }: { item: InventoryItem }) {
  const fields = [
    ["Source", item.source],
    ["MAC", item.mac || "—"],
    ["Subnet", item.subnet || "—"],
    ["SNMP", item.snmpVersion],
    ["Uptime", item.uptime || "—"],
    ["sysDescr", item.sysDescr || "—"],
    ["Location", item.location],
    ["Owner", item.owner],
    ["In Mbps", String(item.trafficInMbps)],
    ["Out Mbps", String(item.trafficOutMbps)],
  ];
  return (
    <dl className="mt-4 grid gap-2 rounded-lg border border-line bg-inset p-3 text-sm sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label}><dt className="text-faint">{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}

function downloadText(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function downloadWorkbook(kind: "xlsx" | "xls") {
  const XLSX = await import("xlsx");
  const sample = templateCsv().trim().split("\n").map((line) => line.split(","));
  const sheet = XLSX.utils.aoa_to_sheet(sample);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "assets");
  XLSX.writeFile(book, `infocloudarc-inventory-template.${kind}`, { bookType: kind });
}

async function parseSheet(file: File): Promise<ImportRow[]> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];
  return parseCsv(XLSX.utils.sheet_to_csv(sheet));
}
