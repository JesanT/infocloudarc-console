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
if ($action -eq 'owner') {
  $ip = [string]$env:HV_IP
  if ($ip -notmatch '^(\\d{1,3}\\.){3}\\d{1,3}$') { throw 'Service IP is not valid.' }
  $ownerNode = ''
  $ownerGroup = ''
  $state = ''
  $mac = ''
  $source = ''
  if (Get-Command Get-ClusterResource -ErrorAction SilentlyContinue) {
    try {
      $resources = if ($computer) { Get-ClusterResource -Cluster $computer } else { Get-ClusterResource }
      foreach ($resource in @($resources)) {
        if ([string]$resource.ResourceType -ne 'IP Address') { continue }
        $addr = [string]($resource | Get-ClusterParameter -Name Address -ErrorAction SilentlyContinue).Value
        if ($addr -eq $ip) {
          $source = 'cluster'
          $ownerNode = [string]$resource.OwnerNode
          $ownerGroup = [string]$resource.OwnerGroup
          $state = [string]$resource.State
          break
        }
      }
    } catch { }
  }
  if (-not $source) {
    if (Get-Command Get-NetNeighbor -ErrorAction SilentlyContinue) {
      $neighbor = @(Get-NetNeighbor -IPAddress $ip -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Reachable' }) | Select-Object -First 1
      if ($neighbor) { $mac = (([string]$neighbor.LinkLayerAddress) -replace '[^0-9A-Fa-f]', '').ToUpper() }
    }
    if ($mac -and (Get-Command Get-VMNetworkAdapter -ErrorAction SilentlyContinue)) {
      $nics = if ($computer) { @(Get-VMNetworkAdapter -ComputerName $computer -All -ErrorAction SilentlyContinue) } else { @(Get-VMNetworkAdapter -All -ErrorAction SilentlyContinue) }
      $nic = $nics | Where-Object { (($_.MacAddress -replace '[^0-9A-Fa-f]', '').ToUpper()) -eq $mac } | Select-Object -First 1
      if ($nic) { $ownerNode = [string]$nic.VMName }
    }
    if ($mac) { $source = 'mac'; if (-not $state) { $state = 'Online' } }
  }
  if (-not $source) { throw 'The host did not report an owner for this service IP. Nothing was queried inside the virtual machine.' }
  [pscustomobject]@{ source = $source; ownerNode = $ownerNode; ownerGroup = $ownerGroup; mac = $mac; state = $state } | ConvertTo-Json -Compress
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
    $switch = [string]$env:HV_SWITCH
    $vmPath = [string]$env:HV_VMPATH
    $disk = [string]$env:HV_DISK
    $image = [string]$env:HV_IMAGE
    $diskGb = 40
    if ($env:HV_DISK_GB) { $diskGb = [int]$env:HV_DISK_GB }
    $vhd = ''
    if ($image -and $disk) {
      if ($computer) { New-VHD -ComputerName $computer -Path $disk -ParentPath $image -Differencing | Out-Null }
      else { New-VHD -Path $disk -ParentPath $image -Differencing | Out-Null }
      $vhd = $disk
    } elseif ($disk) {
      if ($computer) { New-VHD -ComputerName $computer -Path $disk -SizeBytes ($diskGb * 1GB) -Dynamic | Out-Null }
      else { New-VHD -Path $disk -SizeBytes ($diskGb * 1GB) -Dynamic | Out-Null }
      $vhd = $disk
    } elseif ($image) {
      $vhd = $image
    }
    if ($computer) {
      if ($switch -and $vmPath -and $vhd) { New-VM -Name $name -ComputerName $computer -Generation 2 -MemoryStartupBytes $bytes -SwitchName $switch -Path $vmPath -VHDPath $vhd | Start-VM }
      elseif ($switch -and $vhd) { New-VM -Name $name -ComputerName $computer -Generation 2 -MemoryStartupBytes $bytes -SwitchName $switch -VHDPath $vhd | Start-VM }
      elseif ($vhd) { New-VM -Name $name -ComputerName $computer -Generation 2 -MemoryStartupBytes $bytes -VHDPath $vhd | Start-VM }
      else { New-VM -Name $name -ComputerName $computer -Generation 2 -MemoryStartupBytes $bytes | Start-VM }
    } else {
      if ($switch -and $vmPath -and $vhd) { New-VM -Name $name -Generation 2 -MemoryStartupBytes $bytes -SwitchName $switch -Path $vmPath -VHDPath $vhd | Start-VM }
      elseif ($vhd) { New-VM -Name $name -Generation 2 -MemoryStartupBytes $bytes -VHDPath $vhd | Start-VM }
      else { New-VM -Name $name -Generation 2 -MemoryStartupBytes $bytes | Start-VM }
    }
  }
  default { throw 'Unknown action' }
}
Write-Output 'ok'
`;

export type OwnerSource = "cluster" | "mac" | "unconfirmed";

export type HypervResult = {
  ok: boolean;
  fallback: boolean;
  message: string;
  source: OwnerSource;
  ownerNode: string;
  ownerGroup: string;
  mac: string;
  state: string;
};

const EMPTY_OWNER = { source: "unconfirmed" as const, ownerNode: "", ownerGroup: "", mac: "", state: "" };

export async function runHyperv(input: {
  action: "probe" | "stop" | "restart" | "shutdown" | "deploy" | "owner";
  name?: string;
  computer?: string;
  memoryMb?: number;
  ip?: string;
  switchName?: string;
  configPath?: string;
  diskPath?: string;
  imagePath?: string;
  diskGb?: number;
}): Promise<HypervResult> {
  const computer = (input.computer ?? "").trim();
  if (computer && !HOST_OK.test(computer)) {
    return { ok: false, fallback: false, message: "Hyper-V host name is not valid.", ...EMPTY_OWNER };
  }
  if (input.action === "owner") {
    const ip = (input.ip ?? "").trim();
    if (!validIp(ip)) return { ok: false, fallback: false, message: "Service IP is not valid.", ...EMPTY_OWNER };
  } else if (input.action !== "probe") {
    const name = (input.name ?? "").trim();
    if (!NAME_OK.test(name)) return { ok: false, fallback: false, message: "Instance name is not valid.", ...EMPTY_OWNER };
  }
  const pwsh = await which("pwsh");
  if (!pwsh) {
    return {
      ok: false,
      fallback: true,
      message: input.action === "owner"
        ? "PowerShell is not installed on the console server, so the Hyper-V host was not asked. Nothing runs inside the virtual machine. The recorded site was kept."
        : "PowerShell is not installed on this server. The console will record the action locally. Install pwsh and point it at a Hyper-V host to run it on the hypervisor.",
      ...EMPTY_OWNER,
    };
  }
  try {
    const output = await execPwsh(pwsh, {
      HV_ACTION: input.action,
      HV_NAME: input.name ?? "",
      HV_COMPUTER: computer,
      HV_MEMORY: String(input.memoryMb ?? 2048),
      HV_IP: input.ip ?? "",
      HV_SWITCH: input.switchName ?? "",
      HV_VMPATH: input.configPath ?? "",
      HV_DISK: input.diskPath ?? "",
      HV_IMAGE: input.imagePath ?? "",
      HV_DISK_GB: String(input.diskGb ?? 40),
    }, input.action === "owner" ? 25000 : 20000);
    if (input.action === "owner") return parseOwner(output, input.ip ?? "");
    const target = computer ? ` on ${computer}` : "";
    return { ok: true, fallback: false, message: output.trim() || `Hyper-V accepted the action${target}.`, ...EMPTY_OWNER };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hyper-V command failed.";
    if (input.action === "owner") return { ok: false, fallback: false, message, ...EMPTY_OWNER };
    if (!computer) return { ok: false, fallback: true, message, ...EMPTY_OWNER };
    return { ok: false, fallback: false, message, ...EMPTY_OWNER };
  }
}

function validIp(value: string) {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return false;
  return value.split(".").every((part) => Number(part) <= 255);
}

function parseOwner(output: string, ip: string): HypervResult {
  const line = output.split(/\r?\n/).map((item) => item.trim()).find((item) => item.startsWith("{"));
  if (!line) return { ok: false, fallback: false, message: "The host returned no owner for the service IP.", ...EMPTY_OWNER };
  let parsed: { source?: string; ownerNode?: string; ownerGroup?: string; mac?: string; state?: string };
  try {
    parsed = JSON.parse(line) as typeof parsed;
  } catch {
    return { ok: false, fallback: false, message: "The host returned an unreadable owner.", ...EMPTY_OWNER };
  }
  const source = parsed.source === "cluster" || parsed.source === "mac" ? parsed.source : "unconfirmed";
  if (source === "unconfirmed") return { ok: false, fallback: false, message: "The host did not report an owner for this service IP.", ...EMPTY_OWNER };
  const ownerNode = String(parsed.ownerNode ?? "");
  const ownerGroup = String(parsed.ownerGroup ?? "");
  const mac = String(parsed.mac ?? "");
  const state = String(parsed.state ?? "");
  const who = ownerNode || ownerGroup || mac || "a node";
  const message = source === "cluster"
    ? `The cluster reports ${who} owns ${ip}.`
    : `MAC ${mac || who} is answering for ${ip}.`;
  return { ok: true, fallback: false, message, source, ownerNode, ownerGroup, mac, state };
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

function execPwsh(bin: string, env: Record<string, string>, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-NoProfile", "-NonInteractive", "-Command", SCRIPT], {
      env: { ...process.env, ...env },
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("PowerShell timed out."));
    }, timeoutMs);
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
