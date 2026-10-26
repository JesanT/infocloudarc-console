import { useEffect, useState } from "react";
import { CatalogTable } from "@/components/catalog-table";
import { Button, Empty, Field, Kpi, Panel, Select, StatusPill, Table, TableWrap, Td, Th, fieldClass } from "@/components/ui";
import { hypervAction } from "@/lib/cloud/hyperv";
import { SITES, inScope, matches, siteLabel, type ComputeCluster, type ComputeService, type Instance, type PhysicalHost, type SiteKey, type WorkloadApp, type WorkloadDatabase } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";

type SummaryRow = {
  id: string;
  name: string;
  site: string;
  status: string;
  availability: number;
  performance: number;
  summary: string;
};

export function ServicesView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const services = useCloud((s) => s.services);
  const apps = useCloud((s) => s.workloadApps);
  const databases = useCloud((s) => s.workloadDatabases);
  const instances = useCloud((s) => s.instances);
  const hosts = useCloud((s) => s.hosts);
  const saveService = useCloud((s) => s.saveService);
  const deleteService = useCloud((s) => s.deleteService);
  const saveApp = useCloud((s) => s.saveWorkloadApp);
  const deleteApp = useCloud((s) => s.deleteWorkloadApp);
  const saveDb = useCloud((s) => s.saveWorkloadDatabase);
  const deleteDb = useCloud((s) => s.deleteWorkloadDatabase);
  const rows = services.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.note, item.site]));
  const visible = new Set(rows.map((item) => item.name));
  const allow = role !== "site" || site === "east" || site === "all";

  return (
    <div className="space-y-4">
      <CatalogTable<ComputeService>
        title="Services"
        subtitle="A service depends on an application, a database, or both."
        rows={rows}
        idKey="name"
        allow={allow}
        columns={[
          { key: "name", label: "Name" },
          { key: "site", label: "Site", options: ["east", "west", "central"] },
          { key: "health", label: "Status", options: ["Healthy", "Degraded"] },
          { key: "availability", label: "Availability", numeric: true },
          { key: "performance", label: "Performance", numeric: true },
          { key: "note", label: "Note" },
        ]}
        blank={() => ({ name: "", site: "east", health: "Healthy", instances: 1, availability: 99.9, performance: 95, note: "" })}
        onSave={saveService}
        onDelete={deleteService}
      />
      <DependencyTable
        title="Applications"
        subtitle="Each application runs on a virtual machine, a physical host, or both."
        rows={apps.filter((item) => visible.has(item.serviceName))}
        kind="app"
        services={rows}
        instances={instances}
        hosts={hosts}
        allow={allow}
        onSave={(row) => saveApp(row as WorkloadApp)}
        onDelete={deleteApp}
      />
      <DependencyTable
        title="Databases"
        subtitle="Each database runs on a virtual machine, a physical host, or both."
        rows={databases.filter((item) => visible.has(item.serviceName))}
        kind="db"
        services={rows}
        instances={instances}
        hosts={hosts}
        allow={allow}
        onSave={(row) => saveDb(row as WorkloadDatabase)}
        onDelete={deleteDb}
      />
    </div>
  );
}

export function DatabasesView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const services = useCloud((s) => s.services);
  const databases = useCloud((s) => s.workloadDatabases);
  const instances = useCloud((s) => s.instances);
  const hosts = useCloud((s) => s.hosts);
  const saveDb = useCloud((s) => s.saveWorkloadDatabase);
  const deleteDb = useCloud((s) => s.deleteWorkloadDatabase);
  const visibleServices = services.filter((item) => inScope(role, site, item.site));
  const names = new Set(visibleServices.map((item) => item.name));
  const rows = databases.filter((item) => names.has(item.serviceName) && matches(query, [item.name, item.engine, item.serviceName]));
  const allow = role !== "site" || site === "east" || site === "all";
  return (
    <DependencyTable
      title="Databases"
      subtitle="A database belongs to a service and runs on a virtual machine, a physical host, or both."
      rows={rows}
      kind="db"
      services={visibleServices}
      instances={instances}
      hosts={hosts}
      allow={allow}
      onSave={(row) => saveDb(row as WorkloadDatabase)}
      onDelete={deleteDb}
    />
  );
}

