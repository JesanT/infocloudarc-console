import assert from "node:assert/strict";
import test from "node:test";
import { parseGuestList, parseHypervHardware, parseLibvirtHardware } from "./hardware.ts";

const LIBVIRT = `
##INFO
State:          running
CPU(s):         1
Used memory:    2097152 KiB
##BLK
 Type   Device   Target   Source
------------------------------------------------
 file   disk     vda      /vdisk/repo/testvm.qcow2
 file   cdrom    sda      -
##IF
 Interface   Type     Source   Model    MAC
-------------------------------------------------------
 vnet0       bridge   br0      virtio   52:54:00:11:22:33
##ADDR
 Name       MAC address          Protocol     Address
-------------------------------------------------------------------------------
 vnet0      52:54:00:11:22:33    ipv4         10.10.1.50/24
##SIZE
TARGET vda
Capacity:       3221225472
Allocation:     100
`;

test("libvirt hardware output keeps disks, the bridge, and a reported address", () => {
  const view = parseLibvirtHardware(LIBVIRT);
  assert.equal(view.state, "running");
  assert.equal(view.vcpu, 1);
  assert.equal(view.memoryMb, 2048);
  assert.equal(view.disks[0]?.path, "/vdisk/repo/testvm.qcow2");
  assert.equal(view.disks[0]?.bytes, 3221225472);
  assert.equal(view.disks[1]?.device, "cdrom");
  assert.equal(view.nics[0]?.source, "br0");
  assert.equal(view.nics[0]?.address, "10.10.1.50");
});

test("a hypervisor listing keeps a running guest and its disk", () => {
  const guests = parseGuestList("VM|testvm|running|/vdisk/repo/testvm.qcow2\nVM|old|shut off|\n");
  assert.equal(guests[0]?.name, "testvm");
  assert.equal(guests[0]?.state, "running");
  assert.equal(guests[0]?.diskPath, "/vdisk/repo/testvm.qcow2");
  assert.equal(guests[1]?.state, "stopped");
  assert.equal(guests[1]?.diskPath, "");
});
test("hyper-v hardware json does not invent an address", () => {
  const view = parseHypervHardware(JSON.stringify({
    state: "Running",
    vcpu: 2,
    memoryMb: 4096,
    disks: [{ target: "0", path: "C:/Hyper-V/a.vhdx", device: "disk", bytes: 10737418240 }],
    nics: [{ mac: "00155d010203", source: "External", model: "hyper-v", address: "" }],
  }));
  assert.equal(view.disks[0]?.bytes, 10737418240);
  assert.equal(view.nics[0]?.address, "");
});
