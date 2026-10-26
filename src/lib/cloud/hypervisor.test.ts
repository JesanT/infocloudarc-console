import assert from "node:assert/strict";
import test from "node:test";
import { hypervisorDefaults, hypervisorUri } from "./hypervisor.ts";

test("a Hyper-V host uses WinRM and a libvirt host uses SSH unless a URI is set", () => {
  assert.equal(hypervisorDefaults("hyper-v").port, 5985);
  assert.equal(hypervisorDefaults("libvirt").switchName, "br0");
  assert.equal(
    hypervisorUri({ kind: "hyper-v", transport: "winrm", login: "", address: "10.10.1.11", port: 5985, uri: "" }),
    "winrm://10.10.1.11:5985",
  );
  assert.equal(
    hypervisorUri({ kind: "libvirt", transport: "ssh", login: "virt", address: "10.10.1.40", port: 22, uri: "" }),
    "qemu+ssh://virt@10.10.1.40:22/system",
  );
  assert.equal(
    hypervisorUri({ kind: "libvirt", transport: "tls", login: "", address: "hv.example", port: 16514, uri: "" }),
    "qemu+tls://hv.example:16514/system",
  );
  assert.equal(
    hypervisorUri({ kind: "libvirt", transport: "ssh", login: "virt", address: "10.10.1.40", port: 22, uri: "qemu+ssh://virt@10.10.1.40/system" }),
    "qemu+ssh://virt@10.10.1.40/system",
  );
});