export function LoadBalancersView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const instances = useCloud((s) => s.instances);
  const rows = instances.filter(
    (item) => item.kind === "Load Balancer" && inScope(role, site, item.site) && matches(query, [item.name, item.ip, item.os]),
  );
  const inbound = rows.reduce((sum, item) => sum + (item.inMbps ?? 0), 0);
  const outbound = rows.reduce((sum, item) => sum + (item.outMbps ?? 0), 0);
  const connections = rows.reduce((sum, item) => sum + (item.connections ?? 0), 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Traffic in" value={`${inbound}`} hint="Mbps across balancers" />
        <Kpi label="Traffic out" value={`${outbound}`} hint="Mbps across balancers" />
        <Kpi label="Connections" value={connections.toLocaleString()} hint="Active front-end sessions" />
      </div>
      <InstanceBoard kind="Load Balancer" title="Load balancers" subtitle="Same health view as services, plus the traffic above." rows={rows} />
    </div>
  );
}

export function ClustersView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const clusters = useCloud((s) => s.clusters);
  const hosts = useCloud((s) => s.hosts);
  const saveCluster = useCloud((s) => s.saveCluster);
  const deleteCluster = useCloud((s) => s.deleteCluster);
  const saveHost = useCloud((s) => s.saveHost);
  const deleteHost = useCloud((s) => s.deleteHost);
  const rows = clusters.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.version]));
  const clusterNames = rows.map((item) => item.name);
  const hostRows = hosts.filter((item) => inScope(role, site, item.site) && (item.clusterName == null || clusterNames.includes(item.clusterName) || matches(query, [item.name, item.ip])));
  const allow = role !== "site" || site === "east" || site === "all";
  return (
    <div className="space-y-4">
      <CatalogTable<ComputeCluster>
        title="Clusters"
        subtitle="Hyper-V clusters. Physical hosts belong to a cluster."
        rows={rows}
        idKey="name"
        allow={allow}
        columns={[
          { key: "name", label: "Name" },
          { key: "site", label: "Site", options: ["east", "west", "central"] },
          { key: "nodes", label: "Nodes", numeric: true },
          { key: "ha", label: "Status", options: ["Healthy", "Degraded"] },
          { key: "version", label: "Version" },
          { key: "availability", label: "Availability", numeric: true },
          { key: "performance", label: "Performance", numeric: true },
        ]}
        blank={() => ({ name: "", site: "east", nodes: 1, ha: "Healthy", version: "Hyper-V 2022", availability: 99.9, performance: 90 })}
        onSave={(row) => saveCluster(row)}
        onDelete={deleteCluster}
      />
      <CatalogTable<PhysicalHost>
        title="Physical hosts"
        subtitle="A host can belong to a cluster. Virtual machines attach to a host."
        rows={hostRows}
        idKey="id"
        allow={allow}
        columns={[
          { key: "id", label: "Id" },
          { key: "name", label: "Name" },
          { key: "site", label: "Site", options: ["east", "west", "central"] },
          { key: "clusterName", label: "Cluster", options: ["", ...clusters.map((item) => item.name)] },
          { key: "status", label: "Status", options: ["Online", "Degraded", "Offline"] },
          { key: "ip", label: "IP" },
          { key: "cpu", label: "CPU", numeric: true },
          { key: "mem", label: "Memory", numeric: true },
        ]}
        blank={() => ({ id: `ph-${Date.now()}`, name: "", site: "east", clusterName: clusters[0]?.name ?? null, status: "Online", cpu: 10, mem: 20, ip: "" })}
        onSave={(row) => saveHost({ ...row, clusterName: row.clusterName || null })}
        onDelete={deleteHost}
      />
    </div>
  );
}

