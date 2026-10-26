import { spawn } from "node:child_process";

const NAME_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HOST_OK = /^[A-Za-z0-9][A-Za-z0-9.-]{0,253}$/;

const SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$name = $env:HV_NAME
$computer = $env:HV_COMPUTER
$memory = 2048
if ($env:HV_MEMORY) { $memory = [int]$env:HV_MEMORY }
$action = $env:HV_ACTION
if ($action -eq 'probe') {
  Write-Output ("pwsh " + $PSVersionTable.PSVersion.ToString())
  exit 0
}
if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) {
  throw 'Hyper-V module is not available on this server.'
}
switch ($action) {
  'stop' {
    if ($computer) { Stop-VM -Name $name -ComputerName $computer -TurnOff -Force }
    else { Stop-VM -Name $name -TurnOff -Force }
  }
  'shutdown' {
    if ($computer) { Stop-VM -Name $name -ComputerName $computer -Force }
    else { Stop-VM -Name $name -Force }
  }
  'restart' {
    if ($computer) { Restart-VM -Name $name -ComputerName $computer -Force }
    else { Restart-VM -Name $name -Force }
  }
  'deploy' {
    $bytes = $memory * 1MB
    if ($computer) { New-VM -Name $name -ComputerName $computer -Generation 2 -MemoryStartupBytes $bytes | Start-VM }
    else { New-VM -Name $name -Generation 2 -MemoryStartupBytes $bytes | Start-VM }
  }
  default { throw 'Unknown action' }
}
Write-Output 'ok'
`;

export type HypervResult = {
  ok: boolean;
  fallback: boolean;
  message: string;
};

export async function runHyperv(input: {
  action: "probe" | "stop" | "restart" | "shutdown" | "deploy";
  name?: string;
  computer?: string;
  memoryMb?: number;
}): Promise<HypervResult> {
  const computer = (input.computer ?? "").trim();
  if (computer && !HOST_OK.test(computer)) {
    return { ok: false, fallback: false, message: "Hyper-V host name is not valid." };
  }
  if (input.action !== "probe") {
    const name = (input.name ?? "").trim();
    if (!NAME_OK.test(name)) return { ok: false, fallback: false, message: "Instance name is not valid." };
  }
  const pwsh = await which("pwsh");
  if (!pwsh) {
    return {
      ok: false,
      fallback: true,
      message: "PowerShell is not installed on this server. The console will record the action locally. Install pwsh and point it at a Hyper-V host to run it on the hypervisor.",
    };
  }
  try {
    const output = await execPwsh(pwsh, {
      HV_ACTION: input.action,
      HV_NAME: input.name ?? "",
      HV_COMPUTER: computer,
      HV_MEMORY: String(input.memoryMb ?? 2048),
    });
    const target = computer ? ` on ${computer}` : "";
    return { ok: true, fallback: false, message: output.trim() || `Hyper-V accepted the action${target}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hyper-V command failed.";
    if (!computer) return { ok: false, fallback: true, message };
    return { ok: false, fallback: false, message };
  }
}

function which(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("which", [bin], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? out.trim() || bin : null));
  });
}

function execPwsh(bin: string, env: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-NoProfile", "-NonInteractive", "-Command", SCRIPT], {
      env: { ...process.env, ...env },
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("PowerShell timed out."));
    }, 20000);
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim() || out.trim() || "PowerShell exited with an error."));
    });
  });
}
