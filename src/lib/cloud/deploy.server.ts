import { spawn } from "node:child_process";
import { pathOk, type ImageFormat } from "@/lib/cloud/deploy";
import type { HypervisorKind } from "@/lib/cloud/hypervisor";
import { runHyperv } from "@/lib/cloud/hyperv.server";

export type GuestRequest = {
  action: "deploy" | "stop" | "restart" | "shutdown";
  kind: HypervisorKind;
  name: string;
  address: string;
  port: number;
  login: string;
  memoryMb: number;
  vcpu: number;
  diskGb: number;
  switchName: string;
  configPath: string;
  diskPath: string;
  imagePath: string;
  format: ImageFormat;
};

export type GuestResult = { ok: boolean; fallback: boolean; message: string };

function which(bin: string) {
  return new Promise<string | null>((resolve) => {
    const child = spawn("which", [bin], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? out.trim() || bin : null));
  });
}

function run(command: string, args: string[], ms = 20000) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), ms);
    child.stdout.on("data", (chunk) => {
      if (out.length < 4000) out += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (err.length < 4000) err += String(chunk);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 127, out, err: err || "command not found" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

function token(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
}

async function runLibvirt(input: GuestRequest): Promise<GuestResult> {
  const ssh = await which("ssh");
  if (!ssh) {
    return { ok: false, fallback: true, message: "The ssh client is not installed on the console. The instance was recorded locally and was not created on the hypervisor." };
  }
  for (const file of [input.configPath, input.diskPath, input.imagePath]) {
    if (file && !pathOk(file)) return { ok: false, fallback: false, message: "A storage path is not valid." };
    if (file && /\s/.test(file)) return { ok: false, fallback: false, message: "Libvirt paths cannot contain spaces." };
  }
  if (input.switchName && !token(input.switchName)) return { ok: false, fallback: false, message: "The bridge name is not valid." };
  const target = `${input.login || "root"}@${input.address}`;
  let remote = `virsh -c qemu:///system destroy ${input.name}`;
  if (input.action === "shutdown") remote = `virsh -c qemu:///system shutdown ${input.name}`;
  if (input.action === "restart") remote = `virsh -c qemu:///system reboot ${input.name}`;
  if (input.action === "deploy") {
    const format = input.format === "vhdx" || input.format === "iso" ? "qcow2" : input.format;
    const disk = input.diskPath;
    if (!disk) return { ok: false, fallback: false, message: "This hypervisor has no disk repository, so the instance was not created." };
    const bridge = input.switchName || "br0";
    const create = input.imagePath && input.format === "qcow2"
      ? `qemu-img create -f qcow2 -b ${input.imagePath} -F qcow2 ${disk}`
      : `qemu-img create -f ${format} ${disk} ${input.diskGb}G`;
    remote = `${create} && virt-install --name ${input.name} --memory ${input.memoryMb} --vcpus ${input.vcpu} --disk path=${disk},format=${format} --network bridge=${bridge} --import --osinfo detect=on,require=off --noautoconsole`;
  }
  const result = await run(ssh, ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=8", "-p", String(input.port || 22), target, remote]);
  const text = `${result.out}\n${result.err}`.trim();
  if (/permission denied|authentication/i.test(text)) {
    return { ok: false, fallback: false, message: "SSH refused the login. Nothing was created. Put the console key on this hypervisor." };
  }
  if (result.code !== 0) {
    const reason = text.split("\n").filter(Boolean).at(-1) || "The hypervisor refused the command.";
    return { ok: false, fallback: false, message: reason.slice(0, 400) };
  }
  return { ok: true, fallback: false, message: text.split("\n").filter(Boolean).at(-1) || "Libvirt accepted the action." };
}

export async function runGuest(input: GuestRequest): Promise<GuestResult> {
  if (!token(input.name)) return { ok: false, fallback: false, message: "Instance name is not valid." };
  if (input.kind === "libvirt") return runLibvirt(input);
  const result = await runHyperv({
    action: input.action,
    name: input.name,
    computer: input.address,
    memoryMb: input.memoryMb,
    switchName: input.switchName,
    configPath: input.configPath,
    diskPath: input.diskPath,
    imagePath: input.format === "vhdx" ? input.imagePath : "",
    diskGb: input.diskGb,
  });
  return { ok: result.ok, fallback: result.fallback, message: result.message };
}
