import { useMemo, useState } from "react";
import { Button, Empty, Field, Kpi, Panel, Select, StatusPill, Table, TableWrap, Td, Th, fieldClass } from "@/components/ui";
import { DeploymentView } from "@/components/views/deployment";
import { activityVisible, inScope, matches, siteLabel } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";

export function RepositoryView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const repositories = useCloud((s) => s.repositories);
  const syncRepo = useCloud((s) => s.syncRepo);
  const rows = repositories.filter(
    (item) => inScope(role, site, item.site) && matches(query, [item.name, item.kind]),
  );
  const healthy = rows.filter((item) => item.status === "Healthy").length;

  return (
    <div className="space-y-4">
      <DeploymentView />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Catalogs" value={String(rows.length)} />
        <Kpi label="Healthy" value={String(healthy)} />
        <Kpi label="Objects" value={rows.reduce((sum, item) => sum + item.objects, 0).toLocaleString("en-US")} />
        <Kpi label="Capacity" value={`${rows.reduce((sum, item) => sum + item.capacityTb, 0)} TB`} />
      </div>
      <Panel title="Catalogs" subtitle="OS mirrors, golden-image catalogs, packages, and backup catalogs. These are not the disk paths used to deploy a virtual machine. Add those with the repository, image, and VM folder forms above.">
        <div className="space-y-3">
          {rows.map((repo) => (
            <article key={repo.id} className="rounded-lg border border-line bg-inset p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{repo.name}</div>
                  <p className="mt-1 text-sm text-muted">{repo.kind} · {siteLabel(repo.site)} · {repo.objects.toLocaleString("en-US")} objects</p>
                </div>
                <StatusPill value={repo.status} />
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas">
                <div className="h-full bg-info" style={{ width: `${repo.usedPct}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-mono text-xs text-faint">{repo.usedPct}% of {repo.capacityTb} TB · {repo.lastSync}</span>
                <Button onClick={() => syncRepo(repo.id)}>Sync</Button>
              </div>
            </article>
          ))}
        </div>
        {rows.length === 0 && <Empty>No repositories in this view.</Empty>}
      </Panel>
    </div>
  );
}

export function SubscriptionsView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const subscriptions = useCloud((s) => s.subscriptions);
  const renew = useCloud((s) => s.renewSubscription);
  const rows = subscriptions.filter(
    (item) => inScope(role, site, item.site) && matches(query, [item.module, item.plan, item.scope]),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Subscriptions" value={String(rows.length)} />
        <Kpi label="Active" value={String(rows.filter((item) => item.status === "Active").length)} />
        <Kpi label="Expiring" value={String(rows.filter((item) => item.status === "Expiring").length)} />
        <Kpi label="Trial" value={String(rows.filter((item) => item.status === "Trial").length)} />
      </div>
      <Panel
        title="Subscriptions"
        subtitle="Per-site and global module subscriptions. Renewal is a vendor action."
      >
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Module</Th><Th>Scope</Th><Th>Site</Th><Th>Plan</Th><Th>Seats</Th><Th>Renews</Th><Th>Status</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <Td>{item.module}</Td>
                  <Td>{item.scope}</Td>
                  <Td>{siteLabel(item.site)}</Td>
                  <Td>{item.plan}</Td>
                  <Td>{item.seats}</Td>
                  <Td>{item.renews}</Td>
                  <Td><StatusPill value={item.status} /></Td>
                  <Td>
                    {role === "vendor" ? (
                      <Button onClick={() => renew(item.id)}>Renew</Button>
                    ) : (
                      <span className="text-xs text-faint">{item.annual}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        {rows.length === 0 && <Empty>No subscriptions in this view.</Empty>}
      </Panel>
    </div>
  );
}

type Built = { title: string; columns: string[]; rows: string[][] };

export function ReportsView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const instances = useCloud((s) => s.instances);
  const inventory = useCloud((s) => s.inventory);
  const subscriptions = useCloud((s) => s.subscriptions);
  const repositories = useCloud((s) => s.repositories);
  const activity = useCloud((s) => s.activity);
  const reports = useCloud((s) => s.reports);
  const backups = useCloud((s) => s.backups);
  const arrays = useCloud((s) => s.arrays);
  const flash = useCloud((s) => s.flash);
  const [active, setActive] = useState(reports[0]?.id ?? "");
  const [built, setBuilt] = useState<Built | null>(null);

  const defs = reports.filter((report) => {
    if (role === "site" && (report.id === "rpt-subs" || report.id === "rpt-capacity")) return false;
    return true;
  });

  const preview = useMemo(() => built, [built]);

  function run() {
    const def = reports.find((item) => item.id === active);
    if (!def) return;
    if (role !== "vendor" && def.id === "rpt-subs") {
      flash("Subscription reports require vendor access.");
      return;
    }
    if (role === "site" && def.audience === "Global") {
      flash("This report is limited to global access.");
      return;
    }
    const next = compose(active, {
      role,
      site,
      instances,
      inventory,
      subscriptions,
      repositories,
      activity,
      backups,
      arrays,
    });
    setBuilt(next);
    flash(`Ran ${def.name}.`);
  }

  return (
    <div className="space-y-4">
      <Panel title="Reports" subtitle="Audit and operational reports. Run one, then export CSV.">
        <div className="grid gap-2 md:grid-cols-2">
          {defs.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => {
                setActive(report.id);
                setBuilt(null);
              }}
              className={`rounded-lg border p-3 text-left ${active === report.id ? "border-line-strong bg-inset" : "border-line bg-canvas"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{report.name}</span>
                <span className="font-mono text-xs text-faint">{report.cadence}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{report.description}</p>
              <p className="mt-2 text-xs text-faint">{report.audience}</p>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={run}>Run report</Button>
          <Button
            disabled={!preview}
            onClick={() => {
              if (!preview) return;
              downloadCsv(`${preview.title}.csv`, [preview.columns, ...preview.rows]);
            }}
          >
            Export CSV
          </Button>
        </div>
      </Panel>
      {preview && (
        <Panel title={preview.title} subtitle={`${preview.rows.length} rows · current scope`}>
          <TableWrap>
            <Table>
              <thead>
                <tr>{preview.columns.map((col) => <Th key={col}>{col}</Th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr key={`${row[0]}-${index}`}>
                    {row.map((cell, cellIndex) => <Td key={`${cell}-${cellIndex}`} mono={cellIndex > 0}>{cell}</Td>)}
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          {preview.rows.length === 0 && <Empty>The report returned no rows for this scope.</Empty>}
        </Panel>
      )}
    </div>
  );
}

function compose(
  id: string,
  source: {
    role: ReturnType<typeof useCloud.getState>["role"];
    site: ReturnType<typeof useCloud.getState>["site"];
    instances: ReturnType<typeof useCloud.getState>["instances"];
    inventory: ReturnType<typeof useCloud.getState>["inventory"];
    subscriptions: ReturnType<typeof useCloud.getState>["subscriptions"];
    repositories: ReturnType<typeof useCloud.getState>["repositories"];
    activity: ReturnType<typeof useCloud.getState>["activity"];
    backups: ReturnType<typeof useCloud.getState>["backups"];
    arrays: ReturnType<typeof useCloud.getState>["arrays"];
  },
): Built {
  const { role, site } = source;
  if (id === "rpt-inventory") {
    const rows = source.inventory.filter((item) => inScope(role, site, item.site));
    return {
      title: "Asset inventory",
      columns: ["Name", "Category", "Site", "Status", "Serial"],
      rows: rows.map((item) => [item.name, item.category, siteLabel(item.site), item.status, item.serial]),
    };
  }
  if (id === "rpt-capacity") {
    const vms = source.instances.filter((item) => inScope(role, site, item.site));
    const arrays = source.arrays.filter((item) => inScope(role, site, item.site));
    const repos = source.repositories.filter((item) => inScope(role, site, item.site));
    return {
      title: "Capacity and utilization",
      columns: ["Resource", "Scope", "Metric"],
      rows: [
        ...vms.map((item) => [item.name, siteLabel(item.site), `CPU ${item.cpu}% / Mem ${item.mem}%`]),
        ...arrays.map((item) => [item.name, siteLabel(item.site), `${item.used}% of ${item.usable}`]),
        ...repos.map((item) => [item.name, siteLabel(item.site), `${item.usedPct}% of ${item.capacityTb} TB`]),
      ],
    };
  }
  if (id === "rpt-backup") {
    const rows = source.backups.filter((item) => inScope(role, site, item.site));
    return {
      title: "Backup compliance",
      columns: ["Job", "Site", "Status", "Last", "Size"],
      rows: rows.map((item) => [item.job, siteLabel(item.site), item.status, item.last, item.size]),
    };
  }
  if (id === "rpt-subs") {
    const rows = source.subscriptions.filter((item) => inScope(role, site, item.site));
    return {
      title: "Subscription utilization",
      columns: ["Module", "Scope", "Renews", "Status", "Annual"],
      rows: rows.map((item) => [item.module, siteLabel(item.site), item.renews, item.status, item.annual]),
    };
  }
  return {
    title: "Audit activity",
    columns: ["Event", "When"],
    rows: source.activity.filter((item) => activityVisible(item.text, role, site)).map((item) => [item.text, item.when]),
  };
}

function downloadCsv(filename: string, rows: string[][]) {
  const body = rows
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.replaceAll(" ", "-").toLowerCase();
  link.click();
  URL.revokeObjectURL(url);
}
