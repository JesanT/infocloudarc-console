import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/confirm";
import { Button, Empty, Field, Panel, Select, Table, TableWrap, Td, Th, fieldClass } from "@/components/ui";
import { repoRoot } from "@/lib/cloud/deploy";
import { guestConsole, guestHardware } from "@/lib/cloud/guest-hardware";
import { formatBytes, formatMac, type GuestView } from "@/lib/cloud/hardware";
import { canMutateSite, type Instance } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";

function linkOf(vm: Instance) {
  return {
    kind: "libvirt" as const,
    name: vm.name,
    address: "",
    port: 22,
    login: "",
    password: "",
    diskPath: vm.diskPath ?? "",
    switchName: "",
  };
}

export function InstanceHardware({ vm }: { vm: Instance }) {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const hypervisors = useCloud((s) => s.hypervisors);
  const images = useCloud((s) => s.deployImages);
  const repos = useCloud((s) => s.deployRepos);
  const flash = useCloud((s) => s.flash);
  const remember = useCloud((s) => s.setInstanceAddress);
  const { ask, dialog } = useConfirm();
  const hv = hypervisors.find((item) => item.id === vm.hypervisorId) ?? null;
  const allow = Boolean(hv) && canMutateSite(role, site, vm.site);
  const [view, setView] = useState<GuestView | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [vcpu, setVcpu] = useState("1");
  const [memory, setMemory] = useState("2048");
  const [diskGb, setDiskGb] = useState("10");
  const [growTarget, setGrowTarget] = useState("");
  const [growGb, setGrowGb] = useState("25");
  const [iso, setIso] = useState("");
  const [bridge, setBridge] = useState("");
  const [consoleText, setConsoleText] = useState("");
  const [consoleId, setConsoleId] = useState("");
  const screen = useRef<HTMLPreElement>(null);
  const isos = images.filter((item) => item.format === "iso");

  function payload() {
    return {
      kind: hv?.kind ?? linkOf(vm).kind,
      name: vm.name,
      address: hv?.address ?? "",
      port: hv?.port ?? 22,
      login: hv?.login ?? "",
      password: hv?.password || "",
      diskPath: vm.diskPath ?? "",
      switchName: hv?.switchName ?? "",
    };
  }

  async function load() {
    if (!hv) {
      setNote("This instance is not linked to a hypervisor.");
      return;
    }
    setBusy("read");
    try {
      const result = await guestHardware({ data: { ...payload(), op: "inspect" } });
      setNote(result.message);
      if (result.hardware) {
        setView(result.hardware);
        setVcpu(String(result.hardware.vcpu || 1));
        setMemory(String(result.hardware.memoryMb || 2048));
        const disk = result.hardware.disks.find((item) => item.device === "disk");
        if (disk) setGrowTarget(hv.kind === "hyper-v" ? disk.path : disk.target);
        const found = result.hardware.nics.map((item) => item.address).find(Boolean);
        if (found) remember(vm.id, found);
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The hypervisor did not answer.");
    } finally {
      setBusy("");
    }
  }

  async function change(data: Record<string, string | number>, label: string) {
    if (!hv || !allow) {
      flash("This access cannot change that virtual machine.");
      return;
    }
    setBusy(label);
    try {
      const result = await guestHardware({ data: { ...payload(), ...data } });
      setNote(result.message);
      flash(result.message);
      if (result.hardware) setView(result.hardware);
      else await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "The change failed.";
      setNote(message);
      flash(message);
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    setView(null);
    setNote("");
    setConsoleText("");
    setBridge(hv?.switchName ?? "");
  }, [vm.id, hv?.switchName]);

  useEffect(() => {
    if (!consoleId) return;
    let stop = false;
    let offset = 0;
    const timer = setInterval(() => {
      void guestConsole({ data: { action: "read", id: consoleId, offset } }).then((result) => {
        if (stop || !result || !("text" in result)) return;
        if (result.text) {
          offset = result.next;
          setConsoleText((current) => (current + result.text).slice(-80000));
          screen.current?.scrollTo(0, screen.current.scrollHeight);
        }
        if (result.closed) setConsoleId("");
      }).catch(() => undefined);
    }, 500);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [consoleId]);

  useEffect(() => {
    return () => {
      if (consoleId) void guestConsole({ data: { action: "close", id: consoleId } });
    };
  }, [consoleId]);

  async function openConsole() {
    if (!hv || hv.kind !== "libvirt") return;
    setBusy("console");
    try {
      const result = await guestConsole({ data: { action: "open", ...payload() } });
      if (!result || !("id" in result) || !result.ok || !result.id) {
        setNote("message" in result ? result.message : "The console did not open.");
        return;
      }
      setConsoleId(result.id);
      setConsoleText("");
      setNote(result.message);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The console did not open.");
    } finally {
      setBusy("");
    }
  }

  function sendKey(key: string) {
    if (!consoleId || !key) return;
    void guestConsole({ data: { action: "write", id: consoleId, text: key } });
  }

  const disks = view?.disks.filter((item) => item.device === "disk") ?? [];
  const cds = view?.disks.filter((item) => item.device === "cdrom") ?? [];

  return (
    <div className="space-y-4">
      {dialog}
      <Panel
        title={vm.name}
        subtitle="Read from the hypervisor. An address is shown only when the hypervisor reports one. Nothing is measured inside the guest unless a guest agent answers."
        action={<Button variant="primary" disabled={!hv || busy === "read"} onClick={() => void load()}>{busy === "read" ? "Reading…" : "Refresh"}</Button>}
      >
        {!hv ? <Empty>This instance is not linked to a hypervisor.</Empty> : !view ? (
          <p className="text-sm text-muted">{note || "Refresh to read processors, memory, disks, and network cards."}</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink">{view.state || "Unknown"} · {view.vcpu} CPU · {view.memoryMb} MB · {hv.name}</p>
            {note && <p className="text-sm text-muted">{note}</p>}
            <div>
              <h3 className="mb-2 text-sm font-medium">Disks</h3>
              {disks.length === 0 ? <Empty>No disks reported.</Empty> : (
                <TableWrap>
                  <Table>
                    <thead><tr><Th>Target</Th><Th>Path</Th><Th>Size</Th></tr></thead>
                    <tbody>
                      {disks.map((disk) => (
                        <tr key={disk.target + disk.path}>
                          <Td>{disk.target}</Td>
                          <Td>{disk.path || "—"}</Td>
                          <Td>{formatBytes(disk.bytes)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">CD / ISO</h3>
              {cds.length === 0 ? <p className="text-sm text-muted">No CD drive is attached.</p> : (
                <TableWrap>
                  <Table>
                    <thead><tr><Th>Target</Th><Th>ISO</Th><Th> </Th></tr></thead>
                    <tbody>
                      {cds.map((disk) => (
                        <tr key={disk.target}>
                          <Td>{disk.target}</Td>
                          <Td>{disk.path || "Empty"}</Td>
                          <Td>
                            <Button disabled={!allow || busy === "eject"} onClick={() => ask({
                              title: `Eject ${disk.target}?`,
                              body: "This removes the ISO from the virtual drive. The file stays on the hypervisor.",
                              confirmLabel: "Eject",
                              danger: true,
                              run: () => void change({ op: "eject-cd", target: disk.target }, "eject"),
                            })}>Eject</Button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Network</h3>
              {view.nics.length === 0 ? <Empty>No network card reported.</Empty> : (
                <TableWrap>
                  <Table>
                    <thead><tr><Th>MAC</Th><Th>Bridge / switch</Th><Th>Address</Th><Th> </Th></tr></thead>
                    <tbody>
                      {view.nics.map((nic) => (
                        <tr key={nic.mac}>
                          <Td>{formatMac(nic.mac)}</Td>
                          <Td>{nic.source || "—"} · {nic.model}</Td>
                          <Td>{nic.address || "Not reported"}</Td>
                          <Td>
                            <Button disabled={!allow || busy === "nic-remove"} onClick={() => ask({
                              title: "Remove this network card?",
                              body: "The guest loses this interface. The bridge itself is not deleted.",
                              confirmLabel: "Remove",
                              danger: true,
                              run: () => void change({ op: "remove-nic", mac: nic.mac }, "nic-remove"),
                            })}>Remove</Button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Hardware" subtitle="Changes are sent to the hypervisor. Growing a disk also tries to grow the filesystem. That succeeds only when the guest is shut down, or when its guest agent answers. A new disk is empty until the guest formats it.">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Processors">
            <input className={fieldClass} value={vcpu} onChange={(event) => setVcpu(event.target.value)} />
          </Field>
          <Field label="Memory MB">
            <input className={fieldClass} value={memory} onChange={(event) => setMemory(event.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button disabled={!allow || busy === "shape"} onClick={() => ask({
              title: `Change processors and memory on ${vm.name}?`,
              body: "The guest may need a restart before it uses a higher maximum.",
              confirmLabel: "Apply",
              run: () => {
                void (async () => {
                  await change({ op: "cpu", vcpu: Number(vcpu) }, "shape");
                  await change({ op: "memory", memoryMb: Number(memory) }, "shape");
                })();
              },
            })}>Apply shape</Button>
          </div>
          <Field label="New empty disk GB">
            <input className={fieldClass} value={diskGb} onChange={(event) => setDiskGb(event.target.value)} />
          </Field>
          <div className="flex items-end md:col-span-2">
            <Button disabled={!allow || busy === "add-disk"} onClick={() => ask({
              title: `Add a ${diskGb} GB disk to ${vm.name}?`,
              body: "The file is created beside the current virtual disk and attached. The guest must format it.",
              confirmLabel: "Add disk",
              run: () => void change({ op: "add-disk", diskGb: Number(diskGb) }, "add-disk"),
            })}>Add disk</Button>
          </div>
          <Field label="Disk to grow">
            <Select value={growTarget} onChange={(event) => setGrowTarget(event.target.value)}>
              <option value="">Choose</option>
              {disks.map((disk) => (
                <option key={disk.target + disk.path} value={hv?.kind === "hyper-v" ? disk.path : disk.target}>
                  {disk.target} · {formatBytes(disk.bytes)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="New size GB">
            <input className={fieldClass} value={growGb} onChange={(event) => setGrowGb(event.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button disabled={!allow || !growTarget || busy === "grow"} onClick={() => ask({
              title: `Grow this disk to ${growGb} GB?`,
              body: "The virtual disk is enlarged. The filesystem is grown only if the guest is off or its agent answers. The new size must be larger than the disk is now.",
              confirmLabel: "Grow",
              run: () => void change({ op: "grow-disk", target: growTarget, diskGb: Number(growGb) }, "grow"),
            })}>Grow disk</Button>
          </div>
          <Field label="ISO path on the hypervisor">
            <input className={fieldClass} value={iso} onChange={(event) => setIso(event.target.value)} placeholder="/vdisk/repo/images/install.iso" />
          </Field>
          <Field label="Registered ISO">
            <Select value="" onChange={(event) => {
              const image = isos.find((item) => item.id === event.target.value);
              const repo = repos.find((item) => item.id === image?.repositoryId);
              if (image && repo) setIso(`${repoRoot(repo).replace(/\/$/, "")}/${image.file.replace(/^\//, "")}`);
            }}>
              <option value="">None</option>
              {isos.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button disabled={!allow || !iso || busy === "cd"} onClick={() => void change({ op: "add-cd", isoPath: iso }, "cd")}>Attach ISO</Button>
          </div>
          <Field label="Bridge or switch">
            <input className={fieldClass} value={bridge} onChange={(event) => setBridge(event.target.value)} />
          </Field>
          <div className="flex items-end md:col-span-2">
            <Button disabled={!allow || !bridge || busy === "nic-add"} onClick={() => void change({ op: "add-nic", bridge }, "nic-add")}>Add network card</Button>
          </div>
        </div>
      </Panel>

      <Panel title="Console" subtitle={hv?.kind === "hyper-v" ? "Hyper-V does not give this console a serial session. Use the address once the hypervisor reports one." : "Libvirt serial console. Keys are sent to the guest. A cloud image shows a login only if its serial port has a getty."}>
        {hv?.kind !== "libvirt" ? <Empty>No serial console for this hypervisor.</Empty> : (
          <div className="space-y-2">
            <div className="flex gap-2">
              {!consoleId ? (
                <Button variant="primary" disabled={busy === "console"} onClick={() => void openConsole()}>{busy === "console" ? "Opening…" : "Open console"}</Button>
              ) : (
                <Button onClick={() => { void guestConsole({ data: { action: "close", id: consoleId } }); setConsoleId(""); }}>Close console</Button>
              )}
            </div>
            <pre
              ref={screen}
              tabIndex={0}
              className="h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-zinc-950 p-3 font-mono text-xs text-zinc-100 outline-none"
              onKeyDown={(event) => {
                if (!consoleId) return;
                if (event.key === "Enter") { event.preventDefault(); sendKey("\n"); return; }
                if (event.key === "Backspace") { event.preventDefault(); sendKey("\u007f"); return; }
                if (event.key === "Tab") { event.preventDefault(); sendKey("\t"); return; }
                if (event.ctrlKey && event.key === "c") { event.preventDefault(); sendKey("\u0003"); return; }
                if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) { event.preventDefault(); sendKey(event.key); }
              }}
            >{consoleText || "Open the console, then click here and type."}</pre>
          </div>
        )}
      </Panel>
    </div>
  );
}
