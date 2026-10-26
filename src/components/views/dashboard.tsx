import { Kpi, Panel, StatusPill } from "@/components/ui";
import { Trend } from "@/components/charts";
import { isPolled } from "@/lib/cloud/fabric";
import {
  activityVisible,
  boundSite,
  inScope,
  operatorVisible,
  siteLabel,
} from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";

const TREND = [
  { label: "00", a: 32, b: 55 },
  { label: "04", a: 28, b: 58 },
  { label: "08", a: 45, b: 65 },
  { label: "12", a: 62, b: 72 },
  { label: "16", a: 55, b: 68 },
  { label: "20", a: 48, b: 60 },
];

const WORST = ["Critical", "Offline", "Failed", "Degraded", "Warning", "Expiring", "Trial", "stopped"];

function worst(statuses: string[]): string {
  for (const status of WORST) {
    if (statuses.includes(status)) return status === "stopped" ? "Critical" : status === "Degraded" || status === "Trial" || status === "Expiring" ? "Warning" : status;
  }
  return "Healthy";
}

export function Dashboard() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const setView = useCloud((s) => s.setView);
  const activity = useCloud((s) => s.activity);
  const alerts = useCloud((s) => s.alerts);
  const instances = useCloud((s) => s.instances).filter((item) => inScope(role, site, item.site));
  const inventory = useCloud((s) => s.inventory).filter((item) => inScope(role, site, item.site));
  const templates = useCloud((s) => s.deployTemplates).filter((item) => inScope(role, site, item.site));
  const hypervisors = useCloud((s) => s.hypervisors).filter((item) => inScope(role, site, item.site));
  const repositories = useCloud((s) => s.repositories).filter((item) => inScope(role, site, item.site));
  const subscriptions = useCloud((s) => s.subscriptions).filter((item) => inScope(role, site, item.site));
  const ports = useCloud((s) => s.ports).filter((port) => inventory.some((item) => item.id === port.assetId));
  const services = useCloud((s) => s.services).filter((item) => inScope(role, site, item.site));
  const clusters = useCloud((s) => s.clusters).filter((item) => inScope(role, site, item.site));
  const san = useCloud((s) => s.switches).filter((item) => inScope(role, site, item.site));
  const arrays = useCloud((s) => s.arrays).filter((item) => inScope(role, site, item.site));
  const jobs = useCloud((s) => s.backups).filter((item) => inScope(role, site, item.site));
  const reports = useCloud((s) => s.reports);
  const targets = useCloud((s) => s.backupTargets).filter((item) => inScope(role, site, item.site));
  const users = useCloud((s) => s.operators).filter((user) => operatorVisible(user.sites, role, site));
  const visibleAlerts = alerts.filter((item) => inventory.some((asset) => asset.id === item.assetId));
  const activityRows = activity.filter((item) => activityVisible(item.text, role, site));
  const viewing = boundSite(role, site);

  const running = instances.filter((item) => item.status === "running");
  const databases = instances.filter((item) => item.kind === "Database");
  const balancers = instances.filter((item) => item.kind === "Load Balancer");
  const network = inventory.filter(isPolled);
  const portsUp = ports.filter((port) => port.oper === "up").length;
  const portsDown = ports.length - portsUp;
  const offline = inventory.filter((item) => item.status === "Offline").length;
  const degradedAssets = inventory.filter((item) => item.status === "Degraded").length;
  const jobWarnings = jobs.filter((item) => item.status !== "Success").length;
  const licenseWatch = subscriptions.filter((item) => item.status !== "Active");
  const repoWatch = repositories.filter((item) => item.status !== "Healthy").length;
  const sitesInView = viewing === "all" ? 3 : 1;
  const attention = [
    ...instances.filter((item) => item.status !== "running").map((item) => `${item.name} is stopped`),
    ...inventory.filter((item) => item.status !== "Online").map((item) => `${item.name} is ${item.status.toLowerCase()}`),
    ...jobs.filter((item) => item.status !== "Success").map((item) => `${item.job} backup ${item.status.toLowerCase()}`),
    ...licenseWatch.map((item) => `${item.module} license ${item.status.toLowerCase()} (${siteLabel(item.site)})`),
    ...visibleAlerts.slice(0, 3).map((item) => item.message),
  ].slice(0, 6);

  const overall = worst([
    ...inventory.map((item) => item.status),
    ...jobs.map((item) => item.status),
    ...clusters.map((item) => item.ha),
    ...san.map((item) => item.status),
    ...arrays.map((item) => item.status),
    ...subscriptions.map((item) => item.status),
    ...instances.map((item) => item.status),
  ]);

  const groups: Array<{ title: string; rows: Array<[string, string, string, string]> }> = [
    {
      title: "Computing",
      rows: [
        ["services", "Services", `${services.length} published`, worst(services.map((item) => item.health))],
        ["databases", "Databases", `${databases.filter((item) => item.status === "running").length}/${databases.length} running`, databases.some((item) => item.cpu >= 75) ? "Warning" : "Healthy"],
        ["loadbalancers", "Load balancers", `${balancers.filter((item) => item.status === "running").length} active`, balancers.length ? "Healthy" : "Warning"],
        ["clusters", "Clusters", `${clusters.reduce((sum, item) => sum + item.nodes, 0)} nodes`, worst(clusters.map((item) => item.ha))],
        ["instances", "Instances", `${running.length}/${instances.length} running`, instances.some((item) => item.status !== "running") ? "Warning" : "Healthy"],
      ],
    },
    {
      title: "Networking",
      rows: [
        ["net-discovery", "Discovery", `${network.length} enrolled`, network.length ? "Healthy" : "Warning"],
        ["net-topology", "Topology", `${network.filter((item) => item.parentId).length} links`, worst(network.map((item) => item.status))],
        ["net-monitoring", "Monitoring", `${portsUp} up / ${portsDown} down`, portsDown > 0 ? "Warning" : "Healthy"],
        ["net-diagnostics", "Diagnostics", visibleAlerts.length ? `${visibleAlerts.length} open` : "No open alerts", visibleAlerts.some((item) => item.severity === "major") ? "Critical" : visibleAlerts.length ? "Warning" : "Healthy"],
      ],
    },
    {
      title: "Storage",
      rows: [
        ["san-switches", "SAN switches", `${san.length} fabrics`, worst(san.map((item) => item.status))],
        ["storage-arrays", "Arrays", arrays.length ? `${Math.round(arrays.reduce((sum, item) => sum + item.used, 0) / arrays.length)}% used` : "None", worst(arrays.map((item) => item.status))],
      ],
    },
    {
      title: "Monitoring",
      rows: [
        ["mon-config", "Configuration", "Collectors, 15–60s", "Active"],
        ["mon-site", "Site view", viewing === "all" ? "3 sites" : siteLabel(viewing), "Healthy"],
        ...(role === "site" ? [] : [["mon-global", "Global view", viewing === "all" ? "All sites" : siteLabel(viewing), "Healthy"] as [string, string, string, string]]),
      ],
    },
    {
      title: "Backup and restore",
      rows: [
        ["backup-jobs", "Jobs", `${jobs.length - jobWarnings} success, ${jobWarnings} warning`, jobWarnings ? "Warning" : "Healthy"],
        ["backup-repos", "Repositories", targets.length ? targets.map((item) => item.name).join(", ") : "None", targets.some((item) => item.status !== "Online") ? "Warning" : "Healthy"],
        ["backup-restore", "Restore", "14–48 recovery points", "Healthy"],
        ["backup-policies", "Policies", "Gold, database, file", "Healthy"],
      ],
    },
    {
      title: "IAM",
      rows: [
        ["iam-rbac", "RBAC", `${role === "site" ? "Own site" : "Site, global, vendor"}`, "Active"],
        ["iam-users", "Users", `${users.length} accounts`, "Active"],
      ],
    },
    {
      title: "Licensing",
      rows: [
        ["licensing", "Site licenses", `${subscriptions.filter((item) => item.scope === "Site").length} in view`, worst(subscriptions.filter((item) => item.scope === "Site").map((item) => item.status))],
        ...(role === "site" ? [] : [["licensing", "Global license", subscriptions.some((item) => item.scope === "Global" && item.status === "Active") ? "Multi-site entitled" : "Check coverage", "Healthy"] as [string, string, string, string]]),
        ["subscriptions", "Module licenses", `${subscriptions.length} modules`, worst(subscriptions.map((item) => item.status))],
      ],
    },
    {
      title: "Administration",
      rows: [
        ["hypervisors", "Hypervisors", `${hypervisors.length} registered, ${hypervisors.filter((item) => item.kind === "libvirt").length} libvirt`, hypervisors.some((item) => item.status === "Offline") ? "Warning" : "Healthy"],
        ["deployment", "Deployment", `${templates.length} templates`, "Healthy"],
        ["inventory", "Inventory", `${inventory.length} assets, ${offline} offline`, offline ? "Critical" : degradedAssets ? "Warning" : "Healthy"],
        ["repository", "Repository", `${repositories.length} catalogs`, repoWatch ? "Warning" : "Healthy"],
        ["subscriptions", "Subscriptions", `${licenseWatch.length} need review`, licenseWatch.length ? "Warning" : "Healthy"],
        ["reports", "Reports", `${reports.length} scheduled`, "Healthy"],
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-[0_10px_28px_rgba(232,93,4,0.06)]">
        <div>
          <div className="text-xs font-medium tracking-wide text-accent uppercase">Global status</div>
          <p className="mt-1 text-sm text-ink">
            {sitesInView} {sitesInView === 1 ? "site" : "sites"} in view. {running.length} of {instances.length} instances running. {jobWarnings} backup warning{jobWarnings === 1 ? "" : "s"}. {licenseWatch.length} license{licenseWatch.length === 1 ? "" : "s"} need review.
          </p>
        </div>
        <StatusPill value={overall === "Healthy" ? "Healthy" : overall} />
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Instances" value={`${running.length}/${instances.length}`} hint="Running" />
        <Kpi label="Assets" value={String(inventory.length)} hint={`${degradedAssets} degraded`} />
        <Kpi label="Network" value={String(network.length)} hint={`${portsDown} ports down`} />
        <Kpi label="Storage" value={`${arrays.length}`} hint={arrays.some((item) => item.used >= 75) ? "Capacity watch" : "Within plan"} />
        <Kpi label="Backups" value={String(jobs.length)} hint={`${jobWarnings} warning`} />
        <Kpi label="Licenses" value={String(subscriptions.length)} hint={`${licenseWatch.length} expiring or trial`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Compute" subtitle="Six-hour sample, not a full trace">
          <Trend data={TREND} aLabel="CPU %" bLabel="Memory %" />
          <p className="mt-2 text-xs text-faint">Peak CPU {Math.max(...instances.map((item) => item.cpu), 0)}% · peak memory {Math.max(...instances.map((item) => item.mem), 0)}%</p>
        </Panel>
        <Panel title="Capacity" subtitle="Array used percent">
          <div className="space-y-3">
            {arrays.map((item) => (
              <div key={item.name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span>{item.name}</span>
                  <span className="font-mono text-faint">{item.used}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-inset">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#ffb070] to-[#e85d04]" style={{ width: `${item.used}%` }} />
                </div>
              </div>
            ))}
            {arrays.length === 0 && <p className="text-sm text-muted">No arrays in this view.</p>}
          </div>
        </Panel>
        <Panel title="Protection" subtitle="Jobs in the current view">
          <div className="flex h-2 overflow-hidden rounded-full bg-inset">
            <div className="bg-[#157a45]" style={{ width: `${jobs.length ? ((jobs.length - jobWarnings) / jobs.length) * 100 : 0}%` }} />
            <div className="bg-[#e85d04]" style={{ width: `${jobs.length ? (jobWarnings / jobs.length) * 100 : 0}%` }} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div><dt className="text-xs text-faint">Success</dt><dd className="font-mono text-lg">{jobs.length - jobWarnings}</dd></div>
            <div><dt className="text-xs text-faint">Warning</dt><dd className="font-mono text-lg">{jobWarnings}</dd></div>
            <div><dt className="text-xs text-faint">Failed</dt><dd className="font-mono text-lg">0</dd></div>
          </dl>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <Panel key={group.title} title={group.title}>
            <div className="divide-y divide-line">
              {group.rows.map(([id, label, value, status]) => (
                <button key={`${group.title}-${label}`} type="button" onClick={() => setView(id)} className="flex h-11 w-full items-center gap-3 text-left">
                  <span className="w-36 shrink-0 text-sm font-medium">{label}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">{value}</span>
                  <StatusPill value={status} />
                </button>
              ))}
            </div>
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Needs attention">
          {attention.length === 0 ? (
            <p className="text-sm text-muted">Nothing outside normal in this view.</p>
          ) : (
            <ul className="space-y-2">
              {attention.map((item) => (
                <li key={item} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{item}</span>
                  <StatusPill value={/offline|stopped|critical/i.test(item) ? "Critical" : "Warning"} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Recent activity">
          <ul className="space-y-3">
            {activityRows.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                <span>{item.text}</span>
                <span className="shrink-0 font-mono text-xs text-faint">{item.when}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-faint">Sites: {viewing === "all" ? "Site-East · Site-West · Site-Central" : siteLabel(viewing)}</p>
        </Panel>
      </div>
    </div>
  );
}
