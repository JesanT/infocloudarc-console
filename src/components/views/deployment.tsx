import { useState } from "react";
import { useConfirm } from "@/components/confirm";
import { Button, Empty, Field, Kpi, Panel, Select, Table, TableWrap, Td, Th, fieldClass } from "@/components/ui";
import { repoRoot, type DeployImage, type DeployRepository, type DeployTemplate, type ImageFormat, type RepoKind } from "@/lib/cloud/deploy";
import { canMutateSite, inScope, matches, siteLabel, siteOptions, type Instance, type SiteKey } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";

function named(name: string, id: string) {
  const next = (id || name).trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(next) ? next : "";
}

export function DeploymentView() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const repos = useCloud((s) => s.deployRepos).filter((item) => inScope(role, site, item.site));
  const images = useCloud((s) => s.deployImages).filter((item) => inScope(role, site, item.site));
  const templates = useCloud((s) => s.deployTemplates).filter((item) => inScope(role, site, item.site));
  const hypervisors = useCloud((s) => s.hypervisors).filter((item) => inScope(role, site, item.site));
  const ready = hypervisors.filter((item) => item.configRepoId || item.diskRepoId).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Repositories" value={String(repos.length)} hint="Local, mapped, or NAS" />
        <Kpi label="Images" value={String(images.length)} hint="Disk or install files" />
        <Kpi label="Templates" value={String(templates.length)} hint="CPU, memory, disk" />
        <Kpi label="VM folders" value={String(ready)} hint={`${hypervisors.length} hypervisors`} />
      </div>
      <Repositories />
      <Images />
      <Templates />
      <VmFolders />
    </div>
  );
}