function DependencyTable({
  title,
  subtitle,
  rows,
  kind,
  services,
  instances,
  hosts,
  allow,
  onSave,
  onDelete,
}: {
  title: string;
  subtitle: string;
  rows: Array<WorkloadApp | WorkloadDatabase>;
  kind: "app" | "db";
  services: ComputeService[];
  instances: Instance[];
  hosts: { id: string; name: string }[];
  allow: boolean;
  onSave: (row: WorkloadApp | WorkloadDatabase) => void;
  onDelete: (id: string) => void;
}) {
  const flash = useCloud((s) => s.flash);
  const [draft, setDraft] = useState<(WorkloadApp | WorkloadDatabase) | null>(null);
  const vmName = (id: string | null) => instances.find((item) => item.id === id)?.name ?? "—";
  const hostName = (id: string | null) => hosts.find((item) => item.id === id)?.name ?? "—";
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      action={allow ? <Button variant="primary" onClick={() => setDraft(kind === "app"
        ? { id: `app-${Date.now()}`, name: "", kind: "tomcat", serviceName: services[0]?.name ?? "", vmId: null, hostId: hosts[0]?.id ?? null, port: 8080, status: "Healthy" }
        : { id: `db-${Date.now()}`, name: "", engine: "postgresql", serviceName: services[0]?.name ?? "", vmId: null, hostId: hosts[0]?.id ?? null, status: "Healthy" })}>Add</Button> : undefined}
    >
      {draft && (
        <form
          className="mb-4 grid gap-3 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.vmId && !draft.hostId) {
              flash("Choose a virtual machine or a physical host.");
              return;
            }
            if (!draft.serviceName || !draft.name.trim()) {
              flash("Name and service are required.");
              return;
            }
            onSave(draft);
            setDraft(null);
          }}
        >
          <Field label="Name"><input className={fieldClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field label="Service">
            <Select value={draft.serviceName} onChange={(event) => setDraft({ ...draft, serviceName: event.target.value })}>
              {services.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </Select>
          </Field>
          <Field label={kind === "app" ? "Application kind" : "Engine"}>
            <Select
              value={"kind" in draft ? draft.kind : draft.engine}
              onChange={(event) => setDraft("kind" in draft ? { ...draft, kind: event.target.value } : { ...draft, engine: event.target.value })}
            >
              {(kind === "app" ? ["tomcat", "iis", "other"] : ["postgresql", "mssql", "mysql", "mongodb", "other"]).map((option) => <option key={option}>{option}</option>)}
            </Select>
          </Field>
          <Field label="Virtual machine">
            <Select value={draft.vmId ?? ""} onChange={(event) => setDraft({ ...draft, vmId: event.target.value || null })}>
              <option value="">None</option>
              {instances.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
          <Field label="Physical host">
            <Select value={draft.hostId ?? ""} onChange={(event) => setDraft({ ...draft, hostId: event.target.value || null })}>
              <option value="">None</option>
              {hosts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
          {"port" in draft && (
            <Field label="Port"><input className={fieldClass} value={draft.port} onChange={(event) => setDraft({ ...draft, port: Number(event.target.value || 0) })} /></Field>
          )}
          <div className="flex items-end gap-2">
            <Button variant="primary" type="submit">Save</Button>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </form>
      )}
      {rows.length === 0 ? <Empty>No rows yet.</Empty> : (
        <TableWrap>
          <Table>
            <thead>
              <tr><Th>Name</Th><Th>Service</Th><Th>{kind === "app" ? "Kind" : "Engine"}</Th><Th>Virtual machine</Th><Th>Physical host</Th><Th>Status</Th>{allow && <Th>Actions</Th>}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <Td>{row.name}</Td>
                  <Td>{row.serviceName}</Td>
                  <Td>{"kind" in row ? row.kind : row.engine}</Td>
                  <Td>{vmName(row.vmId)}</Td>
                  <Td>{hostName(row.hostId)}</Td>
                  <Td><StatusPill value={row.status} /></Td>
                  {allow && (
                    <Td>
                      <div className="flex gap-1">
                        <Button onClick={() => setDraft(row)}>Edit</Button>
                        <Button variant="danger" onClick={() => onDelete(row.id)}>Delete</Button>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Panel>
  );
}

export function InstancesView() {
  return <InstanceBoard kind="all" title="Instances" subtitle="Overview of every virtual machine in scope. Power actions are under Operations." />;
}

export function InstanceOpsView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const instances = useCloud((s) => s.instances);
  const act = useCloud((s) => s.vmAction);
  const deploy = useCloud((s) => s.deployInstance);
  const flash = useCloud((s) => s.flash);
  const [host, setHost] = useState("");
  const [probe, setProbe] = useState("Checking PowerShell…");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [target, setTarget] = useState<SiteKey>("east");
  const [kind, setKind] = useState<Instance["kind"]>("Compute");
  const [os, setOs] = useState("Ubuntu 22.04");
  const rows = instances.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.ip, item.os, item.kind]));

  useEffect(() => {
    const saved = window.localStorage.getItem("infocloudarc-hv-host") ?? "";
    setHost(saved);
    void hypervAction({ data: { action: "probe", computer: saved, role } })
      .then((result) => setProbe(result.fallback ? result.message : `PowerShell is ready. ${saved ? `Commands target ${saved}.` : "No host set, so commands stay on this server."}`))
      .catch(() => setProbe("Could not check PowerShell."));
  }, [role]);

  async function run(action: "stop" | "restart" | "shutdown" | "deploy", vmName: string, vm?: Instance) {
    if (vm && role === "site" && vm.site !== "east") {
      flash("Site access cannot change workloads outside Site-East.");
      return;
    }
    setBusy(vmName + action);
    try {
      const result = await hypervAction({ data: { action, name: vmName, computer: host, role } });
      if (!result.ok && !result.fallback) {
        flash(result.message);
        return;
      }
      if (action === "deploy") deploy({ name: vmName, site: target, kind, os });
      else if (vm) act(vm.id, action);
      if (result.fallback) flash(result.message);
      else if (result.ok && action !== "deploy") flash(`${action === "stop" ? "Stopped" : action === "restart" ? "Restarted" : "Shut down"} ${vmName} on Hyper-V.`);
    } catch (error) {
      flash(error instanceof Error ? error.message : "The operation failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Hyper-V connection" subtitle={probe}>
        <form
          className="grid gap-3 md:grid-cols-[1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            window.localStorage.setItem("infocloudarc-hv-host", host.trim());
            void hypervAction({ data: { action: "probe", computer: host.trim(), role } }).then((result) => {
              setProbe(result.fallback ? result.message : `PowerShell is ready. ${host.trim() ? `Commands target ${host.trim()}.` : "Commands stay on this server."}`);
            });
          }}
        >
          <Field label="Hyper-V host">
            <input className={fieldClass} value={host} onChange={(event) => setHost(event.target.value)} placeholder="hv-east-01" />
          </Field>
          <div className="flex items-end">
            <Button type="submit">Check</Button>
          </div>
        </form>
      </Panel>

      {role === "vendor" ? (
        <Panel title="Deploy instance" subtitle="Vendor only. Creates the VM in the console, and on Hyper-V when PowerShell can reach the host.">
          <form
            className="grid gap-3 md:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run("deploy", name.trim());
              setName("");
            }}
          >
            <Field label="Name">
              <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="app-03" />
            </Field>
            <Field label="Site">
              <Select value={target} onChange={(event) => setTarget(event.target.value as SiteKey)}>
                {SITES.map((item) => (
                  <option key={item.id} value={item.id}>{siteLabel(item.id)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Kind">
              <Select value={kind} onChange={(event) => setKind(event.target.value as Instance["kind"])}>
                <option>Compute</option>
                <option>Database</option>
                <option>Load Balancer</option>
                <option>Backup</option>
              </Select>
            </Field>
            <Field label="Image">
              <Select value={os} onChange={(event) => setOs(event.target.value)}>
                <option>Ubuntu 22.04</option>
                <option>RHEL 9</option>
                <option>HAProxy</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button variant="primary" type="submit" className="w-full" disabled={busy.endsWith("deploy")}>Deploy</Button>
            </div>
          </form>
        </Panel>
      ) : (
        <Panel title="Deploy instance" subtitle="Only vendor access can deploy a virtual machine.">
          <p className="text-sm text-muted">Switch the role to Vendor to open the deploy form.</p>
        </Panel>
      )}

      <Panel title="Operations" subtitle="Stop turns the VM off. Shutdown asks the guest to power off. Restart boots it again.">
        {rows.length === 0 ? (
          <Empty>No instances in this view.</Empty>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr><Th>Name</Th><Th>Site</Th><Th>Status</Th><Th>Host</Th><Th>Actions</Th></tr>
              </thead>
              <tbody>
                {rows.map((vm) => (
                  <tr key={vm.id}>
                    <Td>
                      <div className="font-medium">{vm.name}</div>
                      <div className="text-xs text-faint">{vm.kind} · {vm.os}</div>
                    </Td>
                    <Td>{siteLabel(vm.site)}</Td>
                    <Td><StatusPill value={vm.status} /></Td>
                    <Td mono>{host || "local"}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Button disabled={busy === vm.name + "stop"} onClick={() => void run("stop", vm.name, vm)}>Stop</Button>
                        <Button disabled={busy === vm.name + "restart"} onClick={() => void run("restart", vm.name, vm)}>Restart</Button>
                        <Button variant="danger" disabled={busy === vm.name + "shutdown"} onClick={() => void run("shutdown", vm.name, vm)}>Shutdown</Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}

function InstanceBoard({
  kind,
  title,
  subtitle,
  rows,
}: {
  kind: Instance["kind"] | "all";
  title: string;
  subtitle: string;
  rows?: Instance[];
}) {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const instances = useCloud((s) => s.instances);
  const source =
    rows ??
    instances.filter(
      (item) => (kind === "all" || item.kind === kind) && inScope(role, site, item.site) && matches(query, [item.name, item.ip, item.os, item.kind]),
    );
  return (
    <WorkloadBoard
      title={title}
      subtitle={subtitle}
      rows={source.map((item) => {
        const scores = workloadScores(item.status, item.cpu);
        return {
          id: item.id,
          name: item.name,
          site: siteLabel(item.site),
          status: item.status === "running" ? "Healthy" : "Offline",
          availability: scores.availability,
          performance: scores.performance,
          summary: `${item.kind} · ${item.os} · ${item.ip}${item.hostId ? ` · host ${item.hostId}` : ""}`,
        };
      })}
    />
  );
}

function workloadScores(status: string, cpu: number) {
  if (status === "stopped" || status === "Offline") return { availability: 0, performance: 0 };
  if (status === "Degraded") return { availability: 98.2, performance: Math.max(40, 100 - cpu) };
  return { availability: 99.9, performance: Math.max(8, 100 - cpu) };
}

function WorkloadBoard({ title, subtitle, rows }: { title: string; subtitle: string; rows: SummaryRow[] }) {
  const availability = rows.length ? rows.reduce((sum, row) => sum + row.availability, 0) / rows.length : 0;
  const performance = rows.length ? rows.reduce((sum, row) => sum + row.performance, 0) / rows.length : 0;
  const healthy = rows.filter((row) => row.status === "Healthy" || row.status === "running").length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="In view" value={String(rows.length)} hint={title} />
        <Kpi label="Healthy" value={String(healthy)} hint={`${rows.length - healthy} need attention`} />
        <Kpi label="Availability" value={`${availability.toFixed(2)}%`} hint="Average in this view" />
        <Kpi label="Performance" value={`${performance.toFixed(0)}%`} hint="Headroom after load" />
      </div>
      <Panel title={title} subtitle={subtitle}>
        {rows.length === 0 ? (
          <Empty>Nothing in this view.</Empty>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr><Th>Name</Th><Th>Site</Th><Th>Status</Th><Th>Availability</Th><Th>Performance</Th><Th>Summary</Th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <Td>{row.name}</Td>
                    <Td>{row.site}</Td>
                    <Td><StatusPill value={row.status} /></Td>
                    <Td><Meter value={row.availability} /></Td>
                    <Td><Meter value={row.performance} /></Td>
                    <Td>{row.summary}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <div className="min-w-24">
      <div className="font-mono text-xs">{value.toFixed(value >= 10 && value < 100 ? 1 : 0)}%</div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-inset">
        <div className="h-full rounded-full bg-gradient-to-r from-[#ffb070] to-[#e85d04]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}
