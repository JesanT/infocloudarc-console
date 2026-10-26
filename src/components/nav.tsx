import { useEffect, useState } from "react";
import {
  Activity,
  AppWindow,
  Archive,
  Boxes,
  Database,
  FileBarChart,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  LayoutDashboard,
  Minus,
  Monitor,
  Network,
  Plus,
  Power,
  Receipt,
  Scale,
  ScrollText,
  Server,
  Share2,
  Shield,
  Stethoscope,
  Undo2,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/cloud/model";

type Leaf = { id: string; label: string; icon?: LucideIcon };
type Branch = { id: string; label: string; icon?: LucideIcon; items: NavNode[] };
type NavNode = Leaf | Branch;

const NAV: NavNode[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    id: "computing",
    label: "Computing",
    icon: Server,
    items: [
      { id: "services", label: "Services", icon: Server },
      { id: "applications", label: "Applications", icon: AppWindow },
      { id: "databases", label: "Databases", icon: Database },
      { id: "loadbalancers", label: "Load balancers", icon: Scale },
      { id: "clusters", label: "Clusters", icon: Boxes },
      {
        id: "instances-group",
        label: "Instances",
        icon: Monitor,
        items: [
          { id: "instances", label: "Overview", icon: Monitor },
          { id: "instance-ops", label: "Operations", icon: Power },
        ],
      },
    ],
  },
  {
    id: "networking",
    label: "Networking",
    icon: Network,
    items: [
      { id: "net-discovery", label: "Discovery", icon: Network },
      { id: "net-topology", label: "Topology", icon: Share2 },
      { id: "net-monitoring", label: "Monitoring", icon: Activity },
      { id: "net-diagnostics", label: "Diagnostics", icon: Stethoscope },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    icon: HardDrive,
    items: [
      { id: "san-switches", label: "SAN switches", icon: HardDrive },
      { id: "storage-arrays", label: "Storage arrays", icon: Database },
    ],
  },
  {
    id: "monitoring",
    label: "Monitoring",
    icon: Activity,
    items: [
      { id: "mon-config", label: "Configuration", icon: Activity },
      { id: "mon-site", label: "Site view", icon: Monitor },
      { id: "mon-global", label: "Global view", icon: Globe },
    ],
  },
  {
    id: "backup",
    label: "Backup and restore",
    icon: Shield,
    items: [
      { id: "backup-jobs", label: "Jobs", icon: Shield },
      { id: "backup-repos", label: "Repositories", icon: Archive },
      { id: "backup-restore", label: "Restore", icon: Undo2 },
      { id: "backup-policies", label: "Policies", icon: ScrollText },
    ],
  },
  {
    id: "service-dr",
    label: "Service DR",
    icon: Share2,
    items: [
      {
        id: "dr-application",
        label: "Application",
        icon: AppWindow,
        items: [
          { id: "dr-app-tomcat", label: "Apache Tomcat", icon: AppWindow },
          { id: "dr-app-iis", label: "IIS", icon: Globe },
          { id: "dr-app-other", label: "Other", icon: Boxes },
          { id: "dr-app-all", label: "All", icon: Layers },
        ],
      },
      {
        id: "dr-database",
        label: "Database",
        icon: Database,
        items: [
          { id: "dr-db-mssql", label: "MSSQL Service", icon: Database },
          { id: "dr-db-mysql", label: "MYSQL Service", icon: Database },
          { id: "dr-db-mongodb", label: "Mongodb", icon: Database },
          { id: "dr-db-postgresql", label: "PostgreSQL", icon: Database },
          { id: "dr-db-other", label: "Other", icon: Boxes },
          { id: "dr-db-all", label: "All", icon: Layers },
        ],
      },
      { id: "dr-all", label: "All Services", icon: Layers },
    ],
  },
  {
    id: "iam",
    label: "IAM",
    icon: Users,
    items: [
      { id: "iam-rbac", label: "RBAC", icon: Users },
      { id: "iam-users", label: "Users", icon: Users },
    ],
  },
  {
    id: "licensing-section",
    label: "Licensing",
    icon: KeyRound,
    items: [{ id: "licensing", label: "Licensing", icon: KeyRound }],
  },
  {
    id: "administration",
    label: "Administration",
    icon: Boxes,
    items: [
      { id: "inventory", label: "Inventory", icon: Boxes },
      { id: "repository", label: "Repository", icon: Archive },
      { id: "subscriptions", label: "Subscriptions", icon: Receipt },
      { id: "reports", label: "Reports", icon: FileBarChart },
    ],
  },
];

function isBranch(node: NavNode): node is Branch {
  return "items" in node;
}

function ancestors(nodes: NavNode[], target: string, trail: string[] = []): string[] | null {
  for (const node of nodes) {
    if (!isBranch(node)) {
      if (node.id === target) return trail;
      continue;
    }
    const found = ancestors(node.items, target, [...trail, node.id]);
    if (found) return found;
  }
  return null;
}

function forRole(nodes: NavNode[], role: Role): NavNode[] {
  return nodes.flatMap((node) => {
    if (!isBranch(node)) return role === "site" && node.id === "mon-global" ? [] : [node];
    return [{ ...node, items: forRole(node.items, role) }];
  });
}

export function SideNav({ view, role, onSelect }: { view: string; role: Role; onSelect: (id: string) => void }) {
  const items = forRole(NAV, role);
  const [open, setOpen] = useState<string[]>(() => ancestors(items, view) ?? []);

  useEffect(() => {
    setOpen(ancestors(items, view) ?? []);
  }, [view, role]);

  function toggle(id: string) {
    setOpen((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="space-y-1">
      {items.map((node) => (
        <NavBranch key={node.id} node={node} depth={0} open={open} view={view} onToggle={toggle} onSelect={onSelect} />
      ))}
    </div>
  );
}

function NavBranch({
  node,
  depth,
  open,
  view,
  onToggle,
  onSelect,
}: {
  node: NavNode;
  depth: number;
  open: string[];
  view: string;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const Icon = node.icon;
  const pad = { paddingLeft: `${12 + depth * 12}px` };
  if (!isBranch(node)) {
    const active = view === node.id;
    return (
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        style={pad}
        className={`sidebar-item flex h-11 w-full items-center gap-2 rounded-md pr-3 text-left text-sm ${active ? "sidebar-item-active" : ""}`}
      >
        {Icon ? <Icon className="size-4 shrink-0" /> : <span className="size-4" />}
        <span className="truncate">{node.label}</span>
      </button>
    );
  }
  const expanded = open.includes(node.id);
  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => onToggle(node.id)}
        style={pad}
        className="sidebar-item flex h-11 w-full items-center gap-2 rounded-md pr-2 text-left text-sm font-medium"
      >
        {Icon ? <Icon className="size-4 shrink-0" /> : <span className="size-4" />}
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
        <span className="relative size-4 shrink-0" aria-hidden="true">
          <Plus className={`absolute inset-0 size-4 transition-opacity duration-200 ${expanded ? "opacity-0" : "opacity-100"}`} />
          <Minus className={`absolute inset-0 size-4 transition-opacity duration-200 ${expanded ? "opacity-100" : "opacity-0"}`} />
        </span>
      </button>
      <div className={`nav-panel ${expanded ? "is-open" : ""}`}>
        <div className="nav-panel-inner">
          <div className="space-y-0.5 pb-1">
            {node.items.map((child) => (
              <NavBranch key={child.id} node={child} depth={depth + 1} open={open} view={view} onToggle={onToggle} onSelect={onSelect} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
