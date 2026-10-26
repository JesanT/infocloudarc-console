import { useEffect } from "react";
import {
  Activity,
  Archive,
  Boxes,
  Database,
  FileBarChart,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Menu,
  Network,
  Receipt,
  Search,
  Server,
  Shield,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ROLE_LABEL, SITES, VIEW_TITLES, siteLabel, type Role, type SiteFilter } from "@/lib/cloud/model";
import { useCloud } from "@/lib/cloud/store";
import { View } from "@/components/views";
import { Select } from "@/components/ui";

type Item = { id: string; label: string; icon?: LucideIcon };

const GROUPS: Array<{ label?: string; items: Item[] }> = [
  { items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Computing",
    items: [
      { id: "services", label: "Services", icon: Server },
      { id: "databases", label: "Databases", icon: Database },
      { id: "loadbalancers", label: "Load balancers" },
      { id: "clusters", label: "Clusters" },
      { id: "instances", label: "Instances" },
    ],
  },
  {
    label: "Networking",
    items: [
      { id: "net-discovery", label: "Discovery", icon: Network },
      { id: "net-topology", label: "Topology" },
      { id: "net-monitoring", label: "Monitoring" },
      { id: "net-diagnostics", label: "Diagnostics" },
    ],
  },
  {
    label: "Storage",
    items: [
      { id: "san-switches", label: "SAN switches", icon: HardDrive },
      { id: "storage-arrays", label: "Storage arrays" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { id: "mon-config", label: "Configuration", icon: Activity },
      { id: "mon-site", label: "Site view" },
      { id: "mon-global", label: "Global view" },
    ],
  },
  {
    label: "Backup and restore",
    items: [
      { id: "backup-jobs", label: "Jobs", icon: Shield },
      { id: "backup-repos", label: "Repositories" },
      { id: "backup-restore", label: "Restore" },
      { id: "backup-policies", label: "Policies" },
    ],
  },
  {
    label: "IAM",
    items: [
      { id: "iam-rbac", label: "RBAC", icon: Users },
      { id: "iam-users", label: "Users" },
    ],
  },
  { items: [{ id: "licensing", label: "Licensing", icon: KeyRound }] },
  {
    label: "Administration",
    items: [
      { id: "inventory", label: "Inventory", icon: Boxes },
      { id: "repository", label: "Repository", icon: Archive },
      { id: "subscriptions", label: "Subscriptions", icon: Receipt },
      { id: "reports", label: "Reports", icon: FileBarChart },
    ],
  },
];

export function AppShell() {
  const view = useCloud((s) => s.view);
  const role = useCloud((s) => s.role);
  const site = useCloud((s) => s.site);
  const query = useCloud((s) => s.query);
  const navOpen = useCloud((s) => s.navOpen);
  const notice = useCloud((s) => s.notice);
  const setView = useCloud((s) => s.setView);
  const setRole = useCloud((s) => s.setRole);
  const setSite = useCloud((s) => s.setSite);
  const setQuery = useCloud((s) => s.setQuery);
  const setNavOpen = useCloud((s) => s.setNavOpen);

  useEffect(() => {
    const id = window.setInterval(() => useCloud.getState().poll(), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex h-dvh bg-canvas text-ink">
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-20 bg-canvas/70 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside
        className={`nav-slide fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-line bg-panel transition-transform duration-200 md:static md:w-64 md:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <div className="text-xs tracking-widest text-faint uppercase">Private cloud</div>
            <div className="text-lg font-medium">Infocloudarc</div>
          </div>
          <button type="button" className="md:hidden" aria-label="Close menu" onClick={() => setNavOpen(false)}>
            <X className="size-5" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-6">
          {GROUPS.map((group) => (
            <div key={group.label ?? group.items[0].id}>
              {group.label && (
                <div className="px-3 pb-1 text-xs font-medium tracking-wide text-faint uppercase">{group.label}</div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setView(item.id)}
                      className={`flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm ${active ? "bg-inset text-ink" : "text-muted hover:bg-inset hover:text-ink"}`}
                    >
                      {Icon ? <Icon className="size-4 shrink-0" /> : <span className="size-4" />}
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 md:px-6">
          <button type="button" className="inline-flex size-11 items-center justify-center md:hidden" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-faint">{siteLabel(role === "site" ? "east" : site)}</div>
            <h1 className="truncate text-lg font-medium">{VIEW_TITLES[view] ?? "Infocloudarc"}</h1>
          </div>
          <label className="relative order-last w-full sm:order-none sm:w-56">
            <Search className="pointer-events-none absolute top-3 left-3 size-4 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter this view"
              className="h-11 w-full rounded-md border border-line bg-inset pr-3 pl-9 text-sm outline-none placeholder:text-faint sm:w-56"
            />
          </label>
          <Select
            aria-label="Site"
            value={role === "site" ? "east" : site}
            disabled={role === "site"}
            onChange={(event) => setSite(event.target.value as SiteFilter)}
          >
            <option value="all">All sites</option>
            {SITES.map((item) => (
              <option key={item.id} value={item.id}>{siteLabel(item.id)}</option>
            ))}
          </Select>
          <Select aria-label="Access role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="vendor">{ROLE_LABEL.vendor}</option>
            <option value="global">{ROLE_LABEL.global}</option>
            <option value="site">{ROLE_LABEL.site}</option>
          </Select>
        </header>
        <main className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-6">
          <div key={view} className="enter mx-auto max-w-6xl">
            <View id={view} />
          </div>
        </main>
      </div>

      {notice && (
        <div role="status" className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-line bg-panel px-4 py-2 text-sm shadow-none">
          {notice}
        </div>
      )}
    </div>
  );
}
