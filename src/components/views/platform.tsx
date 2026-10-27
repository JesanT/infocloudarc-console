import { Kpi, Panel, StatusPill, Table, TableWrap, Td, Th } from "@/components/ui";
import { Trend } from "@/components/charts";
import { CatalogTable } from "@/components/catalog-table";
import { boundSite, inScope, matches, operatorVisible, policyVisible, siteLabel, siteOptions, type BackupJob, type BackupPolicy, type BackupTarget, type Operator, type RestorePoint, type SanSwitch, type StorageArray } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";
export { NetworkView } from "@/components/views/network";

function useScope() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const choices = siteOptions(role, site);
  return { role, site, query, choices, home: choices[0] };
}

export function StorageView({ kind }: { kind: "san" | "array" }) {
  const { role, site, query, choices, home } = useScope();
  const switches = useCloud((s) => s.switches);
  const arrays = useCloud((s) => s.arrays);
  const saveSwitch = useCloud((s) => s.saveSwitch);
  const deleteSwitch = useCloud((s) => s.deleteSwitch);
  const saveArray = useCloud((s) => s.saveArray);
  const deleteArray = useCloud((s) => s.deleteArray);
  if (kind === "san") {
    const rows = switches.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.vendor]));
    return (
      <CatalogTable<SanSwitch>
        title="SAN switches"
        subtitle="Fabric switches by site."
        rows={rows}
        idKey="name"
        allow
        columns={[
          { key: "name", label: "Name" },
          { key: "site", label: "Site", options: choices },
          { key: "vendor", label: "Vendor" },
          { key: "ports", label: "Ports", numeric: true },
          { key: "status", label: "Status", options: ["Online", "Degraded", "Offline"] },
          { key: "note", label: "Note" },
        ]}
        blank={() => ({ name: "", site: home, vendor: "", ports: 48, status: "Online", note: "" })}
        onSave={saveSwitch}
        onDelete={deleteSwitch}
      />
    );
  }
  const rows = arrays.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.kind]));
  return (
    <CatalogTable<StorageArray>
      title="Storage arrays"
      subtitle="Block capacity by site."
      rows={rows}
      idKey="name"
      allow
      columns={[
        { key: "name", label: "Name" },
        { key: "site", label: "Site", options: choices },
        { key: "kind", label: "Kind" },
        { key: "usable", label: "Usable" },
        { key: "used", label: "Used %", numeric: true },
        { key: "status", label: "Status", options: ["Online", "Degraded", "Offline"] },
      ]}
      blank={() => ({ name: "", site: home, kind: "All-flash", usable: "10 TB", used: 10, status: "Online" })}
      onSave={saveArray}
      onDelete={deleteArray}
    />
  );
}

