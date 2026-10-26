import { Empty, Kpi, Panel, StatusPill, Table, TableWrap, Td, Th } from "@/components/ui";
import { Trend } from "@/components/charts";
import { inScope, matches, siteLabel } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";
export { NetworkView } from "@/components/views/network";

function useScope() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  return { role, site, query };
}

export function StorageView({ kind }: { kind: "san" | "array" }) {
  const { role, site, query } = useScope();
  const switches = useCloud((s) => s.switches);
  const arrays = useCloud((s) => s.arrays);
  if (kind === "san") {
    const rows = switches.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.vendor]));
    return (
      <Panel title="SAN switches" subtitle="Fabric switches by site">
        <div className="grid gap-3 md:grid-cols-3">
          {rows.map((item) => (
            <article key={item.name} className="rounded-lg border border-line bg-inset p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{item.name}</div>
                <StatusPill value={item.status} />
              </div>
              <p className="mt-2 text-sm text-muted">{item.vendor} · {item.ports} ports</p>
              <p className="mt-1 text-sm text-faint">{siteLabel(item.site)} · {item.note}</p>
            </article>
          ))}
        </div>
        {rows.length === 0 && <Empty>No SAN switches in this view.</Empty>}
      </Panel>
    );
  }
  const rows = arrays.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.kind]));
  return (
    <Panel title="Storage arrays" subtitle="Block capacity by site">
      <div className="grid gap-3 md:grid-cols-3">
        {rows.map((item) => (
          <article key={item.name} className="rounded-lg border border-line bg-inset p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium">{item.name}</div>
              <StatusPill value={item.status} />
            </div>
            <p className="mt-2 text-sm text-muted">{item.kind} · {item.usable} usable</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas">
              <div className="h-full bg-info" style={{ width: `${item.used}%` }} />
            </div>
            <p className="mt-2 font-mono text-xs text-faint">{item.used}% used · {siteLabel(item.site)}</p>
          </article>
        ))}
      </div>
      {rows.length === 0 && <Empty>No arrays in this view.</Empty>}
    </Panel>
  );
}

export function MonitorView({ global }: { global: boolean }) {
  const site = useCloud((s) => s.site);
  const role = useCloud((s) => s.role);
  const locked = role === "site";
  return (
    <div className="space-y-4">
      <Panel
        title={global ? "Global monitoring" : "Site monitoring"}
        subtitle={global ? "Aggregated across entitled sites" : siteLabel(locked ? "east" : site === "all" ? "east" : site)}
      >
        <Trend
          data={
            global
              ? [
                  { label: "Mon", a: 42, b: 12 },
                  { label: "Tue", a: 48, b: 15 },
                  { label: "Wed", a: 55, b: 18 },
                  { label: "Thu", a: 51, b: 14 },
                  { label: "Fri", a: 60, b: 20 },
                  { label: "Sat", a: 45, b: 11 },
                  { label: "Sun", a: 38, b: 9 },
                ]
              : [
                  { label: "Mon", a: 38, b: 4 },
                  { label: "Tue", a: 41, b: 5 },
                  { label: "Wed", a: 49, b: 6 },
                  { label: "Thu", a: 52, b: 5 },
                  { label: "Fri", a: 47, b: 7 },
                  { label: "Sat", a: 40, b: 3 },
                  { label: "Sun", a: 35, b: 2 },
                ]
          }
          aLabel="CPU %"
          bLabel="Gbps"
        />
      </Panel>
      <Panel title="Active alerts">
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between gap-3"><span>db-primary CPU</span><StatusPill value="Critical" /></li>
          <li className="flex justify-between gap-3"><span>DR-Replication</span><StatusPill value="Warning" /></li>
          <li className="flex justify-between gap-3"><span>SAN-SW-West-01 port</span><StatusPill value="Warning" /></li>
        </ul>
      </Panel>
    </div>
  );
}

