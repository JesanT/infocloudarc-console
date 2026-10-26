import { Button, Kpi, Panel, Select, StatusPill, Table, TableWrap, Td, Th } from "@/components/ui";
import { APP_LABEL, DB_LABEL, useDr, type AppKind, type DbKind, type DrService } from "@/lib/cloud/dr";
import { canMutateSite, inScope, matches, siteLabel, type Role, type SiteFilter } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";

type Focus =
  | { domain: "all" }
  | { domain: "app"; kind: AppKind | "all" }
  | { domain: "db"; kind: DbKind | "all" };

export function ServiceDrView({ focus }: { focus: Focus }) {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const services = useDr((s) => s.services);
  const hosts = useDr((s) => s.hosts);
  const vms = useDr((s) => s.vms);
  const clusters = useDr((s) => s.clusters);
  const apps = useDr((s) => s.apps);
  const databases = useDr((s) => s.databases);
  const workflows = useDr((s) => s.workflows);
  const performance = useDr((s) => s.performance);
  const events = useDr((s) => s.events);
  const alerts = useDr((s) => s.alerts);
  const audit = useDr((s) => s.audit);
  const setMode = useDr((s) => s.setMode);
  const runFailover = useDr((s) => s.runFailover);

  const visible = services.filter((service) => touches(role, site, service));
  const title = focus.domain === "all" ? "All services" : focus.domain === "app" ? APP_LABEL[focus.kind] : DB_LABEL[focus.kind];

  const appRows = apps.filter((app) => {
    if (!visible.some((service) => service.id === app.serviceId)) return false;
    if (focus.domain === "db") return false;
    if (focus.domain === "app" && focus.kind !== "all" && app.kind !== focus.kind) return false;
    const service = visible.find((item) => item.id === app.serviceId);
    const vm = vms.find((item) => item.id === app.vmId);
    return matches(query, [app.name, app.kind, service?.name ?? "", vm?.name ?? ""]);
  });
  const dbRows = databases.filter((db) => {
    if (!visible.some((service) => service.id === db.serviceId)) return false;
    if (focus.domain === "app") return false;
    if (focus.domain === "db" && focus.kind !== "all" && db.engine !== focus.kind) return false;
    const service = visible.find((item) => item.id === db.serviceId);
    return matches(query, [db.name, db.engine, service?.name ?? ""]);
  });
  const relatedIds = new Set([...appRows.map((item) => item.serviceId), ...dbRows.map((item) => item.serviceId)]);
  const serviceRows = visible.filter((service) => {
    const named = matches(query, [service.name, service.owner, service.tier]);
    if (focus.domain === "all") return query.trim() ? named || relatedIds.has(service.id) : true;
    return relatedIds.has(service.id);
  });
  const serviceIds = new Set(serviceRows.map((item) => item.id));
  const vmIds = new Set([...appRows.map((item) => item.vmId), ...dbRows.map((item) => item.vmId)]);
  const vmRows = vms.filter((vm) => inScope(role, site, vm.site) && (focus.domain === "all" ? visible.some((service) => service.site === vm.site || service.standbySite === vm.site) : vmIds.has(vm.id)));
  const hostIds = new Set(vmRows.map((vm) => vm.hostId));
  const hostRows = hosts.filter((host) => inScope(role, site, host.site) && (focus.domain === "all" ? visible.some((service) => service.site === host.site || service.standbySite === host.site) : hostIds.has(host.id)));
  const clusterIds = new Set(vmRows.map((vm) => vm.clusterId));
  const clusterRows = clusters.filter((cluster) => inScope(role, site, cluster.site) && (focus.domain === "all" ? visible.some((service) => service.site === cluster.site || service.standbySite === cluster.site) : clusterIds.has(cluster.id)));
  const names = new Set([
    ...serviceRows.map((item) => item.name),
    ...appRows.map((item) => item.name),
    ...dbRows.map((item) => item.name),
    ...vmRows.map((item) => item.name),
    ...hostRows.map((item) => item.name),
  ]);
  const flowRows = workflows.filter((item) => serviceIds.has(item.serviceId));
  const perfRows = performance.filter((item) => names.has(item.target));
  const eventRows = events.filter((item) => names.has(item.target) || serviceRows.some((service) => item.target.includes(service.name)));
  const alertRows = alerts.filter((item) => names.has(item.target) || serviceRows.some((service) => item.message.includes(service.name) || item.target === service.name));
  const auditRows = audit.filter((item) => serviceRows.some((service) => item.target.includes(service.name)));

  const auto = serviceRows.filter((item) => item.mode === "auto").length;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-white px-4 py-3 shadow-[0_10px_28px_rgba(232,93,4,0.06)]">
        <div className="text-xs font-medium tracking-wide text-accent uppercase">Service DR · {title}</div>
        <p className="mt-1 text-sm text-ink">
          Disaster recovery for applications, databases, services, virtual machines, and physical hosts. Automated failover runs the armed workflow. Manual failover moves the active site only when you start it.
        </p>
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Services" value={String(serviceRows.length)} hint={`${auto} automated`} />
        <Kpi label="Applications" value={String(appRows.length)} hint={focus.domain === "db" ? "Not in this filter" : "On active and standby"} />
        <Kpi label="Databases" value={String(dbRows.length)} hint={focus.domain === "app" ? "Not in this filter" : "Paired replicas"} />
        <Kpi label="Open alerts" value={String(alertRows.filter((item) => item.state === "Open").length)} hint={`${hostRows.length} hosts`} />
      </div>

      <Panel title="Services" subtitle="Active site is the one taking traffic. Standby is the failover target.">
        <TableWrap>
          <Table>
            <thead>
              <tr><Th>Service</Th><Th>Active</Th><Th>Standby</Th><Th>RPO</Th><Th>RTO</Th><Th>Mode</Th><Th>Status</Th><Th>Action</Th></tr>
            </thead>
            <tbody>
              {serviceRows.map((service) => (
                <tr key={service.id}>
                  <Td>{service.name}</Td>
                  <Td>{siteLabel(service.site)}</Td>
                  <Td>{siteLabel(service.standbySite)}</Td>
                  <Td mono>{service.rpo}</Td>
                  <Td mono>{service.rto}</Td>
                  <Td>
                    {canMutateSite(role, site, service.site) ? (
                      <Select aria-label={`${service.name} failover mode`} value={service.mode} onChange={(event) => setMode(service.id, event.target.value as "auto" | "manual")}>
                        <option value="auto">Automated</option>
                        <option value="manual">Manual</option>
                      </Select>
                    ) : (
                      service.mode === "auto" ? "Automated" : "Manual"
                    )}
                  </Td>
                  <Td><StatusPill value={service.status} /></Td>
                  <Td>
                    {canMutateSite(role, site, service.site) ? (
                      <Button variant="primary" onClick={() => runFailover(service.id, service.mode)}>
                        {service.mode === "auto" ? "Run workflow" : "Fail over"}
                      </Button>
                    ) : (
                      "View only"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Panel>

      {focus.domain !== "db" && (
        <Panel title="Applications" subtitle="Application process, the virtual machine it runs on, and the physical host under that VM.">
          <WorkloadTable rows={appRows.map((app) => mapWorkload(app.serviceId, app.name, APP_LABEL[app.kind], app.vmId, app.status, services, vms, hosts, clusters))} />
        </Panel>
      )}
      {focus.domain !== "app" && (
        <Panel title="Databases" subtitle="Database service mapped to its VM and physical host. Replica is the DR copy.">
          <WorkloadTable rows={dbRows.map((db) => mapWorkload(db.serviceId, db.name, DB_LABEL[db.engine], db.vmId, db.status, services, vms, hosts, clusters, db.replica))} />
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Clusters">
          <MiniTable head={["Cluster", "Kind", "Nodes", "Status"]} rows={clusterRows.map((item) => [item.name, item.kind, String(item.nodes), item.status])} />
        </Panel>
        <Panel title="Virtual machines">
          <MiniTable head={["VM", "Host", "CPU", "Status"]} rows={vmRows.map((vm) => [vm.name, hosts.find((host) => host.id === vm.hostId)?.name ?? "—", `${vm.cpu}%`, vm.status])} />
        </Panel>
        <Panel title="Physical hosts">
          <MiniTable head={["Host", "Site", "CPU", "Status"]} rows={hostRows.map((host) => [host.name, siteLabel(host.site), `${host.cpu}%`, host.status])} />
        </Panel>
      </div>

      <Panel title="Workflows" subtitle="Same steps for automated and manual failover. Automated stays armed until you switch the service to manual.">
        <TableWrap>
          <Table>
            <thead>
              <tr><Th>Workflow</Th><Th>Mode</Th><Th>Steps</Th><Th>Last run</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {flowRows.map((flow) => (
                <tr key={flow.id}>
                  <Td>{flow.name}</Td>
                  <Td>{flow.mode === "auto" ? "Automated" : "Manual"}</Td>
                  <Td>{flow.steps.join(" → ")}</Td>
                  <Td>{flow.lastRun}</Td>
                  <Td><StatusPill value={flow.status === "Ready" ? "Active" : flow.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Panel>

      <Panel title="Performance" subtitle="Latest samples for the services, applications, databases, VMs, and hosts in this view.">
        <TableWrap>
          <Table>
            <thead>
              <tr><Th>Target</Th><Th>Kind</Th><Th>Metric</Th><Th>Value</Th><Th>When</Th></tr>
            </thead>
            <tbody>
              {perfRows.map((row) => (
                <tr key={row.id}><Td>{row.target}</Td><Td>{row.kind}</Td><Td>{row.metric}</Td><Td mono>{row.value}</Td><Td>{row.at}</Td></tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Events">
          <SignalList rows={eventRows.map((row) => ({ id: row.id, title: row.target, detail: row.message, status: row.severity === "Info" ? "Active" : row.severity, when: row.at }))} />
        </Panel>
        <Panel title="Alerts">
          <SignalList rows={alertRows.map((row) => ({ id: row.id, title: row.target, detail: row.message, status: row.severity, when: row.state }))} />
        </Panel>
        <Panel title="Audit">
          <SignalList rows={auditRows.map((row) => ({ id: row.id, title: row.actor, detail: `${row.action} · ${row.target}`, status: "Active", when: row.at }))} />
        </Panel>
      </div>
    </div>
  );
}

function touches(role: Role, site: SiteFilter, service: DrService) {
  if (role === "site") return inScope(role, site, service.site);
  if (site === "all") return true;
  return service.site === site || service.standbySite === site;
}

function mapWorkload(
  serviceId: string,
  name: string,
  kind: string,
  vmId: string,
  status: string,
  services: DrService[],
  vms: ReturnType<typeof useDr.getState>["vms"],
  hosts: ReturnType<typeof useDr.getState>["hosts"],
  clusters: ReturnType<typeof useDr.getState>["clusters"],
  replica?: string,
) {
  const service = services.find((item) => item.id === serviceId);
  const vm = vms.find((item) => item.id === vmId);
  const host = hosts.find((item) => item.id === vm?.hostId);
  const cluster = clusters.find((item) => item.id === vm?.clusterId);
  const role = service && vm && vm.site === service.site ? "Active" : "Standby";
  return [service?.name ?? "—", name, kind, vm?.name ?? "—", cluster?.name ?? "—", host?.name ?? "—", role, replica ?? "—", status];
}

function WorkloadTable({ rows }: { rows: string[][] }) {
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr><Th>Service</Th><Th>Name</Th><Th>Type</Th><Th>VM</Th><Th>Cluster</Th><Th>Physical host</Th><Th>Role</Th><Th>Replica</Th><Th>Status</Th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("-")}>
              {row.map((cell, index) => (
                <Td key={`${cell}-${index}`} mono={index === 3 || index === 5}>{index === row.length - 1 ? <StatusPill value={cell} /> : cell}</Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

function MiniTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <TableWrap>
      <Table>
        <thead><tr>{head.map((item) => <Th key={item}>{item}</Th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("-")}>
              {row.map((cell, index) => <Td key={`${cell}-${index}`}>{index === row.length - 1 && ["Healthy", "Degraded", "Online", "Offline", "running", "stopped", "Warning"].includes(cell) ? <StatusPill value={cell === "running" ? "Online" : cell === "stopped" ? "Offline" : cell} /> : cell}</Td>)}
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

function SignalList({ rows }: { rows: Array<{ id: string; title: string; detail: string; status: string; when: string }> }) {
  if (rows.length === 0) return <p className="text-sm text-muted">None in this view.</p>;
  return (
    <ul className="space-y-3">
      {rows.slice(0, 6).map((row) => (
        <li key={row.id} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{row.title}</span>
            <StatusPill value={row.status} />
          </div>
          <p className="mt-1 text-muted">{row.detail}</p>
          <p className="mt-1 font-mono text-xs text-faint">{row.when}</p>
        </li>
      ))}
    </ul>
  );
}
