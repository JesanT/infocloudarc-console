import { useState } from "react";
import { Button, Empty, Field, Panel, Select, StatusPill, Table, TableWrap, Td, Th, fieldClass } from "@/components/ui";
import { CLUSTERS, SITES, SERVICES, inScope, matches, siteLabel, type Instance, type SiteKey } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";

export function ServicesView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const rows = SERVICES.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.note, item.site]));
  return (
    <Panel title="Services" subtitle="Logical services running on the private cloud">
      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Site</Th>
              <Th>Health</Th>
              <Th>Instances</Th>
              <Th>Note</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.name}>
                <Td>{item.name}</Td>
                <Td>{siteLabel(item.site)}</Td>
                <Td><StatusPill value={item.health} /></Td>
                <Td mono>{item.instances}</Td>
                <Td>{item.note}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
      {rows.length === 0 && <Empty>No services in this view.</Empty>}
    </Panel>
  );
}

export function KindView({ kind, title }: { kind: Instance["kind"]; title: string }) {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const instances = useCloud((s) => s.instances);
  const rows = instances.filter(
    (item) => item.kind === kind && inScope(role, site, item.site) && matches(query, [item.name, item.ip, item.os]),
  );
  return (
    <Panel title={title} subtitle={`${rows.length} in the current scope`}>
      <InstanceTable rows={rows} />
    </Panel>
  );
}

export function ClustersView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const rows = CLUSTERS.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.version]));
  return (
    <Panel title="Clusters" subtitle="Hypervisor clusters per site">
      <div className="grid gap-3 md:grid-cols-3">
        {rows.map((item) => (
          <div key={item.name} className="rounded-lg border border-line bg-inset p-3">
            <div className="font-medium">{item.name}</div>
            <div className="mt-1 text-sm text-muted">{siteLabel(item.site)}</div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="font-mono">{item.nodes} nodes</span>
              <StatusPill value={item.ha} />
            </div>
            <div className="mt-2 font-mono text-xs text-faint">{item.version}</div>
          </div>
        ))}
      </div>
      {rows.length === 0 && <Empty>No clusters in this view.</Empty>}
    </Panel>
  );
}

export function InstancesView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const instances = useCloud((s) => s.instances);
  const deploy = useCloud((s) => s.deployInstance);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState<SiteKey>("east");
  const [kind, setKind] = useState<Instance["kind"]>("Compute");
  const [os, setOs] = useState("Ubuntu 22.04");
  const rows = instances.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.ip, item.os, item.kind]));

  return (
    <div className="space-y-4">
      <Panel
        title="Instances"
        subtitle="Stop, restart, and shut down. Deploy is limited to vendor access."
        action={
          role === "vendor" ? (
            <Button variant="primary" onClick={() => setOpen((v) => !v)}>
              {open ? "Close" : "Deploy instance"}
            </Button>
          ) : (
            <span className="text-xs text-faint">Deploy requires vendor access</span>
          )
        }
      >
        {open && (
          <form
            className="mb-4 grid gap-3 rounded-lg border border-line bg-inset p-3 md:grid-cols-5"
            onSubmit={(event) => {
              event.preventDefault();
              deploy({ name, site: target, kind, os });
              setName("");
              setOpen(false);
            }}
          >
            <Field label="Name">
              <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="app-03" />
            </Field>
            <Field label="Site">
              <Select value={target} onChange={(e) => setTarget(e.target.value as SiteKey)}>
                {SITES.map((s) => (
                  <option key={s.id} value={s.id}>{siteLabel(s.id)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Kind">
              <Select value={kind} onChange={(e) => setKind(e.target.value as Instance["kind"])}>
                <option>Compute</option>
                <option>Database</option>
                <option>Load Balancer</option>
                <option>Backup</option>
              </Select>
            </Field>
            <Field label="Image">
              <Select value={os} onChange={(e) => setOs(e.target.value)}>
                <option>Ubuntu 22.04</option>
                <option>RHEL 9</option>
                <option>HAProxy</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button variant="primary" type="submit" className="w-full">Deploy</Button>
            </div>
          </form>
        )}
        <InstanceTable rows={rows} />
      </Panel>
    </div>
  );
}

function InstanceTable({ rows }: { rows: Instance[] }) {
  const act = useCloud((s) => s.vmAction);
  if (rows.length === 0) return <Empty>No instances in this view.</Empty>;
  return (
    <TableWrap>
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Site</Th>
            <Th>Status</Th>
            <Th>CPU / Mem</Th>
            <Th>IP</Th>
            <Th>Actions</Th>
          </tr>
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
              <Td mono>{vm.cpu}% / {vm.mem}%</Td>
              <Td mono>{vm.ip}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  <Button onClick={() => act(vm.id, "stop")}>Stop</Button>
                  <Button onClick={() => act(vm.id, "restart")}>Restart</Button>
                  <Button variant="danger" onClick={() => act(vm.id, "shutdown")}>Shutdown</Button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}
