import { Kpi, Panel, StatusPill } from "@/components/ui";
import { Trend } from "@/components/charts";
import { inScope, siteLabel } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";

const TREND = [
  { label: "00", a: 32, b: 55 },
  { label: "04", a: 28, b: 58 },
  { label: "08", a: 45, b: 65 },
  { label: "12", a: 62, b: 72 },
  { label: "16", a: 55, b: 68 },
  { label: "20", a: 48, b: 60 },
];

export function Dashboard() {
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const instances = useCloud((s) => s.instances);
  const activity = useCloud((s) => s.activity);
  const setView = useCloud((s) => s.setView);
  const visible = instances.filter((item) => inScope(role, site, item.site));
  const running = visible.filter((item) => item.status === "running").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Instances" value={String(visible.length)} hint={`${running} running`} />
        <Kpi label="Sites in view" value={role === "site" || site !== "all" ? "1" : "3"} hint={siteLabel(role === "site" ? "east" : site)} />
        <Kpi label="Backup jobs" value="24" hint="2 warnings" />
        <Kpi label="Open alerts" value="7" hint="3 critical" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Utilization" subtitle="CPU and memory across the current view">
          <Trend data={TREND} aLabel="CPU %" bLabel="Memory %" />
        </Panel>
        <Panel title="Recent activity">
          <ul className="space-y-3">
            {activity.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                <span>{item.text}</span>
                <span className="shrink-0 font-mono text-xs text-faint">{item.when}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Administration" subtitle="Inventory, content repositories, subscriptions, and reports">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["inventory", "Inventory", "Assets across sites"],
            ["repository", "Repository", "Images, packages, catalogs"],
            ["subscriptions", "Subscriptions", "Module renewals"],
            ["reports", "Reports", "Run and export"],
          ].map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className="rounded-lg border border-line bg-inset px-3 py-3 text-left hover:border-line-strong"
            >
              <div className="text-sm font-medium">{label}</div>
              <div className="mt-1 text-xs text-muted">{hint}</div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Alerts">
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between gap-3">
            <span>High CPU on db-primary</span>
            <StatusPill value="Critical" />
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>DR replication lag</span>
            <StatusPill value="Warning" />
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Array-C capacity</span>
            <StatusPill value="Warning" />
          </li>
        </ul>
      </Panel>
    </div>
  );
}