export function MonitorView({ global }: { global: boolean }) {
  const site = useCloud((s) => s.site);
  const role = useCloud((s) => s.role);
  const instances = useCloud((s) => s.instances).filter((item) => inScope(role, site, item.site));
  const jobs = useCloud((s) => s.backups).filter((item) => inScope(role, site, item.site) && item.status !== "Success");
  const san = useCloud((s) => s.switches).filter((item) => inScope(role, site, item.site) && item.status !== "Online");
  const stopped = instances.filter((item) => item.status !== "running");
  const alerts = [
    ...stopped.map((item) => ({ id: item.id, text: `${item.name} is stopped`, status: "Critical" })),
    ...jobs.map((item) => ({ id: item.id, text: `${item.job} is ${item.status.toLowerCase()}`, status: item.status === "Failed" ? "Critical" : "Warning" })),
    ...san.map((item) => ({ id: item.name, text: `${item.name} ${item.note || item.status}`, status: "Warning" })),
  ];
  const crossSite = global && role !== "site" && site === "all";
  const viewing = boundSite(role, site);
  return (
    <div className="space-y-4">
      <Panel
        title={global && role !== "site" ? "Global monitoring" : "Site monitoring"}
        subtitle={
          role === "site"
            ? `${siteLabel(viewing === "all" ? "east" : viewing)}. Global monitoring is only for global and vendor access.`
            : crossSite
              ? "Aggregated across every site"
              : siteLabel(viewing === "all" ? "east" : viewing)
        }
      >
        <Trend
          data={
            crossSite
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
      <Panel title="Active alerts" subtitle="Only resources in the current site filter.">
        {alerts.length === 0 ? (
          <p className="text-sm text-muted">No alerts in this site filter.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {alerts.map((item) => (
              <li key={item.id} className="flex justify-between gap-3"><span>{item.text}</span><StatusPill value={item.status} /></li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export function MonitorConfig() {
  const { role } = useScope();
  const collectors = useCloud((s) => s.collectors);
  return (
    <Panel title="Monitoring configuration" subtitle={role === "site" ? "Shared collectors. Site access cannot change credentials or other sites." : "Collectors and alert routes for the current site filter."}>
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
  const { role, site, query, choices, home } = useScope();
  const backups = useCloud((s) => s.backups);
  const saveBackup = useCloud((s) => s.saveBackup);
  const deleteBackup = useCloud((s) => s.deleteBackup);
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
      <CatalogTable<BackupJob>
        title="Jobs"
        subtitle="Full, incremental, and continuous protection."
        rows={rows}
        idKey="id"
        allow
        columns={[
          { key: "id", label: "Id" },
          { key: "job", label: "Job" },
          { key: "type", label: "Type", options: ["Full", "Incremental", "Continuous"] },
          { key: "status", label: "Status", options: ["Success", "Warning", "Failed"] },
          { key: "last", label: "Last" },
          { key: "size", label: "Size" },
          { key: "site", label: "Site", options: choices },
        ]}
        blank={() => ({ id: `job-${Date.now()}`, job: "", type: "Full", status: "Success", last: "Not run", size: "0 GB", site: home })}
        onSave={saveBackup}
        onDelete={deleteBackup}
      />
    </div>
  );
}

export function BackupRepos() {
  const { role, site, query, choices, home } = useScope();
  const targets = useCloud((s) => s.backupTargets);
  const saveBackupTarget = useCloud((s) => s.saveBackupTarget);
  const deleteBackupTarget = useCloud((s) => s.deleteBackupTarget);
  const rows = targets.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.free]));
  return (
    <CatalogTable<BackupTarget>
      title="Backup repositories"
      subtitle="Targets used by protection jobs."
      rows={rows}
      idKey="id"
      allow
      columns={[
        { key: "id", label: "Id" },
        { key: "name", label: "Name" },
        { key: "site", label: "Site", options: choices },
        { key: "free", label: "Free space" },
        { key: "status", label: "Status", options: ["Online", "Warning"] },
      ]}
      blank={() => ({ id: `repo-${Date.now()}`, name: "", site: home, free: "0 TB free", status: "Online" as const })}
      onSave={saveBackupTarget}
      onDelete={deleteBackupTarget}
    />
  );
}

export function RestoreView() {
  const { role, site, query, choices, home } = useScope();
  const points = useCloud((s) => s.restorePoints);
  const saveRestorePoint = useCloud((s) => s.saveRestorePoint);
  const deleteRestorePoint = useCloud((s) => s.deleteRestorePoint);
  const rows = points.filter((item) => inScope(role, site, item.site) && matches(query, [item.workload]));
  return (
    <CatalogTable<RestorePoint>
      title="Restore"
      subtitle="Recovery points for a workload. Guest files, full machine, or instant recovery."
      rows={rows}
      idKey="id"
      allow
      columns={[
        { key: "id", label: "Id" },
        { key: "workload", label: "Workload" },
        { key: "points", label: "Points", numeric: true },
        { key: "latest", label: "Latest" },
        { key: "site", label: "Site", options: choices },
      ]}
      blank={() => ({ id: `rp-${Date.now()}`, workload: "", points: 1, latest: "Not run", site: home })}
      onSave={saveRestorePoint}
      onDelete={deleteRestorePoint}
    />
  );
}

export function PoliciesView() {
  const { role, site, query } = useScope();
  const policies = useCloud((s) => s.policies);
  const savePolicy = useCloud((s) => s.savePolicy);
  const deletePolicy = useCloud((s) => s.deletePolicy);
  const rows = policies.filter((item) => policyVisible(item.scope, role, site) && matches(query, [item.name, item.scope, item.retention]));
  return (
    <CatalogTable<BackupPolicy>
      title="Policies"
      subtitle="Retention and copy rules. Site access cannot change these."
      rows={rows}
      idKey="id"
      allow={role !== "site"}
      columns={[
        { key: "id", label: "Id" },
        { key: "name", label: "Policy" },
        { key: "retention", label: "Retention" },
        { key: "copy", label: "Copy" },
        { key: "scope", label: "Scope" },
      ]}
      blank={() => ({ id: `pol-${Date.now()}`, name: "", retention: "7 daily", copy: "None", scope: "All sites" })}
      onSave={savePolicy}
      onDelete={deletePolicy}
    />
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
  const { role, site, query, home } = useScope();
  const operators = useCloud((s) => s.operators);
  const saveOperator = useCloud((s) => s.saveOperator);
  const deleteOperator = useCloud((s) => s.deleteOperator);
  const rows = operators.filter((user) => operatorVisible(user.sites, role, site) && matches(query, [user.name, user.role, user.auth, user.sites]));
  const siteName = siteLabel(home).replace(/ \(.*\)$/, "");
  return (
    <CatalogTable<Operator>
      title="Users and access"
      subtitle="Local accounts, with Active Directory optional. Site access cannot change operators."
      rows={rows}
      idKey="name"
      allow={role !== "site"}
      columns={[
        { key: "name", label: "User" },
        { key: "role", label: "Role", options: ["Vendor", "Global", "Site"] },
        { key: "sites", label: "Sites" },
        { key: "auth", label: "Auth", options: ["Local", "Active Directory"] },
        { key: "status", label: "Status", options: ["Active", "Disabled"] },
      ]}
      blank={() => ({ name: "", role: "Site", sites: siteName, auth: "Local", status: "Active" as const })}
      onSave={saveOperator}
      onDelete={deleteOperator}
    />
  );
}

export function LicensingView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const subscriptions = useCloud((s) => s.subscriptions).filter((item) => inScope(role, site, item.site));
  const sites = useCloud((s) => s.sites);
  const siteRows = sites.filter((item) => inScope(role, site, item.id)).map((item) => {
    const mine = subscriptions.filter((sub) => sub.site === item.id);
    const status = mine.some((sub) => sub.status === "Expiring") ? "Expiring" : mine.some((sub) => sub.status === "Trial") ? "Trial" : "Active";
    return { id: item.id, label: siteLabel(item.id), status };
  });
  const modules = [...new Map(subscriptions.map((item) => [item.module, item])).values()];
  return (
    <div className="space-y-4">
      <div className={`grid gap-3 ${role === "site" ? "" : "md:grid-cols-2"}`}>
        <Panel title="Site licenses" subtitle="Licenses in the current site filter">
          <ul className="space-y-2 text-sm">
            {siteRows.map((item) => (
              <li key={item.id} className="flex justify-between"><span>{item.label}</span><StatusPill value={item.status} /></li>
            ))}
            {siteRows.length === 0 && <li className="text-muted">No site license in this filter.</li>}
          </ul>
        </Panel>
        {role !== "site" && (
          <Panel title="Global license" subtitle="Multi-site view">
            <StatusPill value={subscriptions.some((item) => item.site === "global") ? "Active" : "Hidden"} />
            <p className="mt-3 text-sm text-muted">Global and vendor access can see every site. Site admins cannot.</p>
          </Panel>
        )}
      </div>
      <Panel title="Module licenses" subtitle="Only modules entitled for this site filter">
        <TableWrap>
          <Table>
            <thead>
              <tr><Th>Module</Th><Th>Scope</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {modules.map((item) => (
                <tr key={item.id}>
                  <Td>{item.module}</Td>
                  <Td>{siteLabel(item.site)}</Td>
                  <Td><StatusPill value={item.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Panel>
    </div>
  );
}
