import type { Hypervisor, HypervisorKind } from "./hypervisor.ts";
import type { Instance, SiteKey } from "./model.ts";

export type RepoKind = "local" | "mapped" | "nas";
export type RepoProtocol = "path" | "smb" | "nfs";
export type ImageFormat = "qcow2" | "vhdx" | "raw" | "iso";

export type DeployRepository = {
  id: string;
  name: string;
  site: SiteKey;
  kind: RepoKind;
  protocol: RepoProtocol;
  address: string;
  path: string;
};

export type DeployImage = {
  id: string;
  name: string;
  site: SiteKey;
  repositoryId: string;
  file: string;
  format: ImageFormat;
  os: string;
  firmware: "bios" | "uefi";
};

export type DeployTemplate = {
  id: string;
  name: string;
  site: SiteKey;
  imageId: string;
  instanceKind: Instance["kind"];
  vcpu: number;
  memoryMb: number;
  diskGb: number;
};

export const DEPLOY_REPOS: DeployRepository[] = [
  { id: "repo-east-config", name: "east-vm-config", site: "east", kind: "local", protocol: "path", address: "", path: "C:/Hyper-V/Virtual Machines" },
  { id: "repo-east-disk", name: "east-vm-disks", site: "east", kind: "local", protocol: "path", address: "", path: "C:/Hyper-V/Virtual Hard Disks" },
  { id: "repo-east-swap", name: "east-vm-swap", site: "east", kind: "local", protocol: "path", address: "", path: "C:/Hyper-V/Swap" },
  { id: "repo-west-disk", name: "west-mapped-disks", site: "west", kind: "mapped", protocol: "path", address: "", path: "/mnt/san/vms" },
  { id: "repo-central-nas", name: "central-nas", site: "central", kind: "nas", protocol: "nfs", address: "nas-central", path: "/export/vms" },
];

export const DEPLOY_IMAGES: DeployImage[] = [
  { id: "img-ubuntu-vhdx", name: "ubuntu-22.04", site: "east", repositoryId: "repo-east-disk", file: "ubuntu-22.04.vhdx", format: "vhdx", os: "Ubuntu 22.04", firmware: "uefi" },
  { id: "img-ubuntu-qcow2", name: "ubuntu-22.04", site: "west", repositoryId: "repo-west-disk", file: "ubuntu-22.04.qcow2", format: "qcow2", os: "Ubuntu 22.04", firmware: "uefi" },
  { id: "img-rhel", name: "rhel-9", site: "east", repositoryId: "repo-east-disk", file: "rhel-9.vhdx", format: "vhdx", os: "RHEL 9", firmware: "uefi" },
];

export const DEPLOY_TEMPLATES: DeployTemplate[] = [
  { id: "tpl-ubuntu-compute", name: "ubuntu-compute", site: "east", imageId: "img-ubuntu-vhdx", instanceKind: "Compute", vcpu: 2, memoryMb: 4096, diskGb: 40 },
  { id: "tpl-ubuntu-west", name: "ubuntu-compute-west", site: "west", imageId: "img-ubuntu-qcow2", instanceKind: "Compute", vcpu: 2, memoryMb: 4096, diskGb: 40 },
  { id: "tpl-rhel-db", name: "rhel-database", site: "east", imageId: "img-rhel", instanceKind: "Database", vcpu: 4, memoryMb: 8192, diskGb: 100 },
];

