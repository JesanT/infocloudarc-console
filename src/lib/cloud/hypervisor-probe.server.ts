import { spawn } from "node:child_process";
import net from "node:net";
import type { HypervisorKind, HypervisorStatus, HypervisorTransport } from "@/lib/cloud/hypervisor";

export type HypervisorCheck =
  | { ok: true; status: HypervisorStatus; detail: string }
  | { ok: false; message: string };

function probeTcp(host: string, port: number): Promise<"open" | "refused" | "timeout" | "unreachable"> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve("timeout");
    }, 5000);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve("open");
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      socket.destroy();
      if (error.code === "ECONNREFUSED") resolve("refused");
      else if (error.code === "ETIMEDOUT") resolve("timeout");
      else resolve("unreachable");
    });
  });
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, ms = 12000) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, ms);
    child.stdout.on("data", (chunk) => {
      if (out.length < 8000) out += String(chunk);
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

function libvirtSummary(text: string) {
  const version = text.match(/Running hypervisor:\s*(.+)/i)?.[1]?.trim();
  const cpus = text.match(/CPU\(s\):\s*(\d+)/)?.[1];
  const memory = text.match(/Memory size:\s*([0-9]+\s*\w+)/i)?.[1];
  const guests = text.split("---").pop()?.split("\n").filter((line) => /^\s*\d+\s+\S+/.test(line)).length;
  const parts = [version, cpus ? `${cpus} CPUs` : "", memory, guests != null ? `${guests} guests` : ""].filter(Boolean);
  return parts.join(" · ");
}

async function checkLibvirtSsh(address: string, port: number, login: string): Promise<HypervisorCheck> {
  const ssh = await which("ssh");
  if (!ssh) {
    return { ok: true, status: "Online", detail: "The SSH port accepted a connection. The ssh client is not installed on the console, so virsh was not run." };
  }
  const target = `${login || "root"}@${address}`;
  const remote = "virsh -c qemu:///system version; echo ---; virsh -c qemu:///system nodeinfo; echo ---; virsh -c qemu:///system list --all";
  const result = await run(ssh, ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=8", "-p", String(port), target, remote], process.env);
  const text = `${result.out}\n${result.err}`;
  if (/permission denied|authentication|auth fail/i.test(text)) {
    return { ok: false, message: "SSH refused the login. Nothing was changed. Put the console key on this hypervisor for that user. A missing key is not downtime." };
  }
  if (result.code !== 0 && /not found|No such file/i.test(text)) {
    return { ok: true, status: "Degraded", detail: "SSH connected, but virsh is not installed on the hypervisor." };
  }
  if (result.code !== 0) {
    return { ok: false, message: "SSH did not return libvirt details. Nothing was changed. A firewall or a host key prompt can look the same as a stopped hypervisor." };
  }
  const summary = libvirtSummary(result.out);
  return { ok: true, status: "Online", detail: summary || "Libvirt answered on the hypervisor." };
}

async function checkWinrm(address: string, port: number): Promise<HypervisorCheck> {
  const pwsh = await which("pwsh");
  if (!pwsh) {
    return { ok: true, status: "Online", detail: "The WinRM port accepted a connection. PowerShell is not installed on the console, so the host was not asked further." };
  }
  const result = await run(
    pwsh,
    ["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; if ($env:HV_PORT -eq '5986') { Test-WSMan -ComputerName $env:HV_HOST -Port 5986 -UseSSL | Out-String } else { Test-WSMan -ComputerName $env:HV_HOST -Port ([int]$env:HV_PORT) | Out-String }"],
    { ...process.env, HV_HOST: address, HV_PORT: String(port) },
  );
  if (result.code !== 0) {
    const reason = (result.err || result.out).trim().split("\n").at(-1) || "Test-WSMan failed";
    return { ok: true, status: "Degraded", detail: `The WinRM port is open, but the host did not answer Test-WSMan. ${reason}`.slice(0, 400) };
  }
  return { ok: true, status: "Online", detail: "WinRM answered Test-WSMan." };
}

export async function checkHypervisorHost(input: {
  kind: HypervisorKind;
  address: string;
  port: number;
  transport: HypervisorTransport;
  login: string;
}): Promise<HypervisorCheck> {
  const tcp = await probeTcp(input.address, input.port);
  if (tcp === "refused") {
    return { ok: true, status: "Offline", detail: "The management port refused the connection." };
  }
  if (tcp === "timeout") {
    return { ok: false, message: "No response before the timeout. Nothing was changed, because a firewall can look the same as a stopped hypervisor." };
  }
  if (tcp === "unreachable") {
    return { ok: false, message: "The address could not be reached. Nothing was changed." };
  }
  if (input.kind === "libvirt" && input.transport === "ssh") return checkLibvirtSsh(input.address, input.port, input.login);
  if (input.kind === "libvirt" && input.transport === "tls") {
    return { ok: true, status: "Online", detail: "The TLS port accepted a connection. The console does not present a client certificate, so libvirt was not queried." };
  }
  if (input.kind === "hyper-v") return checkWinrm(input.address, input.port);
  return { ok: true, status: "Online", detail: "The management port accepted a connection." };
}
