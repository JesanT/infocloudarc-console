import { useEffect, useState } from "react";
import { CatalogTable } from "@/components/catalog-table";
import { useConfirm } from "@/components/confirm";
import { Trend } from "@/components/charts";
import { Button, Empty, Field, Kpi, Panel, Select, StatusPill, Table, TableWrap, Td, Th, fieldClass } from "@/components/ui";
import { appReading, defaultAppPath } from "@/lib/cloud/app-score";
import { readApplication } from "@/lib/cloud/app-probe";
import { placeInstance } from "@/lib/cloud/deploy";
import { defaultPort, engineReading, engineSupported, statusFrom } from "@/lib/cloud/engine-score";
import { readEngine } from "@/lib/cloud/engine-probe";
import { guestAction } from "@/lib/cloud/guest";
import { boundSite, canMutateSite, inScope, matches, siteLabel, siteOptions, type ComputeCluster, type ComputeService, type Instance, type PhysicalHost, type SiteKey, type WorkloadApp, type WorkloadDatabase } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";
import { chartPoints, currentHour, hourLabel, rollup, sampleId, type SampleKind } from "@/lib/cloud/uptime";

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
  const choices = siteOptions(role, site);
  const home = choices[0];
  const scopedVms = instances.filter((item) => inScope(role, site, item.site));
  const scopedHosts = hosts.filter((item) => inScope(role, site, item.site));

  return (
    <div className="space-y-4">
      <WorkloadUptime
        kind="service"
        targets={rows.map((item) => item.name)}
        apps={apps.filter((item) => visible.has(item.serviceName))}
        databases={databases.filter((item) => visible.has(item.serviceName))}
      />
      <CatalogTable<ComputeService>
        title="Services"
        subtitle="A service depends on an application, a database, or both."
        rows={rows}
        idKey="name"
        allow
        columns={[
          { key: "name", label: "Name" },
          { key: "site", label: "Site", options: choices },
          { key: "health", label: "Status", options: ["Healthy", "Degraded"] },
          { key: "note", label: "Note" },
        ]}
        blank={() => ({ name: "", site: home, health: "Healthy", instances: 1, availability: 99.9, performance: 95, note: "" })}
        onSave={saveService}
        onDelete={deleteService}
      />
      <DependencyTable
        title="Applications"
        subtitle="Each application runs on a virtual machine, a physical host, or both."
        rows={apps.filter((item) => visible.has(item.serviceName))}
        kind="app"
        services={rows}
        instances={scopedVms}
        hosts={scopedHosts}
        allow
        onSave={(row) => saveApp(row as WorkloadApp)}
        onDelete={deleteApp}
      />
      <DependencyTable
        title="Databases"
        subtitle="Each database runs on a virtual machine, a physical host, or both."
        rows={databases.filter((item) => visible.has(item.serviceName))}
        kind="db"
        services={rows}
        instances={scopedVms}
        hosts={scopedHosts}
        allow
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
  return (
    <div className="space-y-4">
      <WorkloadUptime kind="database" targets={rows.map((item) => item.name)} databases={rows} />
      <DependencyTable
        title="Databases"
        subtitle="A database belongs to a service and runs on a virtual machine, a physical host, or both."
        rows={rows}
        kind="db"
        services={visibleServices}
        instances={instances.filter((item) => inScope(role, site, item.site))}
        hosts={hosts.filter((item) => inScope(role, site, item.site))}
        allow
        onSave={(row) => saveDb(row as WorkloadDatabase)}
        onDelete={deleteDb}
      />
    </div>
  );
}