function Repositories() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const rows = useCloud((s) => s.deployRepos);
  const save = useCloud((s) => s.saveDeployRepo);
  const remove = useCloud((s) => s.deleteDeployRepo);
  const flash = useCloud((s) => s.flash);
  const { ask, dialog } = useConfirm();
  const choices = siteOptions(role, site);
  const visible = rows.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.path, item.kind, item.address]));
  const [draft, setDraft] = useState<DeployRepository | null>(null);
  return (
    <>
      {dialog}
      <Panel
        title="Repositories"
        subtitle="A repository is where image files and VM disks live: a local disk, a disk mapped on the hypervisor, or a NAS export. Add one here before you add an image."
        action={canMutateSite(role, site, choices[0]) ? <Button variant="primary" onClick={() => setDraft({ id: "", name: "", site: choices[0], kind: "local", protocol: "path", address: "", path: "" })}>Add</Button> : undefined}
      >
        {draft && (
          <form className="mb-4 grid gap-3 md:grid-cols-3" onSubmit={(event) => {
            event.preventDefault();
            const id = named(draft.name, draft.id);
            if (!id) { flash("Use a short name with letters, numbers, dots, or dashes."); return; }
            const next = { ...draft, id, name: draft.name.trim() || id };
            const saveRow = () => { save(next); setDraft(null); };
            if (rows.some((item) => item.id === id)) {
              ask({ title: `Save changes to ${next.name}?`, body: "This updates the console path. Files already stored there are not moved.", confirmLabel: "Save", run: saveRow });
              return;
            }
            saveRow();
          }}>
            <Field label="Name"><input className={fieldClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field label="Site">
              <Select value={draft.site} onChange={(event) => setDraft({ ...draft, site: event.target.value as SiteKey })}>
                {choices.map((item) => <option key={item} value={item}>{siteLabel(item)}</option>)}
              </Select>
            </Field>
            <Field label="Kind">
              <Select value={draft.kind} onChange={(event) => {
                const kind = event.target.value as RepoKind;
                setDraft({ ...draft, kind, protocol: kind === "nas" ? "nfs" : "path" });
              }}>
                <option value="local">Local disk</option>
                <option value="mapped">Mapped disk</option>
                <option value="nas">NAS</option>
              </Select>
            </Field>
            {draft.kind === "nas" && (
              <Field label="Protocol">
                <Select value={draft.protocol} onChange={(event) => setDraft({ ...draft, protocol: event.target.value as DeployRepository["protocol"] })}>
                  <option value="nfs">NFS</option>
                  <option value="smb">SMB</option>
                </Select>
              </Field>
            )}
            {draft.kind === "nas" && <Field label="Address"><input className={fieldClass} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} placeholder="nas-01" /></Field>}
            <Field label="Path"><input className={fieldClass} value={draft.path} onChange={(event) => setDraft({ ...draft, path: event.target.value })} placeholder={draft.kind === "local" ? "C:/Hyper-V or /var/lib/libvirt/images" : "/export/vms"} /></Field>
            <div className="flex gap-2 md:col-span-3">
              <Button variant="primary" type="submit">Save</Button>
              <Button type="button" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </form>
        )}
        {visible.length === 0 ? <Empty>No repository in this view. Add a local disk, a mapped disk, or a NAS path.</Empty> : (
          <TableWrap>
            <Table>
              <thead><tr><Th>Name</Th><Th>Kind</Th><Th>Site</Th><Th>Location</Th><Th> </Th></tr></thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <Td>{row.name}</Td>
                    <Td>{row.kind === "nas" ? `NAS · ${row.protocol}` : row.kind === "mapped" ? "Mapped disk" : "Local disk"}</Td>
                    <Td>{siteLabel(row.site)}</Td>
                    <Td>{row.address ? `${row.address} ` : ""}{row.path}</Td>
                    <Td>
                      <div className="flex gap-2">
                        <Button disabled={!canMutateSite(role, site, row.site)} onClick={() => setDraft(row)}>Edit</Button>
                        <Button disabled={!canMutateSite(role, site, row.site)} variant="danger" onClick={() => ask({
                          title: `Delete ${row.name}?`,
                          body: "This removes the console record. Files on disk stay. A repository still used by an image or a hypervisor cannot be removed.",
                          confirmLabel: "Delete",
                          danger: true,
                          run: () => remove(row.id),
                        })}>Delete</Button>
                      </div>
                    </Td>
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

function Images() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const rows = useCloud((s) => s.deployImages);
  const repos = useCloud((s) => s.deployRepos);
  const save = useCloud((s) => s.saveDeployImage);
  const remove = useCloud((s) => s.deleteDeployImage);
  const flash = useCloud((s) => s.flash);
  const { ask, dialog } = useConfirm();
  const choices = siteOptions(role, site);
  const visible = rows.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.file, item.os, item.format]));
  const [draft, setDraft] = useState<DeployImage | null>(null);
  const repoName = (id: string) => repos.find((item) => item.id === id)?.name ?? "—";
  return (
    <>
      {dialog}
      <Panel
        title="Images"
        subtitle="An image is a file already in a repository: a VHDX, a qcow2, a raw disk, or an ISO. A template points at one image."
        action={canMutateSite(role, site, choices[0]) ? <Button variant="primary" onClick={() => setDraft({ id: "", name: "", site: choices[0], repositoryId: repos.find((item) => item.site === choices[0])?.id ?? repos[0]?.id ?? "", file: "", format: "vhdx", os: "Ubuntu 26.04", firmware: "uefi" })}>Add</Button> : undefined}
      >
        {draft && (
          <form className="mb-4 grid gap-3 md:grid-cols-3" onSubmit={(event) => {
            event.preventDefault();
            const id = named(draft.name, draft.id);
            if (!id || !draft.file.trim()) { flash("Name and file are required."); return; }
            const next = { ...draft, id, name: draft.name.trim() || id, file: draft.file.trim() };
            const saveRow = () => { save(next); setDraft(null); };
            if (rows.some((item) => item.id === id)) {
              ask({ title: `Save changes to ${next.name}?`, body: "This updates the console record. It does not copy or change the file.", confirmLabel: "Save", run: saveRow });
              return;
            }
            saveRow();
          }}>
            <Field label="Name"><input className={fieldClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field label="Site">
              <Select value={draft.site} onChange={(event) => setDraft({ ...draft, site: event.target.value as SiteKey })}>
                {choices.map((item) => <option key={item} value={item}>{siteLabel(item)}</option>)}
              </Select>
            </Field>
            <Field label="Repository">
              <Select value={draft.repositoryId} onChange={(event) => setDraft({ ...draft, repositoryId: event.target.value })}>
                {repos.filter((item) => inScope(role, site, item.site)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="File"><input className={fieldClass} value={draft.file} onChange={(event) => setDraft({ ...draft, file: event.target.value })} placeholder="ubuntu-26.04-minimal.vhdx" /></Field>
            <Field label="Format">
              <Select value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value as ImageFormat })}>
                <option value="vhdx">VHDX</option>
                <option value="qcow2">qcow2</option>
                <option value="raw">raw</option>
                <option value="iso">ISO</option>
              </Select>
            </Field>
            <Field label="Operating system"><input className={fieldClass} value={draft.os} onChange={(event) => setDraft({ ...draft, os: event.target.value })} /></Field>
            <Field label="Firmware">
              <Select value={draft.firmware} onChange={(event) => setDraft({ ...draft, firmware: event.target.value as DeployImage["firmware"] })}>
                <option value="uefi">UEFI</option>
                <option value="bios">BIOS</option>
              </Select>
            </Field>
            <div className="flex gap-2 md:col-span-3">
              <Button variant="primary" type="submit">Save</Button>
              <Button type="button" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </form>
        )}
        {visible.length === 0 ? <Empty>No image in this view. Add a repository first, then point an image at a file in it.</Empty> : (
          <TableWrap>
            <Table>
              <thead><tr><Th>Name</Th><Th>File</Th><Th>Repository</Th><Th>OS</Th><Th> </Th></tr></thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <Td>{row.name}</Td>
                    <Td>{row.file} · {row.format}</Td>
                    <Td>{repoName(row.repositoryId)}</Td>
                    <Td>{row.os} · {row.firmware}</Td>
                    <Td>
                      <div className="flex gap-2">
                        <Button disabled={!canMutateSite(role, site, row.site)} onClick={() => setDraft(row)}>Edit</Button>
                        <Button disabled={!canMutateSite(role, site, row.site)} variant="danger" onClick={() => ask({
                          title: `Delete ${row.name}?`,
                          body: "This removes the console record. The file stays in the repository. An image still used by a template cannot be removed.",
                          confirmLabel: "Delete",
                          danger: true,
                          run: () => remove(row.id),
                        })}>Delete</Button>
                      </div>
                    </Td>
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

function Templates() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const rows = useCloud((s) => s.deployTemplates);
  const images = useCloud((s) => s.deployImages);
  const save = useCloud((s) => s.saveDeployTemplate);
  const remove = useCloud((s) => s.deleteDeployTemplate);
  const flash = useCloud((s) => s.flash);
  const { ask, dialog } = useConfirm();
  const choices = siteOptions(role, site);
  const visible = rows.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.instanceKind]));
  const [draft, setDraft] = useState<DeployTemplate | null>(null);
  const imageName = (id: string) => images.find((item) => item.id === id)?.name ?? "—";
  return (
    <>
      {dialog}
      <Panel
        title="Templates"
        subtitle="A template is the shape of a new instance: image, CPU, memory, and disk size. Deploy uses a template plus the hypervisor storage folders."
        action={canMutateSite(role, site, choices[0]) ? <Button variant="primary" onClick={() => setDraft({ id: "", name: "", site: choices[0], imageId: images.find((item) => item.site === choices[0])?.id ?? images[0]?.id ?? "", instanceKind: "Compute", vcpu: 2, memoryMb: 4096, diskGb: 40 })}>Add</Button> : undefined}
      >
        {draft && (
          <form className="mb-4 grid gap-3 md:grid-cols-3" onSubmit={(event) => {
            event.preventDefault();
            const id = named(draft.name, draft.id);
            if (!id) { flash("Use a short name with letters, numbers, dots, or dashes."); return; }
            const next = { ...draft, id, name: draft.name.trim() || id };
            const saveRow = () => { save(next); setDraft(null); };
            if (rows.some((item) => item.id === id)) {
              ask({ title: `Save changes to ${next.name}?`, body: "This updates the template. Instances already deployed are not resized.", confirmLabel: "Save", run: saveRow });
              return;
            }
            saveRow();
          }}>
            <Field label="Name"><input className={fieldClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field label="Site">
              <Select value={draft.site} onChange={(event) => setDraft({ ...draft, site: event.target.value as SiteKey })}>
                {choices.map((item) => <option key={item} value={item}>{siteLabel(item)}</option>)}
              </Select>
            </Field>
            <Field label="Image">
              <Select value={draft.imageId} onChange={(event) => setDraft({ ...draft, imageId: event.target.value })}>
                {images.filter((item) => inScope(role, site, item.site)).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.format}</option>)}
              </Select>
            </Field>
            <Field label="Instance kind">
              <Select value={draft.instanceKind} onChange={(event) => setDraft({ ...draft, instanceKind: event.target.value as Instance["kind"] })}>
                <option>Compute</option>
                <option>Database</option>
                <option>Load Balancer</option>
                <option>Backup</option>
              </Select>
            </Field>
            <Field label="CPU"><input className={fieldClass} value={String(draft.vcpu)} onChange={(event) => setDraft({ ...draft, vcpu: Number(event.target.value) })} /></Field>
            <Field label="Memory MB"><input className={fieldClass} value={String(draft.memoryMb)} onChange={(event) => setDraft({ ...draft, memoryMb: Number(event.target.value) })} /></Field>
            <Field label="Disk GB"><input className={fieldClass} value={String(draft.diskGb)} onChange={(event) => setDraft({ ...draft, diskGb: Number(event.target.value) })} /></Field>
            <div className="flex gap-2 md:col-span-3">
              <Button variant="primary" type="submit">Save</Button>
              <Button type="button" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </form>
        )}
        {visible.length === 0 ? <Empty>No template in this view. Add an image first.</Empty> : (
          <TableWrap>
            <Table>
              <thead><tr><Th>Name</Th><Th>Image</Th><Th>Shape</Th><Th>Site</Th><Th> </Th></tr></thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <Td>{row.name}</Td>
                    <Td>{imageName(row.imageId)}</Td>
                    <Td>{row.instanceKind} · {row.vcpu} CPU · {row.memoryMb} MB · {row.diskGb} GB</Td>
                    <Td>{siteLabel(row.site)}</Td>
                    <Td>
                      <div className="flex gap-2">
                        <Button disabled={!canMutateSite(role, site, row.site)} onClick={() => setDraft(row)}>Edit</Button>
                        <Button disabled={!canMutateSite(role, site, row.site)} variant="danger" onClick={() => ask({
                          title: `Delete ${row.name}?`,
                          body: "This removes the template from the console. Deployed instances are not deleted.",
                          confirmLabel: "Delete",
                          danger: true,
                          run: () => remove(row.id),
                        })}>Delete</Button>
                      </div>
                    </Td>
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

function VmFolders() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const rows = useCloud((s) => s.hypervisors);
  const repos = useCloud((s) => s.deployRepos);
  const save = useCloud((s) => s.saveHypervisor);
  const flash = useCloud((s) => s.flash);
  const { ask, dialog } = useConfirm();
  const visible = rows.filter((item) => inScope(role, site, item.site) && matches(query, [item.name, item.kind, item.address]));
  const [draftId, setDraftId] = useState("");
  const draft = visible.find((item) => item.id === draftId) ?? rows.find((item) => item.id === draftId) ?? null;
  const [configRepoId, setConfigRepoId] = useState("");
  const [diskRepoId, setDiskRepoId] = useState("");
  const [swapRepoId, setSwapRepoId] = useState("");
  const repoChoices = repos.filter((item) => inScope(role, site, item.site));
  const label = (id: string) => {
    const repo = repos.find((item) => item.id === id);
    return repo ? `${repo.name} · ${repoRoot(repo)}` : "Not set";
  };
  return (
    <>
      {dialog}
      <Panel
        title="VM machine files and storage"
        subtitle="Each hypervisor chooses a repository for machine files, for virtual disks, and for swap. The same choices are on the hypervisor page. Changing them does not move files that already exist."
      >
        {draft && (
          <form className="mb-4 grid gap-3 md:grid-cols-3" onSubmit={(event) => {
            event.preventDefault();
            if (!canMutateSite(role, site, draft.site)) { flash("This access cannot change that hypervisor."); return; }
            const next = { ...draft, configRepoId, diskRepoId, swapRepoId };
            ask({
              title: `Save folders for ${draft.name}?`,
              body: "This updates where new virtual machines are written. Files already created are not moved.",
              confirmLabel: "Save",
              run: () => { save(next); setDraftId(""); },
            });
          }}>
            <Field label={`${draft.name} · machine files`}>
              <Select value={configRepoId} onChange={(event) => setConfigRepoId(event.target.value)}>
                <option value="">None</option>
                {repoChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="VM storage">
              <Select value={diskRepoId} onChange={(event) => setDiskRepoId(event.target.value)}>
                <option value="">None</option>
                {repoChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label="Swap files">
              <Select value={swapRepoId} onChange={(event) => setSwapRepoId(event.target.value)}>
                <option value="">None</option>
                {repoChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <div className="flex gap-2 md:col-span-3">
              <Button variant="primary" type="submit">Save</Button>
              <Button type="button" onClick={() => setDraftId("")}>Cancel</Button>
            </div>
          </form>
        )}
        {visible.length === 0 ? <Empty>No hypervisor in this view. Add one under Hypervisors.</Empty> : (
          <TableWrap>
            <Table>
              <thead><tr><Th>Hypervisor</Th><Th>Machine files</Th><Th>VM storage</Th><Th>Swap</Th><Th> </Th></tr></thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <Td>{row.name}</Td>
                    <Td>{label(row.configRepoId)}</Td>
                    <Td>{label(row.diskRepoId)}</Td>
                    <Td>{label(row.swapRepoId)}</Td>
                    <Td>
                      <Button disabled={!canMutateSite(role, site, row.site)} onClick={() => {
                        setDraftId(row.id);
                        setConfigRepoId(row.configRepoId);
                        setDiskRepoId(row.diskRepoId);
                        setSwapRepoId(row.swapRepoId);
                      }}>Edit</Button>
                    </Td>
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
