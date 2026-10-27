import { spawn } from "node:child_process";
import { pathOk } from "@/lib/cloud/deploy";
import type { HypervisorKind } from "@/lib/cloud/hypervisor";
import { emptyGuest, parseGuestList, parseHypervHardware, parseLibvirtHardware, type GuestView, type ListedGuest } from "@/lib/cloud/hardware";
import { sshInvocation } from "@/lib/cloud/ssh-auth.server";

export type HardwareOp =
  | { op: "inspect" }
  | { op: "cpu"; vcpu: number }
  | { op: "memory"; memoryMb: number }
  | { op: "add-disk"; diskGb: number }
  | { op: "grow-disk"; target: string; diskGb: number }
  | { op: "add-cd"; isoPath: string }
  | { op: "eject-cd"; target: string }
  | { op: "add-nic"; bridge: string }
  | { op: "remove-nic"; mac: string };

export type HardwareRequest = {
  kind: HypervisorKind;
  name: string;
  address: string;
  port: number;
  login: string;
  password: string;
  diskPath: string;
  switchName: string;
  change: HardwareOp;
};

export type HardwareResult = { ok: boolean; message: string; hardware: GuestView | null };

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

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

function run(command: string, args: string[], ms: number, env: NodeJS.ProcessEnv = process.env) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), ms);
    child.stdout.on("data", (chunk) => {
      if (out.length < 200000) out += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (err.length < 20000) err += String(chunk);
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

function q(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function inspectScript(name: string) {
  const vm = q(name);
  return `name=${vm}; c=qemu:///system
echo '##INFO'
virsh -c "$c" dominfo "$name"
echo '##BLK'
virsh -c "$c" domblklist "$name" --details
echo '##IF'
virsh -c "$c" domiflist "$name"
echo '##ADDR'
virsh -c "$c" domifaddr "$name" --source agent 2>/dev/null || true
virsh -c "$c" domifaddr "$name" --source lease 2>/dev/null || true
virsh -c "$c" domifaddr "$name" --source arp 2>/dev/null || true
echo '##SIZE'
virsh -c "$c" domblklist "$name" --details | awk 'NR>2 && $2=="disk" {print $3}' | while read -r target; do
  echo "TARGET $target"
  virsh -c "$c" domblkinfo "$name" "$target" 2>/dev/null || true
done`;
}

function changeScript(input: HardwareRequest) {
  const name = q(input.name);
  const disk = input.diskPath ? q(input.diskPath) : "''";
  const op = input.change;
  if (op.op === "inspect") return inspectScript(input.name);
  if (op.op === "cpu") {
    const count = String(op.vcpu);
    return `name=${name}; c=qemu:///system
virsh -c "$c" setvcpus "$name" ${count} --config --maximum >/dev/null 2>&1 || true
virsh -c "$c" setvcpus "$name" ${count} --config
virsh -c "$c" setvcpus "$name" ${count} --live >/dev/null 2>&1 || true
echo 'CPU_SET ${count}'`;
  }
  if (op.op === "memory") {
    const kb = String(op.memoryMb * 1024);
    return `name=${name}; c=qemu:///system
virsh -c "$c" setmaxmem "$name" ${kb} --config >/dev/null 2>&1 || true
virsh -c "$c" setmem "$name" ${kb} --config
virsh -c "$c" setmem "$name" ${kb} --live >/dev/null 2>&1 || true
echo 'MEMORY_SET ${op.memoryMb}'`;
  }
  if (op.op === "add-disk") {
    return `name=${name}; base=${disk}; gb=${op.diskGb}; c=qemu:///system
dir=$(dirname "$base")
stamp=$(date +%H%M%S)
file="$dir/\${name}-data-$stamp.qcow2"
qemu-img create -f qcow2 "$file" "\${gb}G"
used=$(virsh -c "$c" domblklist "$name" --details | awk 'NR>2 && $2=="disk" {print $3}')
target=vdb
for letter in b c d e f g h i j k; do
  if ! printf '%s\n' "$used" | grep -qx "vd$letter"; then target=vd$letter; break; fi
done
if ! virsh -c "$c" attach-disk "$name" "$file" "$target" --targetbus virtio --driver qemu --subdriver qcow2 --live --config; then
  virsh -c "$c" attach-disk "$name" "$file" "$target" --targetbus virtio --driver qemu --subdriver qcow2 --config
fi
echo "DISK_ADDED $file"`;
  }
  if (op.op === "grow-disk") {
    const target = q(op.target);
    return `name=${name}; target=${target}; gb=${op.diskGb}; c=qemu:///system
path=$(virsh -c "$c" domblklist "$name" --details | awk -v t="$target" 'NR>2 && $3==t {print $4; exit}')
state=$(virsh -c "$c" domstate "$name" | head -n 1)
if [ "$state" = "running" ]; then
  virsh -c "$c" blockresize "$name" "$target" "\${gb}G"
else
  qemu-img resize "$path" "\${gb}G"
fi
fs=not-grown
if [ "$state" = "shut off" ] && [ -n "$path" ] && [ "$path" != "-" ]; then
  if virt-customize -a "$path" --run-command 'growpart /dev/vda 1 || growpart /dev/sda 1 || true' --run-command 'resize2fs /dev/vda1 || resize2fs /dev/sda1 || xfs_growfs / || true'; then
    fs=grown
  else
    fs=customize-failed
  fi
elif virsh -c "$c" qemu-agent-command "$name" '{"execute":"guest-ping"}' >/dev/null 2>&1; then
  pid=$(virsh -c "$c" qemu-agent-command "$name" '{"execute":"guest-exec","arguments":{"path":"/bin/sh","arg":["-c","growpart /dev/vda 1 || growpart /dev/sda 1; resize2fs /dev/vda1 || resize2fs /dev/sda1 || xfs_growfs /"],"capture-output":true}}' | sed -n 's/.*"pid":[[:space:]]*\\([0-9][0-9]*\\).*/\\1/p')
  if [ -n "$pid" ]; then
    i=0
    while [ "$i" -lt 8 ]; do
      sleep 1
      i=$((i + 1))
      st=$(virsh -c "$c" qemu-agent-command "$name" "{\\"execute\\":\\"guest-exec-status\\",\\"arguments\\":{\\"pid\\":$pid}}")
      echo "$st" | grep -q '"exited":true' && break
    done
    echo "$st" | grep -q '"exitcode":0' && fs=grown || fs=guest-failed
  else
    fs=guest-failed
  fi
else
  fs=no-agent
fi
echo "DISK_GROWN $gb $fs"`;
  }
  if (op.op === "add-cd") {
    const iso = q(op.isoPath);
    return `name=${name}; iso=${iso}; c=qemu:///system
cd=$(virsh -c "$c" domblklist "$name" --details | awk 'NR>2 && $2=="cdrom" {print $3; exit}')
if [ -n "$cd" ]; then
  virsh -c "$c" change-media "$name" "$cd" "$iso" --insert --live --config || virsh -c "$c" change-media "$name" "$cd" "$iso" --insert --config
else
  virsh -c "$c" attach-disk "$name" "$iso" sda --type cdrom --mode readonly --live --config || virsh -c "$c" attach-disk "$name" "$iso" sda --type cdrom --mode readonly --config
fi
echo 'CD_ATTACHED'`;
  }
  if (op.op === "eject-cd") {
    return `name=${name}; target=${q(op.target)}; c=qemu:///system
virsh -c "$c" change-media "$name" "$target" --eject --live --config || virsh -c "$c" change-media "$name" "$target" --eject --config
echo 'CD_EJECTED'`;
  }
  if (op.op === "add-nic") {
    const bridge = q(op.bridge);
    return `name=${name}; bridge=${bridge}; c=qemu:///system
virsh -c "$c" attach-interface "$name" bridge "$bridge" --model virtio --live --config || virsh -c "$c" attach-interface "$name" bridge "$bridge" --model virtio --config
echo 'NIC_ADDED'`;
  }
  return `name=${name}; mac=${q(op.mac)}; c=qemu:///system
virsh -c "$c" detach-interface "$name" bridge --mac "$mac" --live --config || virsh -c "$c" detach-interface "$name" bridge --mac "$mac" --config
echo 'NIC_REMOVED'`;
}

function explain(text: string) {
  if (text.includes("DISK_GROWN") && text.includes("grown")) return "The virtual disk was resized and the guest filesystem was grown.";
  if (text.includes("no-agent")) return "The virtual disk was resized. The filesystem was not grown: the guest agent did not answer. Shut the virtual machine down and expand again, or run growpart and resize2fs inside the guest.";
  if (text.includes("customize-failed") || text.includes("guest-failed")) return "The virtual disk was resized. The filesystem command failed, so the filesystem size was not confirmed.";
  if (text.includes("DISK_ADDED")) return "A disk was created and attached. It is empty until the guest formats it.";
  if (text.includes("CD_ATTACHED")) return "The ISO was attached.";
  if (text.includes("CD_EJECTED")) return "The ISO was ejected.";
  if (text.includes("NIC_ADDED")) return "A network card was added. An address appears only if the bridge has DHCP.";
  if (text.includes("NIC_REMOVED")) return "The network card was removed.";
  if (text.includes("CPU_SET")) return "The processor count was changed. A guest may need a restart before it uses a higher maximum.";
  if (text.includes("MEMORY_SET")) return "The memory size was changed. A guest may need a restart before it uses a higher maximum.";
  return "The hypervisor accepted the change.";
}

async function ssh(input: HardwareRequest, remote: string, ms: number) {
  const bin = await which("ssh");
  if (!bin) return { code: 127, out: "", err: "The ssh client is not installed on the console." };
  const target = `${input.login || "root"}@${input.address}`;
  const call = await sshInvocation({ ssh: bin, port: input.port || 22, target, remote, password: input.password });
  try {
    return await run(call.command, call.args, ms, call.env);
  } finally {
    await call.cleanup();
  }
}

const HV_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$name = $env:HV_NAME
$computer = $env:HV_COMPUTER
$action = $env:HV_ACTION
if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) { throw 'Hyper-V module is not available on this server.' }
$cred = $null
if ($env:HV_USER -and $env:HV_PASSWORD) {
  $sec = ConvertTo-SecureString $env:HV_PASSWORD -AsPlainText -Force
  $cred = New-Object System.Management.Automation.PSCredential($env:HV_USER, $sec)
}
$remote = @{}
if ($computer) { $remote.ComputerName = $computer }
if ($computer -and $cred) { $remote.Credential = $cred }
function Read-Hardware {
  $vm = Get-VM -Name $name @remote
  $disks = @()
  foreach ($disk in @(Get-VMHardDiskDrive -VMName $name @remote)) {
    $bytes = 0
    if ($disk.Path) {
      try { $bytes = [int64](Get-VHD -Path $disk.Path @remote).Size } catch { $bytes = 0 }
    }
    $disks += [pscustomobject]@{ target = [string]$disk.ControllerLocation; path = [string]$disk.Path; device = 'disk'; bytes = $bytes }
  }
  foreach ($dvd in @(Get-VMDvdDrive -VMName $name @remote)) {
    $disks += [pscustomobject]@{ target = ('dvd' + [string]$dvd.ControllerLocation); path = [string]$dvd.Path; device = 'cdrom'; bytes = 0 }
  }
  $nics = @()
  foreach ($nic in @(Get-VMNetworkAdapter -VMName $name @remote)) {
    $ips = @($nic.IPAddresses | Where-Object { $_ -match '^(\\d{1,3}\\.){3}\\d{1,3}$' })
    $nics += [pscustomobject]@{ mac = [string]$nic.MacAddress; source = [string]$nic.SwitchName; model = 'hyper-v'; address = ($(if ($ips) { $ips[0] } else { '' })) }
  }
  [pscustomobject]@{
    state = [string]$vm.State
    vcpu = [int]$vm.ProcessorCount
    memoryMb = [int]($vm.MemoryAssigned / 1MB)
    disks = $disks
    nics = $nics
  } | ConvertTo-Json -Compress -Depth 4
}
switch ($action) {
  'inspect' { Read-Hardware; exit 0 }
  'cpu' { Set-VMProcessor -VMName $name @remote -Count ([int]$env:HV_VCPU); Write-Output 'CPU_SET' }
  'memory' { Set-VM -Name $name @remote -MemoryStartupBytes ([int64]$env:HV_MEMORY * 1MB); Write-Output 'MEMORY_SET' }
  'add-disk' {
    if (-not $env:HV_DISK) { throw 'This instance has no disk path, so a new disk has nowhere to go.' }
    $dir = Split-Path -Parent $env:HV_DISK
    $file = Join-Path $dir ($name + '-data-' + (Get-Date -Format 'HHmmss') + '.vhdx')
    New-VHD -Path $file @remote -SizeBytes ([int64]$env:HV_GB * 1GB) -Dynamic | Out-Null
    Add-VMHardDiskDrive -VMName $name @remote -Path $file
    Write-Output 'DISK_ADDED'
  }
  'grow-disk' {
    if (-not $env:HV_TARGET) { throw 'Choose a disk.' }
    Resize-VHD -Path $env:HV_TARGET @remote -SizeBytes ([int64]$env:HV_GB * 1GB)
    Write-Output 'DISK_GROWN no-agent'
  }
  'add-cd' {
    if (-not $env:HV_ISO) { throw 'An ISO path is required.' }
    $dvd = @(Get-VMDvdDrive -VMName $name @remote) | Select-Object -First 1
    if ($dvd) { Set-VMDvdDrive -VMName $name @remote -ControllerNumber $dvd.ControllerNumber -ControllerLocation $dvd.ControllerLocation -Path $env:HV_ISO }
    else { Add-VMDvdDrive -VMName $name @remote -Path $env:HV_ISO }
    Write-Output 'CD_ATTACHED'
  }
  'eject-cd' {
    $loc = [int]($env:HV_TARGET -replace '\\D','')
    $dvd = @(Get-VMDvdDrive -VMName $name @remote) | Where-Object { $_.ControllerLocation -eq $loc } | Select-Object -First 1
    if (-not $dvd) { throw 'That DVD drive was not found.' }
    Set-VMDvdDrive -VMName $name @remote -ControllerNumber $dvd.ControllerNumber -ControllerLocation $dvd.ControllerLocation -Path $null
    Write-Output 'CD_EJECTED'
  }
  'add-nic' { Add-VMNetworkAdapter -VMName $name @remote -SwitchName $env:HV_SWITCH | Out-Null; Write-Output 'NIC_ADDED' }
  'remove-nic' {
    $want = ($env:HV_MAC -replace '[^0-9A-Fa-f]','').ToUpper()
    $nic = @(Get-VMNetworkAdapter -VMName $name @remote) | Where-Object { (($_.MacAddress -replace '[^0-9A-Fa-f]','').ToUpper()) -eq $want } | Select-Object -First 1
    if (-not $nic) { throw 'That network card was not found.' }
    Remove-VMNetworkAdapter -VMName $name @remote -MacAddress $nic.MacAddress -Confirm:$false
    Write-Output 'NIC_REMOVED'
  }
  default { throw 'Unknown action' }
}
`;

function hvEnv(input: HardwareRequest) {
  const op = input.change;
  return {
    HV_ACTION: op.op === "inspect" ? "inspect" : op.op,
    HV_NAME: input.name,
    HV_COMPUTER: input.address,
    HV_USER: input.login,
    HV_PASSWORD: input.password,
    HV_DISK: input.diskPath,
    HV_VCPU: op.op === "cpu" ? String(op.vcpu) : "",
    HV_MEMORY: op.op === "memory" ? String(op.memoryMb) : "",
    HV_GB: op.op === "add-disk" || op.op === "grow-disk" ? String(op.diskGb) : "",
    HV_TARGET: op.op === "grow-disk" || op.op === "eject-cd" ? op.target : "",
    HV_ISO: op.op === "add-cd" ? op.isoPath : "",
    HV_SWITCH: op.op === "add-nic" ? op.bridge : input.switchName,
    HV_MAC: op.op === "remove-nic" ? op.mac : "",
  };
}

async function runPwsh(env: Record<string, string>) {
  const pwsh = await which("pwsh");
  if (!pwsh) return { code: 127, out: "", err: "PowerShell is not installed on this server." };
  return run(pwsh, ["-NoProfile", "-NonInteractive", "-Command", HV_SCRIPT], 60000, { ...process.env, ...env });
}

function refused(text: string, password: string) {
  const clean = password ? text.split(password).join("••••") : text;
  if (/permission denied|authentication|logon failure|access is denied/i.test(clean)) return "The hypervisor refused the login. Nothing was changed.";
  return clean.split("\n").map((line) => line.trim()).filter(Boolean).at(-1)?.slice(0, 400) || "The hypervisor refused the command.";
}

export async function runHardware(input: HardwareRequest): Promise<HardwareResult> {
  const op = input.change;
  if (op.op === "add-disk" && !pathOk(input.diskPath)) {
    return { ok: false, message: "This instance has no disk path, so a new disk has nowhere to go.", hardware: null };
  }
  if (op.op === "add-cd" && !pathOk(op.isoPath)) return { ok: false, message: "The ISO path is not valid.", hardware: null };
  if ((op.op === "add-nic" || op.op === "remove-nic") && op.op === "add-nic" && !TOKEN.test(op.bridge)) {
    return { ok: false, message: "The bridge or switch name is not valid.", hardware: null };
  }
  const ms = op.op === "grow-disk" ? 120000 : 40000;
  const result = input.kind === "libvirt"
    ? await ssh(input, op.op === "inspect" ? inspectScript(input.name) : changeScript(input), ms)
    : await runPwsh(hvEnv(input));
  const text = `${result.out}\n${result.err}`;
  if (result.code !== 0) return { ok: false, message: refused(text, input.password), hardware: null };
  if (op.op === "inspect") {
    const hardware = input.kind === "libvirt" ? parseLibvirtHardware(result.out) : parseHypervHardware(result.out);
    if (!hardware.state && hardware.disks.length === 0) {
      return { ok: false, message: refused(text, input.password), hardware: null };
    }
    return { ok: true, message: hardware.nics.some((nic) => nic.address) ? "The hypervisor reported an address." : "The hypervisor did not report an address. DHCP may still be pending, or the guest agent is not running.", hardware };
  }
  const again = input.kind === "libvirt"
    ? await ssh(input, inspectScript(input.name), 20000)
    : await runPwsh({ ...hvEnv(input), HV_ACTION: "inspect" });
  const hardware = again.code === 0
    ? input.kind === "libvirt" ? parseLibvirtHardware(again.out) : parseHypervHardware(again.out)
    : emptyGuest();
  return { ok: true, message: explain(text), hardware: hardware.state ? hardware : null };
}

const LIST_HV = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) { throw 'Hyper-V module is not available on this server.' }
$cred = $null
if ($env:HV_USER -and $env:HV_PASSWORD) {
  $sec = ConvertTo-SecureString $env:HV_PASSWORD -AsPlainText -Force
  $cred = New-Object System.Management.Automation.PSCredential($env:HV_USER, $sec)
}
$remote = @{}
if ($env:HV_COMPUTER) { $remote.ComputerName = $env:HV_COMPUTER }
if ($env:HV_COMPUTER -and $cred) { $remote.Credential = $cred }
Get-VM @remote | ForEach-Object {
  $disk = ''
  $drive = @(Get-VMHardDiskDrive -VMName $_.Name @remote) | Select-Object -First 1
  if ($drive) { $disk = [string]$drive.Path }
  Write-Output ('VM|' + $_.Name + '|' + $_.State + '|' + $disk)
}
`;

export async function listGuests(input: {
  kind: HardwareRequest["kind"];
  address: string;
  port: number;
  login: string;
  password: string;
}): Promise<{ ok: boolean; message: string; guests: ListedGuest[] }> {
  const request: HardwareRequest = {
    ...input,
    name: "inventory",
    diskPath: "",
    switchName: "",
    change: { op: "inspect" },
  };
  const remote = `c=qemu:///system
virsh -c "$c" list --all --name | while IFS= read -r name; do
  [ -z "$name" ] && continue
  state=$(virsh -c "$c" domstate "$name" 2>/dev/null | head -n 1)
  disk=$(virsh -c "$c" domblklist "$name" --details 2>/dev/null | awk 'NR>2 && $2=="disk" { $1=""; $2=""; $3=""; sub(/^[[:space:]]+/, ""); print; exit }')
  printf 'VM|%s|%s|%s\\n' "$name" "$state" "$disk"
done`;
  if (input.kind === "libvirt") {
    const result = await ssh(request, remote, 30000);
    const text = `${result.out}\n${result.err}`;
    if (result.code !== 0) return { ok: false, message: refused(text, input.password), guests: [] };
    return { ok: true, message: "The hypervisor answered.", guests: parseGuestList(result.out) };
  }
  const pwsh = await which("pwsh");
  if (!pwsh) return { ok: false, message: "PowerShell is not installed on this server.", guests: [] };
  const result = await run(pwsh, ["-NoProfile", "-NonInteractive", "-Command", LIST_HV], 30000, {
    ...process.env,
    HV_COMPUTER: input.address,
    HV_USER: input.login,
    HV_PASSWORD: input.password,
  });
  const text = `${result.out}\n${result.err}`;
  if (result.code !== 0) return { ok: false, message: refused(text, input.password), guests: [] };
  return { ok: true, message: "The hypervisor answered.", guests: parseGuestList(result.out) };
}
