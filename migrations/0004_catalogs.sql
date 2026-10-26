-- Catalogs the screens still treated as fixed lists.

create table if not exists san_switches (
  name text primary key,
  site text not null,
  vendor text not null,
  ports integer not null,
  status text not null,
  note text not null
);

create table if not exists storage_arrays (
  name text primary key,
  site text not null,
  kind text not null,
  usable text not null,
  used_pct integer not null,
  status text not null
);

create table if not exists operators (
  name text primary key,
  role text not null,
  sites text not null,
  auth text not null,
  status text not null
);

create table if not exists backup_targets (
  id text primary key,
  name text not null,
  site text not null,
  free_space text not null,
  status text not null
);

create table if not exists restore_points (
  id text primary key,
  workload text not null,
  points integer not null,
  latest text not null,
  site text not null
);

create table if not exists backup_policies (
  id text primary key,
  name text not null,
  retention text not null,
  copy_to text not null,
  scope text not null
);

create table if not exists monitor_collectors (
  id text primary key,
  name text not null,
  scope text not null,
  interval text not null,
  status text not null
);

insert into san_switches (name, site, vendor, ports, status, note) values
  ('SAN-SW-East-01', 'east', 'Brocade', 64, 'Online', 'All ports healthy'),
  ('SAN-SW-West-01', 'west', 'Cisco MDS', 48, 'Degraded', '2 ports flapping'),
  ('SAN-SW-Central-01', 'central', 'Brocade', 48, 'Online', 'Healthy')
on conflict (name) do nothing;

insert into storage_arrays (name, site, kind, usable, used_pct, status) values
  ('Array-A', 'east', 'All-flash', '120 TB', 68, 'Online'),
  ('Array-B', 'west', 'Hybrid', '240 TB', 45, 'Online'),
  ('Array-C', 'central', 'All-flash', '80 TB', 81, 'Degraded')
on conflict (name) do nothing;

insert into operators (name, role, sites, auth, status) values
  ('vendor.admin', 'Vendor', 'All', 'Local', 'Active'),
  ('global.ops', 'Global', 'All', 'Active Directory', 'Active'),
  ('site.east.eng', 'Site', 'Site-East', 'Local', 'Active'),
  ('site.west.ops', 'Site', 'Site-West', 'Active Directory', 'Active')
on conflict (name) do nothing;

insert into backup_targets (id, name, site, free_space, status) values
  ('repo-east-perf', 'repo-east-perf', 'east', '18 TB free', 'Online'),
  ('repo-west-cap', 'repo-west-cap', 'west', '42 TB free', 'Online'),
  ('repo-central-dr', 'repo-central-dr', 'central', '6 TB free', 'Warning')
on conflict (id) do nothing;

insert into restore_points (id, workload, points, latest, site) values
  ('rp-web', 'web-prod-01', 14, '2 h ago', 'east'),
  ('rp-db', 'db-primary', 48, '45 min ago', 'east'),
  ('rp-file', 'file-share', 8, '1 d ago', 'west')
on conflict (id) do nothing;

insert into backup_policies (id, name, retention, copy_to, scope) values
  ('pol-gold', 'Gold-VM', '30 daily / 12 monthly', 'Central DR', 'All sites'),
  ('pol-db', 'Database', '14 daily + logs', 'West replica', 'East, West'),
  ('pol-file', 'File', '8 weekly', 'None', 'West')
on conflict (id) do nothing;

insert into monitor_collectors (id, name, scope, interval, status) values
  ('col-node', 'node-exporter', 'All compute', '15s', 'Active'),
  ('col-snmp', 'snmp-fabric', 'Network + SAN', '30s', 'Active'),
  ('col-backup', 'backup-jobs', 'Backup servers', '60s', 'Active')
on conflict (id) do nothing;
