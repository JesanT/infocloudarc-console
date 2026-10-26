import { useState } from "react";
import { Button, Empty, Field, Kpi, Panel, Select, StatusPill, Table, TableWrap, Td, Th, fieldClass } from "@/components/ui";
import { checkHypervisor } from "@/lib/cloud/hypervisor-probe";
import { addressOk, cleanHypervisor, hypervisorDefaults, hypervisorUri, passwordOk, type Hypervisor, type HypervisorKind } from "@/lib/cloud/hypervisor";
import { canMutateSite, inScope, matches, siteLabel, siteOptions, type SiteKey } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";

function blank(site: SiteKey): Hypervisor {
  const defaults = hypervisorDefaults("libvirt");
  return {
    id: "",
    name: "",
    site,
    kind: "libvirt",
    address: "",
    port: defaults.port,
    transport: defaults.transport,
    login: "",
    password: "",
    status: "Unknown",
    clusterName: "",
    switchName: defaults.switchName,
    storage: defaults.storage,
    configRepoId: "",
    diskRepoId: "",
    swapRepoId: "",
    hostId: "",
    uri: "",
    detail: "",
  };
}

export function HypervisorsView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const rows = useCloud((s) => s.hypervisors);
  const hosts = useCloud((s) => s.hosts);
  const repos = useCloud((s) => s.deployRepos);
  const save = useCloud((s) => s.saveHypervisor);
  const remove = useCloud((s) => s.deleteHypervisor);
  const flash = useCloud((s) => s.flash);
  const choices = siteOptions(role, site);
  const home = choices[0];
  const visible = rows.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.address, item.kind, item.clusterName, item.switchName]));
  const hostChoices = hosts.filter((item) => inScope(role, site, item.site));
  const [draft, setDraft] = useState<Hypervisor | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const repoChoices = repos.filter((item) => inScope(role, site, item.site));
  const hyperv = visible.filter((item) => item.kind === "hyper-v").length;
  const libvirt = visible.filter((item) => item.kind === "libvirt").length;

  function setKind(kind: HypervisorKind) {
    if (!draft) return;
    const defaults = hypervisorDefaults(kind);
    setDraft({ ...draft, kind, transport: defaults.transport, port: defaults.port, switchName: defaults.switchName, storage: defaults.storage, uri: "" });
  }

  async function runCheck(row: Hypervisor) {
    if (!addressOk(row.address.trim())) {
      setNote("Address is not valid.");
      return;
    }
    setBusy(row.id || "draft");
    setNote("Checking the management port…");
    try {
      const result = await checkHypervisor({
        data: { kind: row.kind, address: row.address.trim(), port: Number(row.port), transport: row.transport, login: row.login.trim(), password: row.password || "" },
      });
      if (!result.ok) {
        setNote(result.message);
        return;
      }
      const next = cleanHypervisor({ ...row, status: result.status, detail: result.detail });
      if (draft && draft.id === row.id) setDraft(next);
      if (row.id && rows.some((item) => item.id === row.id)) save(next);
      setNote(result.detail);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The check failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="In view" value={String(visible.length)} hint="Hypervisors" />
        <Kpi label="Hyper-V" value={String(hyperv)} hint="WinRM" />
        <Kpi label="Libvirt" value={String(libvirt)} hint="Ubuntu host" />
      </div>
      <Panel
        title="Hypervisors"
        subtitle="Register the hypervisor itself. Hyper-V is checked on its WinRM port. An Ubuntu host is checked by SSH to virsh on that host. Nothing is installed in a guest. The password is optional."
        action={
          canMutateSite(role, site, home) ? (
            <Button variant="primary" onClick={() => { setDraft(blank(home)); setNote(""); }}>Add</Button>
          ) : (
            <span className="text-xs text-faint">View only for this access</span>
          )
        }
      >
        {draft && (
          <form
            className="mb-4 grid gap-3 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              const existing = rows.some((item) => item.id === draft.id);
              const next = cleanHypervisor({ ...draft, id: existing ? draft.id : draft.name.trim(), name: draft.name.trim() });
              if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(next.id)) {
                flash("Use a short name with letters, numbers, dots, or dashes.");
                return;
              }
              if (!addressOk(next.address)) {
                flash("Address is not valid.");
                return;
              }
              if (next.login && !/^[A-Za-z0-9._-]{1,32}$/.test(next.login)) {
                flash("Login is not valid.");
                return;
              }
              if (!passwordOk(draft.password || "")) {
                flash("Password is not valid.");
                return;
              }
              if (next.password && !next.login) {
                flash("A password needs a login.");
                return;
              }
              save({ ...next, name: next.name || next.id });
              setDraft(null);
            }}
          >
            <Field label="Name">
              <input className={fieldClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Field label="Kind">
              <Select value={draft.kind} onChange={(event) => setKind(event.target.value as HypervisorKind)}>
                <option value="hyper-v">Hyper-V</option>
                <option value="libvirt">Libvirt (Ubuntu)</option>
              </Select>
            </Field>
            <Field label="Site">
              <Select value={draft.site} onChange={(event) => setDraft({ ...draft, site: event.target.value as SiteKey })}>
                {choices.map((item) => <option key={item} value={item}>{siteLabel(item)}</option>)}
              </Select>
            </Field>
            <Field label="Management address">
              <input className={fieldClass} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} placeholder="Host name or IP" />
            </Field>
            <Field label="Transport">
              <Select value={draft.transport} onChange={(event) => setDraft({ ...draft, transport: event.target.value as Hypervisor["transport"] })}>
                <option value="winrm">WinRM</option>
                <option value="ssh">SSH</option>
                <option value="tls">TLS</option>
              </Select>
            </Field>
            <Field label="Port">
              <input className={fieldClass} value={String(draft.port)} onChange={(event) => setDraft({ ...draft, port: Number(event.target.value) })} />
            </Field>
            <Field label="Login">
              <input className={fieldClass} value={draft.login} autoComplete="off" onChange={(event) => setDraft({ ...draft, login: event.target.value })} placeholder={draft.kind === "libvirt" ? "SSH user on the hypervisor" : "WinRM user, if required"} />
            </Field>
            <Field label="Password">
              <input className={fieldClass} type="password" value={draft.password || ""} autoComplete="new-password" onChange={(event) => setDraft({ ...draft, password: event.target.value })} placeholder="Optional. Blank keeps key or current identity" />
            </Field>
            <Field label="Cluster">
              <input className={fieldClass} value={draft.clusterName} onChange={(event) => setDraft({ ...draft, clusterName: event.target.value })} placeholder="Optional" />
            </Field>
            <Field label={draft.kind === "libvirt" ? "Bridge" : "Virtual switch"}>
              <input className={fieldClass} value={draft.switchName} onChange={(event) => setDraft({ ...draft, switchName: event.target.value })} />
            </Field>
            <Field label={draft.kind === "libvirt" ? "Fallback pool" : "Fallback path"}>
              <input className={fieldClass} value={draft.storage} onChange={(event) => setDraft({ ...draft, storage: event.target.value })} />
            </Field>
            <Field label="VM machine files">
              <Select value={draft.configRepoId} onChange={(event) => setDraft({ ...draft, configRepoId: event.target.value })}>
                <option value="">None</option>
                {repoChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="VM storage">
              <Select value={draft.diskRepoId} onChange={(event) => setDraft({ ...draft, diskRepoId: event.target.value })}>
                <option value="">None</option>
                {repoChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Swap files">
              <Select value={draft.swapRepoId} onChange={(event) => setDraft({ ...draft, swapRepoId: event.target.value })}>
                <option value="">None</option>
                {repoChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Compute host">
              <Select value={draft.hostId} onChange={(event) => setDraft({ ...draft, hostId: event.target.value })}>
                <option value="">None</option>
                {hostChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Connection">
              <input className={fieldClass} value={draft.uri} onChange={(event) => setDraft({ ...draft, uri: event.target.value })} placeholder={hypervisorUri(draft) || "Built from the address"} />
            </Field>
            <div className="flex flex-wrap items-center gap-3 md:col-span-3">
              <Button variant="primary" type="submit">Save</Button>
              <Button type="button" disabled={busy === (draft.id || "draft")} onClick={() => void runCheck(draft)}>{busy === (draft.id || "draft") ? "Checking…" : "Check"}</Button>
              <Button type="button" onClick={() => setDraft(null)}>Cancel</Button>
              <p className="text-xs text-muted">{hypervisorUri(draft) || "Add an address to build the connection."} The password is saved with this hypervisor and is not shown in the list. Leave it blank to use an SSH key or the console identity.</p>
            </div>
          </form>
        )}
        {note && <p className="mb-3 text-sm text-ink">{note}</p>}
        {visible.length === 0 ? (
          <Empty>No hypervisor in this view. Add the Ubuntu host after it is installed.</Empty>
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Kind</Th>
                  <Th>Site</Th>
                  <Th>Address</Th>
                  <Th>Switch / pool</Th>
                  <Th>Status</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const allow = canMutateSite(role, site, row.site);
                  return (
                    <tr key={row.id}>
                      <Td>
                        <div className="font-medium">{row.name}</div>
                        <div className="text-xs text-muted">{row.detail || hypervisorUri(row)}</div>
                      </Td>
                      <Td>{row.kind === "libvirt" ? "Libvirt" : "Hyper-V"}</Td>
                      <Td>{siteLabel(row.site)}</Td>
                      <Td>{row.address}:{row.port} · {row.transport}{row.login ? ` · ${row.login}` : ""}</Td>
                      <Td>{row.switchName || "—"} · {repos.find((item) => item.id === row.diskRepoId)?.name || row.storage || "—"}</Td>
                      <Td><StatusPill value={row.status} /></Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <Button disabled={!allow || busy === row.id} onClick={() => void runCheck(row)}>{busy === row.id ? "Checking…" : "Check"}</Button>
                          <Button disabled={!allow} onClick={() => { setDraft(row); setNote(""); }}>Edit</Button>
                          <Button disabled={!allow} onClick={() => remove(row.id)}>Delete</Button>
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
