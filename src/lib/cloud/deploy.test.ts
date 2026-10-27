import assert from "node:assert/strict";
import test from "node:test";
import { DEPLOY_IMAGES, DEPLOY_REPOS, DEPLOY_TEMPLATES, joinRepo, placeInstance, repoRoot } from "./deploy.ts";
import { HYPERVISORS } from "./hypervisor.ts";

test("a NAS export and a Windows disk path join without doubling separators", () => {
  const nas = DEPLOY_REPOS.find((repo) => repo.id === "repo-central-nas");
  assert.ok(nas);
  assert.equal(repoRoot(nas), "nfs://nas-central/export/vms");
  assert.equal(joinRepo("C:/Hyper-V/Virtual Hard Disks", "app.vhdx"), "C:/Hyper-V/Virtual Hard Disks/app.vhdx");
  assert.equal(joinRepo("\\\\nas\\vms", "app.vhdx"), "\\\\nas\\vms\\app.vhdx");
});

test("a template places config, disk, and swap on the hypervisor repositories", () => {
  const hypervisor = {
    ...HYPERVISORS[0],
    configRepoId: "repo-east-config",
    diskRepoId: "repo-east-disk",
    swapRepoId: "repo-east-swap",
  };
  const placed = placeInstance({
    name: "app-03",
    hypervisor,
    image: DEPLOY_IMAGES[0],
    template: DEPLOY_TEMPLATES[0],
    repositories: DEPLOY_REPOS,
  });
  assert.equal(placed.diskPath, "C:/Hyper-V/Virtual Hard Disks/app-03.vhdx");
  assert.equal(placed.configPath, "C:/Hyper-V/Virtual Machines/app-03");
  assert.equal(placed.swapPath, "C:/Hyper-V/Swap/app-03.swap");
  assert.equal(placed.imagePath, "C:/Hyper-V/Virtual Hard Disks/ubuntu-22.04.vhdx");
  assert.equal(placed.memoryMb, 4096);
  assert.equal(placed.note, "");
});

test("a Windows image path is not offered to a libvirt host", () => {
  const placed = placeInstance({
    name: "testvm",
    hypervisor: { ...HYPERVISORS[0], kind: "libvirt", configRepoId: "repo-west-disk", diskRepoId: "repo-west-disk", swapRepoId: "repo-west-disk" },
    image: DEPLOY_IMAGES[0],
    template: DEPLOY_TEMPLATES[0],
    repositories: DEPLOY_REPOS,
  });
  assert.equal(placed.imagePath, "");
  assert.match(placed.note, /cannot read/);
});

test("a storage pool name is not treated as a disk path", () => {
  const placed = placeInstance({
    name: "app-03",
    hypervisor: { ...HYPERVISORS[0], kind: "libvirt", storage: "default", configRepoId: "", diskRepoId: "", swapRepoId: "" },
    image: null,
    template: null,
    repositories: DEPLOY_REPOS,
  });
  assert.equal(placed.diskPath, "");
  assert.equal(placed.configPath, "");
  assert.match(placed.note, /disk/);
});