export function MonitorConfig() {
  const collectors = useCloud((s) => s.collectors);
  return (
    <Panel title="Monitoring configuration" subtitle="Collectors and alert routes. Changes apply per site.">
      <TableWrap>
        <Table>
          <thead>
            <tr><Th>Collector</Th><Th>Scope</Th><Th>Interval</Th><Th>Status</Th></tr>
          </thead>
          <tbody>
            {collectors.map((item) => (
              <tr key={item.id}>
                <Td>{item.name}</Td>
                <Td>{item.scope}</Td>
                <Td mono>{item.interval}</Td>
                <Td><StatusPill value={item.status} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Panel>
  );
}

export function BackupJobs() {
  const { role, site, query } = useScope();
  const backups = useCloud((s) => s.backups);
  const rows = backups.filter((item) => inScope(role, site, item.site) && matches(query, [item.job, item.type]));
  const success = rows.filter((item) => item.status === "Success").length;
  const warning = rows.filter((item) => item.status === "Warning").length;
  const failed = rows.filter((item) => item.status === "Failed").length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Jobs" value={String(rows.length)} />
        <Kpi label="Success" value={String(success)} />
        <Kpi label="Warning" value={String(warning)} />
        <Kpi label="Failed" value={String(failed)} />
      </div>
      <Panel title="Jobs" subtitle="Full, incremental, and continuous protection">
        <TableWrap>
          <Table>
            <thead>
              <tr><Th>Job</Th><Th>Type</Th><Th>Status</Th><Th>Last</Th><Th>Size</Th><Th>Site</Th></tr>
            </thead>
            <tbody>
              {rows.map((job) => (
                <tr key={job.id}>
                  <Td>{job.job}</Td>
                  <Td>{job.type}</Td>
                  <Td><StatusPill value={job.status} /></Td>
                  <Td>{job.last}</Td>
                  <Td mono>{job.size}</Td>
                  <Td>{siteLabel(job.site)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        {rows.length === 0 && <Empty>No jobs in this view.</Empty>}
      </Panel>
    </div>
  );
}

export function BackupRepos() {
  const targets = useCloud((s) => s.backupTargets);
  const { role, site } = useScope();
  const rows = targets.filter((item) => inScope(role, site, item.site));
  return (
    <Panel title="Backup repositories" subtitle="Targets used by protection jobs. Content mirrors live under Administration.">
      <div className="grid gap-3 md:grid-cols-3">
        {rows.map((item) => (
          <article key={item.id} className="rounded-lg border border-line bg-inset p-3">
            <div className="font-medium">{item.name}</div>
            <p className="mt-1 text-sm text-muted">{siteLabel(item.site)}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="font-mono text-xs">{item.free}</span>
              <StatusPill value={item.status} />
            </div>
          </article>
        ))}
      </div>
      {rows.length === 0 && <Empty>No backup repositories in this view.</Empty>}
    </Panel>
  );
}

export function RestoreView() {
  const points = useCloud((s) => s.restorePoints);
  const { role, site } = useScope();
  const rows = points.filter((item) => inScope(role, site, item.site));
  return (
    <Panel title="Restore" subtitle="Pick a recovery point. Guest files, full machine, or instant recovery.">
      <TableWrap>
        <Table>
          <thead>
            <tr><Th>Workload</Th><Th>Points</Th><Th>Latest</Th><Th>Site</Th></tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <Td>{item.workload}</Td>
                <Td mono>{item.points}</Td>
                <Td>{item.latest}</Td>
                <Td>{siteLabel(item.site)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      {rows.length === 0 && <Empty>No restore points in this view.</Empty>}
    </Panel>
  );
}

export function PoliciesView() {
  const policies = useCloud((s) => s.policies);
  return (
    <Panel title="Policies" subtitle="Retention and copy rules">
      <TableWrap>
        <Table>
          <thead>
            <tr><Th>Policy</Th><Th>Retention</Th><Th>Copy</Th><Th>Scope</Th></tr>
          </thead>
          <tbody>
            {policies.map((item) => (
              <tr key={item.id}>
                <Td>{item.name}</Td>
                <Td>{item.retention}</Td>
                <Td>{item.copy}</Td>
                <Td>{item.scope}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Panel>
  );
}

export function RbacView() {
  const rows: Array<[string, string, string, string]> = [
    ["View own site", "Yes", "Yes", "Yes"],
    ["View all sites", "No", "Yes", "Yes"],
    ["Stop / restart / shutdown", "Own site", "Yes", "Yes"],
    ["Deploy instance", "No", "No", "Yes"],
    ["Manage backup jobs", "Own site", "Yes", "Yes"],
    ["Add inventory", "No", "No", "Yes"],
    ["Renew subscriptions", "No", "No", "Yes"],
    ["Run global reports", "No", "Yes", "Yes"],
  ];
  return (
    <Panel title="RBAC" subtitle="Site, global, and vendor access">
      <TableWrap>
        <Table>
          <thead>
            <tr><Th>Capability</Th><Th>Site</Th><Th>Global</Th><Th>Vendor</Th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, index) => (
                  <Td key={`${row[0]}-${index}`}>{cell}</Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Panel>
  );
}

export function UsersView() {
  const query = useCloud((s) => s.query);
  const operators = useCloud((s) => s.operators);
  const rows = operators.filter((user) => matches(query, [user.name, user.role, user.auth]));
  return (
    <Panel title="Users and access" subtitle="Local accounts, with Active Directory optional">
      <TableWrap>
        <Table>
          <thead>
            <tr><Th>User</Th><Th>Role</Th><Th>Sites</Th><Th>Auth</Th><Th>Status</Th></tr>
          </thead>
          <tbody>
            {rows.map((user) => (
              <tr key={user.name}>
                <Td mono>{user.name}</Td>
                <Td>{user.role}</Td>
                <Td>{user.sites}</Td>
                <Td>{user.auth}</Td>
                <Td><StatusPill value={user.status} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </Panel>
  );
}

export function LicensingView() {
  const role = useCloud((s) => s.role);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Site licenses" subtitle="One license per datacenter">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span>Site-East</span><StatusPill value="Active" /></li>
            <li className="flex justify-between"><span>Site-West</span><StatusPill value="Active" /></li>
            <li className="flex justify-between"><span>Site-Central</span><StatusPill value="Expiring" /></li>
          </ul>
        </Panel>
        <Panel title="Global license" subtitle="Multi-site view">
          <StatusPill value={role === "site" ? "Hidden" : "Active"} />
          <p className="mt-3 text-sm text-muted">
            {role === "site"
              ? "Site access does not include the global license view."
              : "Global license covers every site for entitled modules."}
          </p>
        </Panel>
      </div>
      <Panel title="Module licenses" subtitle="Commercial terms live under Administration / Subscriptions">
        <TableWrap>
          <Table>
            <thead>
              <tr><Th>Module</Th><Th>Site</Th><Th>Global</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {[
                ["Computing", "Yes", "Yes", "Active"],
                ["Networking", "Yes", "Yes", "Active"],
                ["SAN", "Yes", "No", "Active"],
                ["Backup and Restore", "Yes", "Yes", "Active"],
                ["Monitoring and Alerting", "Yes", "Yes", "Trial"],
                ["Audit and Reporting", "No", "Yes", "Active"],
              ].map((row) => (
                <tr key={row[0]}>
                  <Td>{row[0]}</Td>
                  <Td>{row[1]}</Td>
                  <Td>{row[2]}</Td>
                  <Td><StatusPill value={row[3]} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Panel>
    </div>
  );
}
