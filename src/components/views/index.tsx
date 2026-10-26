import { Dashboard } from "@/components/views/dashboard";
import { ClustersView, InstancesView, KindView, ServicesView } from "@/components/views/compute";
import {
  BackupJobs,
  BackupRepos,
  LicensingView,
  MonitorConfig,
  MonitorView,
  NetworkView,
  PoliciesView,
  RbacView,
  RestoreView,
  StorageView,
  UsersView,
} from "@/components/views/platform";
import { InventoryView } from "@/components/views/inventory";
import { ReportsView, RepositoryView, SubscriptionsView } from "@/components/views/admin";
import { Panel } from "@/components/ui";

export function View({ id }: { id: string }) {
  switch (id) {
    case "dashboard":
      return <Dashboard />;
    case "services":
      return <ServicesView />;
    case "databases":
      return <KindView kind="Database" title="Databases" />;
    case "loadbalancers":
      return <KindView kind="Load Balancer" title="Load balancers" />;
    case "clusters":
      return <ClustersView />;
    case "instances":
      return <InstancesView />;
    case "net-discovery":
      return <NetworkView mode="discovery" />;
    case "net-topology":
      return <NetworkView mode="topology" />;
    case "net-monitoring":
      return <NetworkView mode="monitoring" />;
    case "net-diagnostics":
      return <NetworkView mode="diagnostics" />;
    case "san-switches":
      return <StorageView kind="san" />;
    case "storage-arrays":
      return <StorageView kind="array" />;
    case "mon-config":
      return <MonitorConfig />;
    case "mon-site":
      return <MonitorView global={false} />;
    case "mon-global":
      return <MonitorView global />;
    case "backup-jobs":
      return <BackupJobs />;
    case "backup-repos":
      return <BackupRepos />;
    case "backup-restore":
      return <RestoreView />;
    case "backup-policies":
      return <PoliciesView />;
    case "iam-rbac":
      return <RbacView />;
    case "iam-users":
      return <UsersView />;
    case "licensing":
      return <LicensingView />;
    case "inventory":
      return <InventoryView />;
    case "repository":
      return <RepositoryView />;
    case "subscriptions":
      return <SubscriptionsView />;
    case "reports":
      return <ReportsView />;
    default:
      return <Panel title="Unknown view">That section is not available.</Panel>;
  }
}
