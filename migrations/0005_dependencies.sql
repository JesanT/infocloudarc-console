-- Service -> application and/or database -> virtual machine and/or physical host.

create table if not exists physical_hosts (
  id text primary key,
  name text not null unique,
  site text not null,
  cluster_name text references compute_clusters (name),
  status text not null,
  cpu integer not null default 0,
  mem integer not null default 0,
  ip text not null default ''
);

alter table instances add column if not exists host_id text;
alter table instances add column if not exists cluster_name text;

create table if not exists workload_apps (
  id text primary key,
  name text not null,
  kind text not null,
  service_name text not null references compute_services (name) on delete cascade,
  vm_id text references instances (id),
  host_id text references physical_hosts (id),
  port integer not null default 0,
  status text not null,
  constraint workload_apps_target check (vm_id is not null or host_id is not null)
);

create table if not exists workload_databases (
  id text primary key,
  name text not null,
  engine text not null,
  service_name text not null references compute_services (name) on delete cascade,
  vm_id text references instances (id),
  host_id text references physical_hosts (id),
  status text not null,
  constraint workload_databases_target check (vm_id is not null or host_id is not null)
);

insert into physical_hosts (id, name, site, cluster_name, status, cpu, mem, ip)
select 'ph-east-01', 'ph-east-01', 'east', (select name from compute_clusters where name = 'east-compute'), 'Online', 38, 54, '10.10.1.11'
where not exists (select 1 from physical_hosts where id = 'ph-east-01');

insert into physical_hosts (id, name, site, cluster_name, status, cpu, mem, ip)
select 'ph-west-01', 'ph-west-01', 'west', (select name from compute_clusters where name = 'west-compute'), 'Online', 22, 41, '10.20.2.11'
where not exists (select 1 from physical_hosts where id = 'ph-west-01');

insert into physical_hosts (id, name, site, cluster_name, status, cpu, mem, ip)
select 'ph-central-01', 'ph-central-01', 'central', (select name from compute_clusters where name = 'central-dr'), 'Online', 19, 33, '10.30.1.11'
where not exists (select 1 from physical_hosts where id = 'ph-central-01');

update instances set host_id = 'ph-east-01', cluster_name = 'east-compute'
where id in ('vm-001', 'vm-002', 'vm-004')
  and exists (select 1 from physical_hosts where id = 'ph-east-01')
  and exists (select 1 from compute_clusters where name = 'east-compute');

update instances set host_id = 'ph-west-01', cluster_name = 'west-compute'
where id in ('vm-003', 'vm-006')
  and exists (select 1 from physical_hosts where id = 'ph-west-01')
  and exists (select 1 from compute_clusters where name = 'west-compute');

update instances set host_id = 'ph-central-01', cluster_name = 'central-dr'
where id = 'vm-005'
  and exists (select 1 from physical_hosts where id = 'ph-central-01')
  and exists (select 1 from compute_clusters where name = 'central-dr');

insert into workload_apps (id, name, kind, service_name, vm_id, host_id, port, status)
select 'app-api-web', 'app-api-web', 'tomcat', 'app-api', 'vm-001', 'ph-east-01', 8080, 'Healthy'
where exists (select 1 from instances where id = 'vm-001')
  and exists (select 1 from compute_services where name = 'app-api')
  and not exists (select 1 from workload_apps where id = 'app-api-web');

insert into workload_apps (id, name, kind, service_name, vm_id, host_id, port, status)
select 'edge-proxy', 'edge-proxy', 'other', 'edge-gateway', 'vm-004', 'ph-east-01', 443, 'Healthy'
where exists (select 1 from instances where id = 'vm-004')
  and exists (select 1 from compute_services where name = 'edge-gateway')
  and not exists (select 1 from workload_apps where id = 'edge-proxy');

insert into workload_apps (id, name, kind, service_name, vm_id, host_id, port, status)
select 'metrics-agent', 'metrics-agent', 'other', 'metrics', null, 'ph-west-01', 9100, 'Degraded'
where exists (select 1 from compute_services where name = 'metrics')
  and exists (select 1 from physical_hosts where id = 'ph-west-01')
  and not exists (select 1 from workload_apps where id = 'metrics-agent');

insert into workload_databases (id, name, engine, service_name, vm_id, host_id, status)
select 'app-api-db', 'app-api-db', 'postgresql', 'app-api', 'vm-002', 'ph-east-01', 'Healthy'
where exists (select 1 from instances where id = 'vm-002')
  and exists (select 1 from compute_services where name = 'app-api')
  and not exists (select 1 from workload_databases where id = 'app-api-db');

insert into workload_databases (id, name, engine, service_name, vm_id, host_id, status)
select 'identity-db', 'identity-db', 'postgresql', 'identity', null, 'ph-central-01', 'Healthy'
where exists (select 1 from compute_services where name = 'identity')
  and exists (select 1 from physical_hosts where id = 'ph-central-01')
  and not exists (select 1 from workload_databases where id = 'identity-db');

alter table instances drop constraint if exists instances_host_fk;
alter table instances drop constraint if exists instances_cluster_fk;
alter table instances add constraint instances_host_fk foreign key (host_id) references physical_hosts (id);
alter table instances add constraint instances_cluster_fk foreign key (cluster_name) references compute_clusters (name);

create index if not exists workload_apps_service_idx on workload_apps (service_name);
create index if not exists workload_databases_service_idx on workload_databases (service_name);
create index if not exists instances_host_idx on instances (host_id);