export function ApplicationsView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const services = useCloud((s) => s.services);
  const apps = useCloud((s) => s.workloadApps);
  const instances = useCloud((s) => s.instances);
  const hosts = useCloud((s) => s.hosts);
  const saveApp = useCloud((s) => s.saveWorkloadApp);
  const deleteApp = useCloud((s) => s.deleteWorkloadApp);
  const visibleServices = services.filter((item) => inScope(role, site, item.site));
  const names = new Set(visibleServices.map((item) => item.name));
  const rows = apps.filter((item) => names.has(item.serviceName) && matches(query, [item.name, item.kind, item.serviceName]));
  return (
    <div className="space-y-4">
      <WorkloadUptime kind="app" targets={rows.map((item) => item.name)} apps={rows} />
      <DependencyTable
        title="Applications"
        subtitle="An application belongs to a service and runs on a virtual machine, a physical host, or both."
        rows={rows}
        kind="app"
        services={visibleServices}
        instances={instances.filter((item) => inScope(role, site, item.site))}
        hosts={hosts.filter((item) => inScope(role, site, item.site))}
        allow
        onSave={(row) => saveApp(row as WorkloadApp)}
        onDelete={deleteApp}
      />
    </div>
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
      <InstanceBoard kind="Load Balancer" title="Load balancers" subtitle="These are load-balancer instances. Add, edit, and remove them under Instances → Operations. Remove asks first and does not delete the guest." rows={rows} />
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
  const clusterChoices = clusters.filter((item) => inScope(role, site, item.site)).map((item) => item.name);
  const hostRows = hosts.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.ip, item.clusterName ?? ""]));
  const choices = siteOptions(role, site);
  const home = choices[0];
  return (
    <div className="space-y-4">
      <CatalogTable<ComputeCluster>
        title="Clusters"
        subtitle="Hyper-V clusters. Physical hosts belong to a cluster."
        rows={rows}
        idKey="name"
        allow
        columns={[
          { key: "name", label: "Name" },
          { key: "site", label: "Site", options: choices },
          { key: "nodes", label: "Nodes", numeric: true },
          { key: "ha", label: "Status", options: ["Healthy", "Degraded"] },
          { key: "version", label: "Version" },
          { key: "availability", label: "Availability", numeric: true },
          { key: "performance", label: "Performance", numeric: true },
        ]}
        blank={() => ({ name: "", site: home, nodes: 1, ha: "Healthy", version: "Hyper-V 2022", availability: 99.9, performance: 90 })}
        onSave={(row) => saveCluster(row)}
        onDelete={deleteCluster}
      />
      <CatalogTable<PhysicalHost>
        title="Physical hosts"
        subtitle="A host can belong to a cluster. Virtual machines attach to a host."
        rows={hostRows}
        idKey="id"
        allow
        columns={[
          { key: "id", label: "Id" },
          { key: "name", label: "Name" },
          { key: "site", label: "Site", options: choices },
          { key: "clusterName", label: "Cluster", options: ["", ...clusterChoices] },
          { key: "status", label: "Status", options: ["Online", "Degraded", "Offline"] },
          { key: "ip", label: "IP" },
          { key: "cpu", label: "CPU", numeric: true },
          { key: "mem", label: "Memory", numeric: true },
        ]}
        blank={() => ({ id: `ph-${Date.now()}`, name: "", site: home, clusterName: clusterChoices[0] ?? null, status: "Online", cpu: 10, mem: 20, ip: "" })}
        onSave={(row) => saveHost({ ...row, clusterName: row.clusterName || null })}
        onDelete={deleteHost}
      />
    </div>
  );
}

function scoreText(value: number, digits: number) {
  if (value < 0) return "Not measured";
  return `${value.toFixed(digits)}%`;
}

function addressFor(vmId: string | null, hostId: string | null, instances: Instance[], hosts: PhysicalHost[]) {
  return instances.find((item) => item.id === vmId)?.ip || hosts.find((item) => item.id === hostId)?.ip || "";
}

