-- Operational tables for the console. One row per thing the screens show.
-- console_state remains only as the previous document, used once to fill these tables.

create table if not exists sites (
  id text primary key,
  name text not null,
  code text not null
);

create table if not exists console_settings (
  id text primary key,
  role text not null,
  site_filter text not null,
  app_subnet text not null default '',
  app_address text not null default '',
  extra_subnets jsonb not null default '[]'::jsonb,
  poll_tick integer not null default 0,
  last_poll_at bigint not null default 0,
  snmp_version text not null,
  snmp_v1 text not null default '',
  snmp_v2c text not null default '',
  snmp_v3_user text not null default '',
  snmp_v3_auth text not null default '',
  snmp_v3_priv text not null default '',
  notify_email text not null default '',
  notify_mobile text not null default ''
);

create table if not exists instances (
  id text primary key,
  name text not null,
  site text not null,
  status text not null,
  cpu integer not null,
  mem integer not null,
  ip text not null,
  kind text not null,
  os text not null,
  in_mbps integer,
  out_mbps integer,
  connections integer
);

create table if not exists inventory_assets (
  id text primary key,
  name text not null,
  category text not null,
  site text not null,
  vendor text not null,
  model text not null,
  serial text not null,
  status text not null,
  location text not null,
  owner text not null,
  ip text not null default '',
  mac text not null default '',
  device_type text not null,
  subnet text not null default '',
  source text not null,
  last_poll text not null default '',
  snmp_version text not null,
  librenms_id text not null default '',
  uptime text not null default '',
  traffic_in_mbps double precision not null default 0,
  traffic_out_mbps double precision not null default 0,
  ports_up integer not null default 0,
  ports_down integer not null default 0,
  sys_descr text not null default '',
  parent_id text not null default ''
);

create table if not exists net_ports (
  id text primary key,
  asset_id text not null references inventory_assets (id) on delete cascade,
  name text not null,
  if_index integer not null,
  admin text not null,
  oper text not null,
  speed text not null,
  in_mbps double precision not null default 0,
  out_mbps double precision not null default 0,
  errors integer not null default 0,
  face text not null,
  port_group text not null default '',
  down_since bigint,
  alarm_ack boolean not null default false
);

create table if not exists net_alerts (
  id text primary key,
  severity text not null,
  asset_id text not null,
  message text not null,
  at text not null,
  channel text not null
);

create table if not exists net_events (
  id text primary key,
  asset_id text not null,
  message text not null,
  at text not null
);

create table if not exists content_repositories (
  id text primary key,
  name text not null,
  kind text not null,
  site text not null,
  capacity_tb double precision not null,
  used_pct integer not null,
  status text not null,
  last_sync text not null,
  objects integer not null
);

create table if not exists subscriptions (
  id text primary key,
  module text not null,
  scope text not null,
  site text not null,
  plan text not null,
  seats text not null,
  status text not null,
  renews text not null,
  annual text not null
);

create table if not exists activity_log (
  id text primary key,
  text text not null,
  at text not null
);

create table if not exists compute_services (
  name text primary key,
  site text not null,
  health text not null,
  instances integer not null,
  availability double precision not null,
  performance double precision not null,
  note text not null
);

create table if not exists compute_clusters (
  name text primary key,
  site text not null,
  nodes integer not null,
  ha text not null,
  version text not null,
  availability double precision not null,
  performance double precision not null
);

create table if not exists backup_jobs (
  id text primary key,
  job text not null,
  job_type text not null,
  status text not null,
  last_run text not null,
  size text not null,
  site text not null
);

create table if not exists report_defs (
  id text primary key,
  name text not null,
  cadence text not null,
  audience text not null,
  description text not null
);

create table if not exists dr_services (
  id text primary key,
  name text not null,
  site text not null,
  standby_site text not null,
  tier text not null,
  status text not null,
  mode text not null,
  rpo text not null,
  rto text not null,
  owner text not null
);

create table if not exists dr_hosts (
  id text primary key,
  name text not null,
  site text not null,
  pair text not null,
  status text not null,
  cpu integer not null,
  mem integer not null,
  ip text not null
);

create table if not exists dr_clusters (
  id text primary key,
  name text not null,
  site text not null,
  kind text not null,
  nodes integer not null,
  status text not null
);

