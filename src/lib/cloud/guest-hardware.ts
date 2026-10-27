import { createServerFn } from "@tanstack/react-start";
import { pathOk } from "@/lib/cloud/deploy";
import { addressOk, passwordOk } from "@/lib/cloud/hypervisor";
import type { GuestView } from "@/lib/cloud/hardware";
import type { HardwareOp } from "@/lib/cloud/hardware.server";

const OPS = ["inspect", "cpu", "memory", "add-disk", "grow-disk", "add-cd", "eject-cd", "add-nic", "remove-nic"] as const;

function connection(input: unknown) {
  const body = input as Record<string, unknown>;
  const kind = body?.kind === "libvirt" ? "libvirt" as const : body?.kind === "hyper-v" ? "hyper-v" as const : null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const port = Number(body?.port);
  const login = typeof body?.login === "string" ? body.login.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const diskPath = typeof body?.diskPath === "string" ? body.diskPath.trim() : "";
  const switchName = typeof body?.switchName === "string" ? body.switchName.trim() : "";
  if (!kind) throw new Error("Choose a hypervisor.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) throw new Error("Instance name is not valid.");
  if (!addressOk(address)) throw new Error("Hypervisor address is not valid.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port is not valid.");
  if (login && !/^[A-Za-z0-9._-]{1,32}$/.test(login)) throw new Error("Login is not valid.");
  if (!passwordOk(password)) throw new Error("Password is not valid.");
  if (password && !login) throw new Error("A password needs a login.");
  if (diskPath && !pathOk(diskPath)) throw new Error("A storage path is not valid.");
  return { kind, name, address, port, login, password, diskPath, switchName };
}

function changeOf(body: Record<string, unknown>): HardwareOp {
  const op = OPS.find((item) => item === body.op);
  if (!op) throw new Error("Unknown hardware action.");
  const vcpu = Number(body.vcpu);
  const memoryMb = Number(body.memoryMb);
  const diskGb = Number(body.diskGb);
  const target = typeof body.target === "string" ? body.target.trim() : "";
  const isoPath = typeof body.isoPath === "string" ? body.isoPath.trim() : "";
  const bridge = typeof body.bridge === "string" ? body.bridge.trim() : "";
  const mac = typeof body.mac === "string" ? body.mac.trim() : "";
  if (op === "inspect") return { op };
  if (op === "cpu") {
    if (!Number.isInteger(vcpu) || vcpu < 1 || vcpu > 128) throw new Error("Processor count is not valid.");
    return { op, vcpu };
  }
  if (op === "memory") {
    if (!Number.isInteger(memoryMb) || memoryMb < 256 || memoryMb > 1048576) throw new Error("Memory is not valid.");
    return { op, memoryMb };
  }
  if (op === "add-disk") {
    if (!Number.isInteger(diskGb) || diskGb < 1 || diskGb > 65536) throw new Error("Disk size is not valid.");
    return { op, diskGb };
  }
  if (op === "grow-disk") {
    if (!target || target.length > 260 || /["'`$;&|<>\n\r]/.test(target) || target.includes("..")) throw new Error("Choose a disk.");
    if (!Number.isInteger(diskGb) || diskGb < 1 || diskGb > 65536) throw new Error("Disk size is not valid.");
    return { op, target, diskGb };
  }
  if (op === "add-cd") {
    if (!pathOk(isoPath)) throw new Error("The ISO path is not valid.");
    return { op, isoPath };
  }
  if (op === "eject-cd") {
    if (!/^[A-Za-z]{1,8}[0-9]{0,2}$/.test(target)) throw new Error("Choose a CD drive.");
    return { op, target };
  }
  if (op === "add-nic") {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(bridge)) throw new Error("The bridge or switch name is not valid.");
    return { op, bridge };
  }
  if (!/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(mac) && !/^[0-9a-fA-F]{12}$/.test(mac)) throw new Error("The network card was not found.");
  return { op: "remove-nic", mac };
}

export const guestHardware = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = input as Record<string, unknown>;
    return { ...connection(input), change: changeOf(body) };
  })
  .handler(async ({ data }): Promise<{ ok: boolean; message: string; hardware: GuestView | null }> => {
    const { runHardware } = await import("./hardware.server");
    return runHardware(data);
  });

export const guestConsole = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = input as Record<string, unknown>;
    const action = body?.action === "open" || body?.action === "read" || body?.action === "write" || body?.action === "close" ? body.action : null;
    if (!action) throw new Error("Unknown console action.");
    const id = typeof body?.id === "string" ? body.id : "";
    const text = typeof body?.text === "string" ? body.text.slice(0, 200) : "";
    const offset = Number(body?.offset);
    if (action !== "open") {
      if (!/^[0-9a-f]{32}$/.test(id)) throw new Error("That console is not open.");
      return { action, id, text, offset: Number.isFinite(offset) ? offset : 0, name: "", address: "", port: 0, login: "", password: "" };
    }
    const link = connection(input);
    if (link.kind !== "libvirt") throw new Error("A serial console is available for libvirt guests. Hyper-V does not expose one to this console.");
    return { action, id: "", text: "", offset: 0, ...link };
  })
  .handler(async ({ data }) => {
    const session = await import("./console.server");
    if (data.action === "open") {
      const opened = await session.openConsole({ name: data.name, address: data.address, port: data.port, login: data.login, password: data.password });
      return { ok: opened.ok, id: opened.id, message: opened.message, text: "", next: 0, closed: !opened.ok };
    }
    if (data.action === "read") {
      const read = session.readConsole(data.id, data.offset);
      return { ok: read.ok, id: data.id, message: "", text: read.text, next: read.next, closed: read.closed };
    }
    if (data.action === "write") {
      const wrote = session.writeConsole(data.id, data.text);
      return { ok: wrote.ok, id: data.id, message: "", text: "", next: data.offset, closed: !wrote.ok };
    }
    session.closeConsole(data.id);
    return { ok: true, id: data.id, message: "", text: "", next: 0, closed: true };
  });
