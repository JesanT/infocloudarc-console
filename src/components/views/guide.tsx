import { Button, Panel } from "@/components/ui";
import { useCloud } from "@/lib/cloud/store";

const SECTIONS = [
  { id: "start", title: "Start here" },
  { id: "order", title: "Order of work" },
  { id: "sites", title: "Sites" },
  { id: "hypervisors", title: "Hypervisors" },
  { id: "images", title: "Repositories and images" },
  { id: "deploy", title: "Deploy a virtual machine" },
  { id: "operate", title: "Operate a virtual machine" },
  { id: "records", title: "Other records" },
  { id: "access", title: "Access" },
  { id: "tables", title: "Tables and forms" },
];

export function GuideView() {
  const setView = useCloud((s) => s.setView);
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <nav className="h-fit border border-line bg-white p-3 lg:sticky lg:top-0" aria-label="Guide sections">
        <div className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">On this page</div>
        <ul className="space-y-1 text-sm">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a className="text-[#0078d4] hover:underline" href={`#${section.id}`}>{section.title}</a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="space-y-4">
        <Panel title="User guide" subtitle="How to run this private cloud. The hypervisor is the source of truth for virtual machines. Everything else is a record you keep in the console.">
          <article className="space-y-8 text-sm leading-relaxed text-ink">
            <section id="start" className="scroll-mt-4 space-y-2">
              <h2 className="text-base font-semibold">Start here</h2>
              <p>Infocloudarc is the control panel for your own hosts. It does not invent a virtual machine, an address, or a disk. If a deploy is cancelled in the browser, the host can still have the machine. Open Instance overview and use Read from hypervisors, or reload the console: it asks each hypervisor what is defined.</p>
              <p>Use the site filter in the top bar to limit every page. Use the search box to filter the current list.</p>
            </section>

            <section id="order" className="scroll-mt-4 space-y-2">
              <h2 className="text-base font-semibold">Order of work</h2>
              <ol className="list-decimal space-y-1 pl-5">
                <li><a className="text-[#0078d4] hover:underline" href="#sites">Create a site</a> if the datacenter is not already listed.</li>
                <li><a className="text-[#0078d4] hover:underline" href="#hypervisors">Add the hypervisor</a> and test the login.</li>
                <li><a className="text-[#0078d4] hover:underline" href="#images">Add repositories, then the image, then a template</a>.</li>
                <li><a className="text-[#0078d4] hover:underline" href="#deploy">Deploy the virtual machine</a>. Confirm the name and the disk path first.</li>
                <li><a className="text-[#0078d4] hover:underline" href="#operate">Operate it</a>: power, disks, network, and the console.</li>
              </ol>
            </section>

            <section id="sites" className="scroll-mt-4 space-y-2">
              <h2 className="text-base font-semibold">Sites</h2>
              <p>A site is one datacenter. Open <button type="button" className="font-semibold text-[#0078d4]" onClick={() => setView("deployment")}>Configuration</button>. Sites is the first section. Give the site a name and a short code such as DC4. The id is taken from the name and does not change later, so existing records stay linked.</p>
              <p>Assets, virtual machines, hosts, hypervisors, repositories, images, and templates each store one site. You cannot delete a site while any of those still belong to it.</p>
            </section>

            <section id="hypervisors" className="scroll-mt-4 space-y-2">
              <h2 className="text-base font-semibold">Hypervisors</h2>
              <p>Open <button type="button" className="font-semibold text-[#0078d4]" onClick={() => setView("hypervisors")}>Hypervisors</button>. Hyper-V uses WinRM. An Ubuntu host uses SSH and virsh. The password is optional when the console key is already trusted. A refused login is not stored as a running machine.</p>
              <p>Each hypervisor points at three repositories on the same site: machine files, VM disks, and swap. Those paths must be paths the host itself can read.</p>
            </section>

            <section id="images" className="scroll-mt-4 space-y-2">
              <h2 className="text-base font-semibold">Repositories and images</h2>
              <p>Still on Configuration, under Sites:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Repository: a local disk, a disk mapped on the host, or a NAS export.</li>
                <li>Image: the file name inside that repository, plus the operating system and format. qcow2 for libvirt, vhdx for Hyper-V.</li>
                <li>Template: CPU, memory, and disk size, tied to one image.</li>
              </ul>
              <p>A Windows path is not offered to a libvirt host. If deploy says the image cannot be read, edit the image and choose the repository that lives on that host.</p>
              <p>The Ubuntu cloud image user is <span className="font-mono">ubuntu</span>. The password is the one you set on the image before you registered it.</p>
            </section>

            <section id="deploy" className="scroll-mt-4 space-y-2">
              <h2 className="text-base font-semibold">Deploy a virtual machine</h2>
              <p>Open <button type="button" className="font-semibold text-[#0078d4]" onClick={() => setView("instance-ops")}>Instance operations</button>. Only vendor access can deploy. Choose the hypervisor and the template, check the machine file and disk path, then Deploy. The console asks again before it creates anything.</p>
              <p>A second deploy of the same name is refused. If the browser drops the connection, the machine can still exist on the host. The console reads the host list on the next load and adds it.</p>
            </section>

            <section id="operate" className="scroll-mt-4 space-y-2">
              <h2 className="text-base font-semibold">Operate a virtual machine</h2>
              <p>Instance overview lists what the hypervisors report. Select one to read processors, memory, disks, and network cards from the host. An address appears only when the host reports one.</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Stop, restart, and shutdown run on the linked hypervisor.</li>
                <li>Edit changes the console link. It does not move disks.</li>
                <li>Remove shuts the machine down and undefines it. Disk files stay.</li>
                <li>Hardware changes: CPU, memory, extra disks, grow a disk, CD or ISO, add or remove a network card. A filesystem is grown only when the guest is shut off or a guest agent answers. The console says which one happened.</li>
                <li>Open console starts a full-page serial session in a new tab. Allow pop-ups. Click the black area and type. Close the tab when you are finished. Hyper-V does not expose this serial session.</li>
              </ul>
            </section>

            <section id="records" className="scroll-mt-4 space-y-2">
              <h2 className="text-base font-semibold">Other records</h2>
              <p>Services, clusters, hosts, inventory, SAN switches, storage arrays, backup jobs, policies, users, and licenses are records you enter. They are not discovered from a hypervisor. Inventory is the asset list. Each asset has a site, so the site filter applies.</p>
              <p>Networking, monitoring, and service DR pages show the records and probes already configured. They do not create a virtual machine.</p>
            </section>

            <section id="access" className="scroll-mt-4 space-y-2">
              <h2 className="text-base font-semibold">Access</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>Vendor can deploy and change every site.</li>
                <li>Global can change records but cannot deploy a virtual machine.</li>
                <li>Site admin can change only the site selected in the top bar, and cannot create or delete sites.</li>
              </ul>
              <p>Add, edit, and delete ask before they replace or remove a record. Power and remove on a virtual machine also ask, because they change the host.</p>
            </section>

            <section id="tables" className="scroll-mt-4 space-y-2">
              <h2 className="text-base font-semibold">Tables and forms</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>Click a row or its checkbox to select it. The header checkbox selects the rows in view.</li>
                <li>The bar above the table edits one selected row or deletes the selection. Delete asks once.</li>
                <li>Add opens the form. Save on a new name creates the record. Save on a name that already exists asks first.</li>
                <li>The top search box filters the rows on the page you are looking at.</li>
              </ul>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="primary" onClick={() => setView("deployment")}>Open Configuration</Button>
                <Button onClick={() => setView("hypervisors")}>Open Hypervisors</Button>
                <Button onClick={() => setView("instance-ops")}>Open Instance operations</Button>
              </div>
            </section>
          </article>
        </Panel>
      </div>
    </div>
  );
}