create table if not exists dr_vms (
  id text primary key,
  name text not null,
  host_id text not null references dr_hosts (id),
  cluster_id text not null references dr_clusters (id),
  site text not null,
  status text not null,
  cpu integer not null,
  mem integer not null,
  ip text not null
);

create table if not exists dr_apps (
  id text primary key,
  name text not null,
  kind text not null,
  service_id text not null references dr_services (id),
  vm_id text not null references dr_vms (id),
  port integer not null,
  status text not null
);

create table if not exists dr_databases (
  id text primary key,
  name text not null,
  engine text not null,
  service_id text not null references dr_services (id),
  vm_id text not null references dr_vms (id),
  replica text not null,
  status text not null
);

create table if not exists dr_workflows (
  id text primary key,
  service_id text not null references dr_services (id),
  name text not null,
  mode text not null,
  steps jsonb not null,
  last_run text not null,
  status text not null
);

create table if not exists dr_performance (
  id text primary key,
  target text not null,
  kind text not null,
  metric text not null,
  value text not null,
  at text not null
);

create table if not exists dr_events (
  id text primary key,
  target text not null,
  message text not null,
  at text not null,
  severity text not null
);

create table if not exists dr_alerts (
  id text primary key,
  target text not null,
  message text not null,
  severity text not null,
  state text not null
);

create table if not exists dr_audit (
  id text primary key,
  actor text not null,
  action text not null,
  target text not null,
  at text not null
);

create index if not exists instances_site_idx on instances (site);
create index if not exists inventory_site_idx on inventory_assets (site);
create index if not exists inventory_type_idx on inventory_assets (device_type);
create index if not exists net_ports_asset_idx on net_ports (asset_id);
create index if not exists dr_apps_service_idx on dr_apps (service_id);
create index if not exists dr_databases_service_idx on dr_databases (service_id);
create index if not exists dr_vms_host_idx on dr_vms (host_id);

insert into sites (id, name, code) values
  ('east', 'Site-East', 'DC1'),
  ('west', 'Site-West', 'DC2'),
  ('central', 'Site-Central', 'DC3')
on conflict (id) do nothing;

insert into compute_services (name, site, health, instances, availability, performance, note) values
  ('edge-gateway', 'east', 'Healthy', 2, 99.98, 97, 'Public ingress'),
  ('app-api', 'east', 'Healthy', 4, 99.95, 93, 'Stateless API'),
  ('identity', 'central', 'Healthy', 2, 99.99, 96, 'Local + AD'),
  ('metrics', 'west', 'Degraded', 1, 98.4, 71, 'Scrape lag')
on conflict (name) do nothing;

insert into compute_clusters (name, site, nodes, ha, version, availability, performance) values
  ('east-compute', 'east', 12, 'Healthy', 'Hyper-V 2022', 99.99, 94),
  ('west-compute', 'west', 8, 'Healthy', 'Hyper-V 2022', 99.95, 92),
  ('central-dr', 'central', 6, 'Degraded', 'Hyper-V 2019', 98.1, 74)
on conflict (name) do nothing;

insert into backup_jobs (id, job, job_type, status, last_run, size, site) values
  ('daily-vm', 'Daily-VM-Backup', 'Full', 'Success', '2 h ago', '1.2 TB', 'east'),
  ('db-incremental', 'DB-Incremental', 'Incremental', 'Warning', '45 min ago', '340 GB', 'east'),
  ('file-share', 'File-Share-Weekly', 'Full', 'Success', '1 d ago', '890 GB', 'west'),
  ('dr-replication', 'DR-Replication', 'Continuous', 'Warning', '10 min ago', '2.1 TB', 'central')
on conflict (id) do nothing;

insert into report_defs (id, name, cadence, audience, description) values
  ('rpt-inventory', 'Asset inventory', 'Weekly', 'Site and global', 'Hardware and software assets by site, owner, and status.'),
  ('rpt-capacity', 'Capacity and utilization', 'Daily', 'Global', 'Compute, storage, and repository headroom across sites.'),
  ('rpt-backup', 'Backup compliance', 'Daily', 'Site and global', 'Job outcomes, last success, and unprotected workloads.'),
  ('rpt-subs', 'Subscription utilization', 'Monthly', 'Vendor', 'Module subscriptions, renewal dates, and seat use.'),
  ('rpt-audit', 'Audit activity', 'On demand', 'Global', 'Operator actions: power, deploy, sync, and renewals.')
on conflict (id) do nothing;
