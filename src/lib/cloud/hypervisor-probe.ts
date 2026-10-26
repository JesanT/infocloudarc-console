import { createServerFn } from "@tanstack/react-start";
import { addressOk, passwordOk } from "@/lib/cloud/hypervisor";

export const checkHypervisor = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = input as { kind?: unknown; address?: unknown; port?: unknown; transport?: unknown; login?: unknown; password?: unknown };
    const kind = body?.kind === "libvirt" ? "libvirt" as const : body?.kind === "hyper-v" ? "hyper-v" as const : null;
    const address = typeof body?.address === "string" ? body.address.trim() : "";
    const port = typeof body?.port === "number" ? body.port : Number(body?.port);
    const transport = body?.transport === "ssh" ? "ssh" as const : body?.transport === "tls" ? "tls" as const : body?.transport === "winrm" ? "winrm" as const : null;
    const login = typeof body?.login === "string" ? body.login.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!kind) throw new Error("Choose Hyper-V or Libvirt.");
    if (!addressOk(address)) throw new Error("Address is not valid.");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port is not valid.");
    if (!transport) throw new Error("Transport is not valid.");
    if (login && !/^[A-Za-z0-9._-]{1,32}$/.test(login)) throw new Error("Login is not valid.");
    if (!passwordOk(password)) throw new Error("Password is not valid.");
    if (password && !login) throw new Error("A password needs a login.");
    return { kind, address, port, transport, login, password };
  })
  .handler(async ({ data }) => {
    const { checkHypervisorHost } = await import("./hypervisor-probe.server");
    return checkHypervisorHost(data);
  });