export function pathOk(value: string) {
  if (!value || value.length > 260) return false;
  if (/["'`$;&|<>\n\r]/.test(value)) return false;
  if (value.includes("..")) return false;
  return /^(\/|[A-Za-z]:[\\/]|\\\\|nfs:\/\/)/.test(value);
}

export function repoRoot(repo: DeployRepository) {
  if (repo.kind === "nas" && repo.protocol === "nfs" && repo.address) {
    const path = repo.path.startsWith("/") ? repo.path : `/${repo.path}`;
    return `nfs://${repo.address}${path}`;
  }
  if (repo.kind === "nas" && repo.protocol === "smb" && repo.address) {
    const share = repo.path.replace(/^[/\\]+/, "").replace(/\//g, "\\");
    return `\\\\${repo.address}\\${share}`;
  }
  return repo.path.trim();
}

export function joinRepo(root: string, file: string) {
  const name = file.replace(/^[/\\]+/, "");
  if (!root) return name;
  const sep = root.startsWith("\\\\") || (/^[A-Za-z]:[\\/]/.test(root) && root.includes("\\")) ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${sep}${name}`;
}

function windowsPath(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

export function pathFits(kind: HypervisorKind, path: string) {
  if (!path) return false;
  if (kind === "hyper-v") return windowsPath(path);
  return path.startsWith("/") && !windowsPath(path);
}

function usableRoot(value: string) {
  const root = value.trim();
  return pathOk(root) ? root : "";
}

export function diskFileName(name: string, format: ImageFormat, kind: HypervisorKind) {
  if (format === "iso") return `${name}.${kind === "hyper-v" ? "vhdx" : "qcow2"}`;
  return `${name}.${format}`;
}

export type Placement = {
  os: string;
  instanceKind: Instance["kind"];
  vcpu: number;
  memoryMb: number;
  diskGb: number;
  imagePath: string;
  configPath: string;
  diskPath: string;
  swapPath: string;
  format: ImageFormat;
  note: string;
};

export function placeInstance(input: {
  name: string;
  hypervisor: Hypervisor;
  image: DeployImage | null;
  template: DeployTemplate | null;
  repositories: DeployRepository[];
}): Placement {
  const image = input.image;
  const template = input.template;
  const repos = new Map(input.repositories.map((repo) => [repo.id, repo]));
  const diskRepo = repos.get(input.hypervisor.diskRepoId) ?? null;
  const configRepo = repos.get(input.hypervisor.configRepoId) ?? null;
  const swapRepo = repos.get(input.hypervisor.swapRepoId) ?? null;
  const imageRepo = image ? repos.get(image.repositoryId) ?? null : null;
  const format: ImageFormat = image?.format ?? (input.hypervisor.kind === "hyper-v" ? "vhdx" : "qcow2");
  const diskRoot = diskRepo ? repoRoot(diskRepo) : usableRoot(input.hypervisor.storage);
  const configRoot = configRepo ? repoRoot(configRepo) : diskRoot;
  const swapRoot = swapRepo ? repoRoot(swapRepo) : "";
  const imageRoot = imageRepo ? repoRoot(imageRepo) : "";
  const imagePath = image && imageRoot ? joinRepo(imageRoot, image.file) : "";
  const unreadable = Boolean(image && imagePath && !pathFits(input.hypervisor.kind, imagePath));
  const file = diskFileName(input.name, format, input.hypervisor.kind);
  const missing = [
    !diskRoot ? "disk" : "",
    !configRoot ? "config" : "",
    !swapRepo ? "swap" : "",
  ].filter(Boolean);
  const note = unreadable
    ? `The image is registered in ${imageRepo?.name ?? "another repository"}, which this host cannot read. Edit the image and choose a repository on this hypervisor.`
    : missing.length
      ? `No ${missing.join(", ")} repository on this hypervisor.`
      : "";
  return {
    os: image?.os || "Ubuntu 22.04",
    instanceKind: template?.instanceKind || "Compute",
    vcpu: template?.vcpu || 2,
    memoryMb: template?.memoryMb || 2048,
    diskGb: template?.diskGb || 40,
    imagePath: unreadable ? "" : imagePath,
    configPath: configRoot ? joinRepo(configRoot, input.hypervisor.kind === "hyper-v" ? input.name : `${input.name}.xml`) : "",
    diskPath: diskRoot ? joinRepo(diskRoot, file) : "",
    swapPath: swapRoot ? joinRepo(swapRoot, `${input.name}.swap`) : "",
    format,
    note,
  };
}