function WorkloadUptime({
  kind,
  targets,
  apps = [],
  databases = [],
}: {
  kind: SampleKind;
  targets: string[];
  apps?: WorkloadApp[];
  databases?: WorkloadDatabase[];
}) {
  const samples = useCloud((s) => s.workloadSamples);
  const capture = useCloud((s) => s.captureWorkloads);
  const allApps = useCloud((s) => s.workloadApps);
  const allDatabases = useCloud((s) => s.workloadDatabases);
  useEffect(() => {
    capture();
  }, [capture]);
  const cards = targets.map((name) => {
    const points = chartPoints({
      kind,
      target: name,
      samples,
      apps: kind === "service" ? apps : allApps,
      databases: kind === "service" ? databases : allDatabases,
    });
    const checked = points.filter((point) => point.up !== null);
    const score = rollup(checked.map((point) => ({ up: point.up === 1 ? 1 : 0, performance: point.performance ?? -1 })));
    const latest = [...checked].reverse().find((point) => point.detail) ?? checked.at(-1);
    return { name, points, score, latest };
  });
  const availabilityValues = cards.map((card) => card.score.availability).filter((value) => value >= 0);
  const performanceValues = cards.map((card) => card.score.performance).filter((value) => value >= 0);
  const availability = availabilityValues.length ? availabilityValues.reduce((sum, value) => sum + value, 0) / availabilityValues.length : -1;
  const performance = performanceValues.length ? performanceValues.reduce((sum, value) => sum + value, 0) / performanceValues.length : -1;
  const checks = cards.reduce((sum, card) => sum + card.score.checks, 0);
  const noun = kind === "service" ? "services" : kind === "app" ? "applications" : "databases";
  const detail = kind === "service"
    ? "A service is not measured by itself. An hour counts only when every database under it was read that hour. An application counts when it was read. The score is the weakest of those readings. A blank hour was not checked."
    : kind === "database"
      ? "The console signs in to SQL Server, MySQL, MongoDB, or PostgreSQL and reads that engine’s own counters. Nothing is installed in the virtual machine. 100 means the counters that came back are in a normal range. It does not mean queries are fast. A failed login or a timeout is not saved."
      : "The console requests the application server. Tomcat is read from the Manager status page. A metrics page is read when one is already published. Nothing is installed in the virtual machine, and a stopwatch around one request is not the score. A failed login or a timeout is not saved.";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="In view" value={String(cards.length)} hint={noun} />
        <Kpi label="Availability" value={scoreText(availability, 2)} hint={checks ? "Of hours that were checked" : "No reading yet"} />
        <Kpi label="Performance" value={scoreText(performance, 0)} hint={checks ? (kind === "database" ? "Engine counters" : kind === "app" ? "Status or metrics" : "Weakest reading") : "No reading yet"} />
      </div>
      <Panel title="Last 24 hours" subtitle={detail}>
        {kind === "database" && <EngineCheck databases={databases} />}
        {kind === "app" && <ApplicationCheck apps={apps} />}
        {cards.length === 0 ? (
          <Empty>Nothing in this view.</Empty>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-info" /> Up</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-ok" /> Counter score</span>
              <span>A gap is a missing check, not a healthy hour.</span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {cards.map((card) => (
                <div key={card.name} className="rounded-xl border border-line p-3">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium text-ink">{card.name}</h3>
                    <p className="text-xs text-muted">
                      {scoreText(card.score.availability, 2)} up · {scoreText(card.score.performance, 0)} {statusFrom(card.score.performance).toLowerCase()} · {card.score.checks} checked
                    </p>
                  </div>
                  <p className="mb-2 text-xs text-muted">{card.latest?.detail || "No reading in the last 24 hours."}</p>
                  {card.score.checks === 0 ? null : (
                    <Trend
                      data={card.points.map((point) => ({ label: hourLabel(point.hour), a: point.up == null ? null : point.up ? 100 : 0, b: point.performance }))}
                      aLabel="Up"
                      bLabel="Counter score"
                      className="h-32"
                      interval={5}
                      domain={[0, 100]}
                    />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

function EngineCheck({ databases }: { databases: WorkloadDatabase[] }) {
  const instances = useCloud((s) => s.instances);
  const hosts = useCloud((s) => s.hosts);
  const record = useCloud((s) => s.recordReading);
  const [id, setId] = useState(databases[0]?.id ?? "");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [database, setDatabase] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const selected = databases.find((item) => item.id === id) ?? databases[0];

  useEffect(() => {
    if (!selected) return;
    setHost(addressFor(selected.vmId, selected.hostId, instances, hosts));
    setPort(String(defaultPort(selected.engine) || ""));
    setDatabase(selected.engine === "postgresql" ? "postgres" : selected.engine === "mssql" ? "master" : selected.engine === "mongodb" ? "admin" : "");
    setNote("");
    // Refill only when the operator picks a different database.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  if (!selected) return null;
  const supported = engineSupported(selected.engine);

  return (
    <form
      className="mb-4 grid gap-3 md:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!supported || busy) return;
        setBusy(true);
        setNote("Reading counters…");
        void readEngine({
          data: { engine: selected.engine, host: host.trim(), port: Number(port), user: user.trim(), password, database: database.trim() },
        })
          .then((result) => {
            if (!result.ok) {
              setNote(result.message);
              return;
            }
            const hour = currentHour();
            record({
              id: sampleId("database", selected.name, hour),
              kind: "database",
              target: selected.name,
              hour,
              up: result.up,
              performance: result.performance,
              source: result.source,
              detail: result.detail,
            });
            setPassword("");
            setNote(result.detail);
          })
          .catch((error: unknown) => {
            setNote(error instanceof Error ? error.message : "The reading failed.");
          })
          .finally(() => setBusy(false));
      }}
    >
      <Field label="Workload">
        <Select value={selected.id} onChange={(event) => setId(event.target.value)}>
          {databases.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.engine}</option>)}
        </Select>
      </Field>
      <Field label="Address">
        <input className={fieldClass} value={host} onChange={(event) => setHost(event.target.value)} placeholder="Listener or mongos" />
      </Field>
      <Field label="Port">
        <input className={fieldClass} value={port} onChange={(event) => setPort(event.target.value)} />
      </Field>
      <Field label="Login">
        <input className={fieldClass} value={user} autoComplete="off" onChange={(event) => setUser(event.target.value)} />
      </Field>
      <Field label="Password">
        <input className={fieldClass} type="password" value={password} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} />
      </Field>
      <Field label={selected.engine === "mongodb" ? "Auth database" : "Database"}>
        <input className={fieldClass} value={database} onChange={(event) => setDatabase(event.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 md:col-span-3">
        <Button variant="primary" type="submit" disabled={!supported || busy}>{busy ? "Reading…" : "Read engine"}</Button>
        <p className="text-xs text-muted">{engineReading(selected.engine)} The password is used for this reading only and is not saved. Use the listener or mongos address when the engine has one.</p>
      </div>
      {note && <p className="text-sm text-ink md:col-span-3">{note}</p>}
    </form>
  );
}

function ApplicationCheck({ apps }: { apps: WorkloadApp[] }) {
  const instances = useCloud((s) => s.instances);
  const hosts = useCloud((s) => s.hosts);
  const record = useCloud((s) => s.recordReading);
  const [id, setId] = useState(apps[0]?.id ?? "");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [path, setPath] = useState("/");
  const [https, setHttps] = useState(false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const selected = apps.find((item) => item.id === id) ?? apps[0];

  useEffect(() => {
    if (!selected) return;
    const nextPort = selected.port || (selected.kind === "tomcat" ? 8080 : 80);
    setHost(addressFor(selected.vmId, selected.hostId, instances, hosts));
    setPort(String(nextPort));
    setPath(defaultAppPath(selected.kind, nextPort));
    setHttps(nextPort === 443);
    setNote("");
    // Refill only when the operator picks a different application.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  if (!selected) return null;

  return (
    <form
      className="mb-4 grid gap-3 md:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setNote("Reading the application…");
        void readApplication({
          data: { host: host.trim(), port: Number(port), path: path.trim() || "/", https, user: user.trim(), password },
        })
          .then((result) => {
            if (!result.ok) {
              setNote(result.message);
              return;
            }
            const hour = currentHour();
            record({
              id: sampleId("app", selected.name, hour),
              kind: "app",
              target: selected.name,
              hour,
              up: result.up,
              performance: result.performance,
              source: result.source,
              detail: result.detail,
            });
            setPassword("");
            setNote(result.detail);
          })
          .catch((error: unknown) => {
            setNote(error instanceof Error ? error.message : "The reading failed.");
          })
          .finally(() => setBusy(false));
      }}
    >
      <Field label="Application">
        <Select value={selected.id} onChange={(event) => setId(event.target.value)}>
          {apps.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.kind}</option>)}
        </Select>
      </Field>
      <Field label="Address">
        <input className={fieldClass} value={host} onChange={(event) => setHost(event.target.value)} />
      </Field>
      <Field label="Port">
        <input className={fieldClass} value={port} onChange={(event) => setPort(event.target.value)} />
      </Field>
      <Field label="Path">
        <input className={fieldClass} value={path} onChange={(event) => setPath(event.target.value)} />
      </Field>
      <Field label="Login">
        <input className={fieldClass} value={user} autoComplete="off" onChange={(event) => setUser(event.target.value)} placeholder="Tomcat manager user" />
      </Field>
      <Field label="Password">
        <input className={fieldClass} type="password" value={password} autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 md:col-span-3">
        <Button variant="primary" type="submit" disabled={busy}>{busy ? "Reading…" : "Read application"}</Button>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={https} onChange={(event) => setHttps(event.target.checked)} />
          HTTPS
        </label>
        <p className="text-xs text-muted">{appReading(selected.kind)} The password is used for this reading only and is not saved. Private certificates are accepted.</p>
      </div>
      {note && <p className="text-sm text-ink md:col-span-3">{note}</p>}
    </form>
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
  const { ask, dialog } = useConfirm();
  const [draft, setDraft] = useState<(WorkloadApp | WorkloadDatabase) | null>(null);
  const vmName = (id: string | null) => instances.find((item) => item.id === id)?.name ?? "—";
  const hostName = (id: string | null) => hosts.find((item) => item.id === id)?.name ?? "—";
  return (
    <>
    {dialog}
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
            const next = draft;
            const save = () => {
              onSave(next);
              setDraft(null);
            };
            if (rows.some((row) => row.id === next.id)) {
              ask({
                title: `Save changes to ${next.name.trim()}?`,
                body: "This replaces the console record. It does not change the guest.",
                confirmLabel: "Save",
                run: save,
              });
              return;
            }
            save();
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
                        <Button variant="danger" onClick={() => ask({
                          title: `Delete ${row.name}?`,
                          body: "This removes the console record only. It does not stop the guest.",
                          confirmLabel: "Delete",
                          danger: true,
                          run: () => onDelete(row.id),
                        })}>Delete</Button>
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
    </>
  );
}

export function InstancesView() {
  return <InstanceBoard kind="all" title="Instances" subtitle="Overview of every virtual machine in scope. Edit and remove are under Operations. Remove asks before it drops the console row, and it does not delete the virtual machine." />;
}

export function InstanceOpsView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const instances = useCloud((s) => s.instances);
  const hypervisors = useCloud((s) => s.hypervisors);
  const templates = useCloud((s) => s.deployTemplates);
  const images = useCloud((s) => s.deployImages);
  const repos = useCloud((s) => s.deployRepos);
  const act = useCloud((s) => s.vmAction);
  const deploy = useCloud((s) => s.deployInstance);
  const update = useCloud((s) => s.updateInstance);
  const remove = useCloud((s) => s.deleteInstance);
  const flash = useCloud((s) => s.flash);
  const { ask, dialog } = useConfirm();
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [hvId, setHvId] = useState("");
  const [tplId, setTplId] = useState("");
  const [editId, setEditId] = useState("");
  const [editHvId, setEditHvId] = useState("");
  const [editTplId, setEditTplId] = useState("");
  const rows = instances.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.ip, item.os, item.kind, item.diskPath ?? "", item.configPath ?? ""]));
  const hvChoices = hypervisors.filter((item) => inScope(role, site, item.site));
  const selectedHv = hvChoices.find((item) => item.id === hvId) ?? hvChoices[0];
  const tplChoices = templates.filter((item) => inScope(role, site, item.site) && (!selectedHv || item.site === selectedHv.site));
  const selectedTpl = tplChoices.find((item) => item.id === tplId) ?? tplChoices[0];
  const selectedImage = images.find((item) => item.id === selectedTpl?.imageId) ?? null;
  const preview = selectedHv && selectedTpl
    ? placeInstance({ name: name.trim() || "new-vm", hypervisor: selectedHv, image: selectedImage, template: selectedTpl, repositories: repos })
    : null;

  function linked(vm: Instance) {
    return hypervisors.find((item) => item.id === vm.hypervisorId) ?? null;
  }

  async function run(action: "stop" | "restart" | "shutdown" | "deploy", vmName: string, vm?: Instance) {
    if (vm && !canMutateSite(role, site, vm.site)) {
      const home = boundSite(role, site);
      flash(`Site access cannot change workloads outside ${siteLabel(home === "all" ? "east" : home)}.`);
      return;
    }
    if (action === "deploy") {
      if (role !== "vendor") {
        flash("Only vendor access can deploy instances.");
        return;
      }
      if (!selectedHv || !selectedTpl || !preview) {
        flash("Choose a hypervisor and a template. Add both under Administration if the lists are empty.");
        return;
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(vmName)) {
        flash("Instance name is not valid.");
        return;
      }
      if (instances.some((item) => item.name === vmName)) {
        flash("An instance with that name already exists.");
        return;
      }
      if (!preview.diskPath) {
        flash(preview.note || "This hypervisor has no disk repository.");
        return;
      }
    }
    setBusy(vmName + action);
    try {
      const hv = action === "deploy" ? selectedHv : vm ? linked(vm) : null;
      const shape = action === "deploy" && preview ? preview : null;
      if (action !== "deploy" && vm && !hv) {
        act(vm.id, action);
        flash(`No hypervisor is linked to ${vm.name}, so only the console record changed.`);
        return;
      }
      if (!hv) {
        flash("Choose a hypervisor.");
        return;
      }
      const result = await guestAction({
        data: {
          action,
          kind: hv.kind,
          name: vmName,
          address: hv.address,
          port: hv.port,
          login: hv.login,
          password: hv.password || "",
          memoryMb: shape?.memoryMb ?? 2048,
          vcpu: shape?.vcpu ?? 2,
          diskGb: shape?.diskGb ?? 40,
          switchName: hv.switchName,
          configPath: shape?.configPath ?? vm?.configPath ?? "",
          diskPath: shape?.diskPath ?? vm?.diskPath ?? "",
          imagePath: shape?.imagePath ?? "",
          format: shape?.format ?? (hv.kind === "hyper-v" ? "vhdx" : "qcow2"),
          role,
        },
      });
      if (!result.ok && !result.fallback) {
        flash(result.message);
        return;
      }
      if (action === "deploy" && selectedHv && selectedTpl && preview) {
        deploy({
          name: vmName,
          site: selectedHv.site,
          kind: preview.instanceKind,
          os: preview.os,
          hypervisorId: selectedHv.id,
          templateId: selectedTpl.id,
          imageId: selectedImage?.id ?? "",
          hostId: selectedHv.hostId || null,
          clusterName: selectedHv.clusterName || null,
          configPath: preview.configPath,
          diskPath: preview.diskPath,
          swapPath: preview.swapPath,
          started: result.ok && !result.fallback,
        });
        setName("");
      } else if (vm && action !== "deploy") {
        act(vm.id, action);
      }
      if (result.fallback || (action === "deploy" && result.ok)) flash(result.message);
    } catch (error) {
      flash(error instanceof Error ? error.message : "The operation failed.");
    } finally {
      setBusy("");
    }
  }

  function saveEdit(vm: Instance) {
    const hv = hvChoices.find((item) => item.id === editHvId && item.site === vm.site) ?? hvChoices.find((item) => item.site === vm.site);
    const sameSite = templates.filter((item) => inScope(role, site, item.site) && item.site === vm.site);
    const tpl = sameSite.find((item) => item.id === editTplId) ?? sameSite[0];
    const image = images.find((item) => item.id === tpl?.imageId) ?? null;
    if (!hv || !tpl) {
      flash("Choose a hypervisor on the same site and a template. This does not move the virtual machine.");
      return;
    }
    const placed = placeInstance({ name: vm.name, hypervisor: hv, image, template: tpl, repositories: repos });
    ask({
      title: `Save changes to ${vm.name}?`,
      body: "This updates the console paths and the linked hypervisor. It does not move the virtual machine or its disks.",
      confirmLabel: "Save",
      run: () => {
        update(vm.id, {
          hypervisorId: hv.id,
          templateId: tpl.id,
          imageId: image?.id ?? "",
          hostId: hv.hostId || null,
          clusterName: hv.clusterName || null,
          configPath: placed.configPath,
          diskPath: placed.diskPath,
          swapPath: placed.swapPath,
        });
        setEditId("");
      },
    });
  }

  return (
    <div className="space-y-4">
      {dialog}
      {role === "vendor" ? (
        <Panel title="Deploy instance" subtitle="Vendor only. The template sets CPU, memory, disk, and image. The hypervisor sets where the machine file, disk, and swap are written. A timeout or a refused login is not stored as a running virtual machine.">
          {hvChoices.length === 0 || templates.length === 0 ? (
            <p className="text-sm text-muted">Add a hypervisor and a template under Administration before deploying.</p>
          ) : (
            <form
              className="grid gap-3 md:grid-cols-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run("deploy", name.trim());
              }}
            >
              <Field label="Name">
                <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="app-03" />
              </Field>
              <Field label="Hypervisor">
                <Select value={selectedHv?.id ?? ""} onChange={(event) => { setHvId(event.target.value); setTplId(""); }}>
                  {hvChoices.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} · {item.kind === "libvirt" ? "Libvirt" : "Hyper-V"} · {siteLabel(item.site)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Template">
                <Select value={selectedTpl?.id ?? ""} onChange={(event) => setTplId(event.target.value)}>
                  {tplChoices.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} · {item.vcpu} CPU · {item.memoryMb} MB · {item.diskGb} GB</option>
                  ))}
                </Select>
              </Field>
              {preview && (
                <div className="space-y-1 text-xs text-muted md:col-span-3">
                  <p>{preview.instanceKind} · {preview.os} · {preview.vcpu} CPU · {preview.memoryMb} MB · {preview.diskGb} GB · site {selectedHv ? siteLabel(selectedHv.site) : ""}</p>
                  <p>Machine file {preview.configPath || "not set"}</p>
                  <p>Disk {preview.diskPath || "not set"}{preview.imagePath ? ` from ${preview.imagePath}` : ""}</p>
                  <p>Swap {preview.swapPath || "not set"}</p>
                  {preview.note && <p>{preview.note}</p>}
                </div>
              )}
              {tplChoices.length === 0 && <p className="text-sm text-muted md:col-span-3">No template is recorded for this hypervisor’s site.</p>}
              <div className="md:col-span-3">
                <Button variant="primary" type="submit" disabled={busy.endsWith("deploy") || !selectedTpl}>Deploy</Button>
              </div>
            </form>
          )}
        </Panel>
      ) : (
        <Panel title="Deploy instance" subtitle="Only vendor access can deploy a virtual machine.">
          <p className="text-sm text-muted">Switch the role to Vendor to open the deploy form.</p>
        </Panel>
      )}

      <Panel title="Operations" subtitle="Power actions use the hypervisor linked to the instance. Edit and Remove both ask first. Remove drops the console row only. Disks on the hypervisor stay where they are.">
        {rows.length === 0 ? (
          <Empty>No instances in this view.</Empty>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr><Th>Name</Th><Th>Site</Th><Th>Status</Th><Th>Hypervisor</Th><Th>Actions</Th></tr>
              </thead>
              <tbody>
                {rows.map((vm) => {
                  const hv = linked(vm);
                  const editing = editId === vm.id;
                  const editHv = hvChoices.find((item) => item.id === editHvId && item.site === vm.site) ?? hvChoices.find((item) => item.site === vm.site);
                  const editTpls = templates.filter((item) => inScope(role, site, item.site) && item.site === vm.site);
                  const editTpl = editTpls.find((item) => item.id === editTplId) ?? editTpls[0];
                  return (
                    <tr key={vm.id}>
                      <Td>
                        <div className="font-medium">{vm.name}</div>
                        <div className="text-xs text-faint">{vm.kind} · {vm.os}</div>
                        {vm.diskPath && <div className="text-xs text-faint">{vm.diskPath}</div>}
                        {editing && (
                          <div className="mt-2 grid gap-2">
                            <Select value={editHv?.id ?? ""} onChange={(event) => setEditHvId(event.target.value)}>
                              {hvChoices.filter((item) => item.site === vm.site).map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                              ))}
                            </Select>
                            <Select value={editTpl?.id ?? ""} onChange={(event) => setEditTplId(event.target.value)}>
                              {editTpls.map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                              ))}
                            </Select>
                            <div className="flex gap-1">
                              <Button onClick={() => saveEdit(vm)}>Save</Button>
                              <Button onClick={() => setEditId("")}>Cancel</Button>
                            </div>
                          </div>
                        )}
                      </Td>
                      <Td>{siteLabel(vm.site)}</Td>
                      <Td><StatusPill value={vm.status} /></Td>
                      <Td>{hv ? hv.name : "Not linked"}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          <Button disabled={busy === vm.name + "stop"} onClick={() => void run("stop", vm.name, vm)}>Stop</Button>
                          <Button disabled={busy === vm.name + "restart"} onClick={() => void run("restart", vm.name, vm)}>Restart</Button>
                          <Button variant="danger" disabled={busy === vm.name + "shutdown"} onClick={() => void run("shutdown", vm.name, vm)}>Shutdown</Button>
                          <Button disabled={!canMutateSite(role, site, vm.site)} onClick={() => { setEditId(vm.id); setEditHvId(vm.hypervisorId ?? ""); setEditTplId(vm.templateId ?? ""); }}>Edit</Button>
                          <Button disabled={!canMutateSite(role, site, vm.site)} onClick={() => ask({
                            title: `Remove ${vm.name}?`,
                            body: "This drops the console row only. The virtual machine and its disks stay on the hypervisor.",
                            confirmLabel: "Remove",
                            danger: true,
                            run: () => remove(vm.id),
                          })}>Remove</Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
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
