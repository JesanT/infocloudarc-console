import { guestInventory } from "@/lib/cloud/guest-hardware";
import { useCloud } from "@/lib/cloud/store";

let inflight: Promise<string> | null = null;

export function syncFromHypervisors() {
  if (inflight) return inflight;
  inflight = readAll().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function readAll() {
  const hypervisors = useCloud.getState().hypervisors;
  if (hypervisors.length === 0) return "No hypervisor is recorded.";
  const notes: string[] = [];
  for (const hv of hypervisors) {
    try {
      const result = await guestInventory({
        data: { kind: hv.kind, address: hv.address, port: hv.port, login: hv.login, password: hv.password || "" },
      });
      if (!result.ok) {
        notes.push(`${hv.name}: ${result.message}`);
        continue;
      }
      const change = useCloud.getState().reconcileHypervisor({
        hypervisorId: hv.id,
        site: hv.site,
        hostId: hv.hostId || null,
        clusterName: hv.clusterName || null,
        guests: result.guests,
      });
      notes.push(`${hv.name}: ${result.guests.length} defined, ${change.added} added, ${change.removed} no longer defined.`);
    } catch (error) {
      notes.push(`${hv.name}: ${error instanceof Error ? error.message : "did not answer"}`);
    }
  }
  return notes.join(" ");
}
