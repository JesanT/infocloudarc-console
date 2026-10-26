import { Dashboard } from "@/components/views/dashboard";
import { ClustersView, DatabasesView, InstanceOpsView, InstancesView, LoadBalancersView, ServicesView } from "@/components/views/compute";
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
import { ServiceDrView } from "@/components/views/service-dr";
import { Panel } from "@/components/ui";
import type { AppKind, DbKind } from "@/lib/cloud/dr";

export function View({ id }: { id: string }) {
  switch (id) {
    case "dashboard":
      return <Dashboard />;
    case "services":
      return <ServicesView />;
    case "databases":
      return <DatabasesView />;
    case "loadbalancers":
      return <LoadBalancersView />;
    case "clusters":
      return <ClustersView />;
    case "instances":
      return <InstancesView />;
    case "instance-ops":
      return <InstanceOpsView />;
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
    case "dr-all":
      return <ServiceDrView focus={{ domain: "all" }} />;
    case "dr-app-tomcat":
    case "dr-app-iis":
    case "dr-app-other":
    case "dr-app-all":
      return <ServiceDrView focus={{ domain: "app", kind: id.replace("dr-app-", "") as AppKind | "all" }} />;
    case "dr-db-mssql":
    case "dr-db-mysql":
    case "dr-db-mongodb":
    case "dr-db-postgresql":
    case "dr-db-other":
    case "dr-db-all":
      return <ServiceDrView focus={{ domain: "db", kind: id.replace("dr-db-", "") as DbKind | "all" }} />;
    default:
      return <Panel title="Unknown view">That section is not available.</Panel>;
  }
}
