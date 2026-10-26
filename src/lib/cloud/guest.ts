import { createServerFn } from "@tanstack/react-start";
import { addressOk, passwordOk } from "@/lib/cloud/hypervisor";
import { pathOk, type ImageFormat } from "@/lib/cloud/deploy";

const ACTIONS = ["deploy", "stop", "restart", "shutdown"] as const;
const FORMATS = ["qcow2", "vhdx", "raw", "iso"] as const;

export const guestAction = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const body = input as Record<string, unknown>;
    const action = ACTIONS.find((item) => item === body?.action);
    const kind = body?.kind === "libvirt" ? "libvirt" as const : body?.kind === "hyper-v" ? "hyper-v" as const : null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const address = typeof body?.address === "string" ? body.address.trim() : "";
    const port = typeof body?.port === "number" ? body.port : Number(body?.port);
    const login = typeof body?.login === "string" ? body.login.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const memoryMb = Number(body?.memoryMb);
    const vcpu = Number(body?.vcpu);
    const diskGb = Number(body?.diskGb);
    const switchName = typeof body?.switchName === "string" ? body.switchName.trim() : "";
    const configPath = typeof body?.configPath === "string" ? body.configPath.trim() : "";
    const diskPath = typeof body?.diskPath === "string" ? body.diskPath.trim() : "";
    const imagePath = typeof body?.imagePath === "string" ? body.imagePath.trim() : "";
    const format = FORMATS.find((item) => item === body?.format) ?? "qcow2";
    if (!action) throw new Error("Unknown action.");
    if (!kind) throw new Error("Choose a hypervisor.");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) throw new Error("Instance name is not valid.");
    if (!addressOk(address)) throw new Error("Hypervisor address is not valid.");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port is not valid.");
    if (login && !/^[A-Za-z0-9._-]{1,32}$/.test(login)) throw new Error("Login is not valid.");
    if (!passwordOk(password)) throw new Error("Password is not valid.");
    if (password && !login) throw new Error("A password needs a login.");
    if (body?.role !== "vendor" && action === "deploy") throw new Error("Only vendor access can deploy instances.");
    for (const file of [configPath, diskPath, imagePath]) {
      if (file && !pathOk(file)) throw new Error("A storage path is not valid.");
    }
    return {
      action,
      kind,
      name,
      address,
      port,
      login,
      password,
      memoryMb: Number.isInteger(memoryMb) && memoryMb >= 256 && memoryMb <= 1048576 ? memoryMb : 2048,
      vcpu: Number.isInteger(vcpu) && vcpu >= 1 && vcpu <= 128 ? vcpu : 2,
      diskGb: Number.isInteger(diskGb) && diskGb >= 1 && diskGb <= 65536 ? diskGb : 40,
      switchName,
      configPath,
      diskPath,
      imagePath,
      format: format as ImageFormat,
    };
  })
  .handler(async ({ data }) => {
    const { runGuest } = await import("./deploy.server");
    return runGuest(data);
  });
