create table if not exists hypervisors (
  id text primary key,
  name text not null,
  site text not null,
  kind text not null,
  address text not null default '',
  port integer not null default 0,
  transport text not null,
  login text not null default '',
  status text not null,
  cluster_name text not null default '',
  switch_name text not null default '',
  storage text not null default '',
  host_id text not null default '',
  uri text not null default '',
  detail text not null default '',
  constraint hypervisors_kind check (kind in ('hyper-v', 'libvirt')),
  constraint hypervisors_transport check (transport in ('winrm', 'ssh', 'tls'))
);

insert into hypervisors (id, name, site, kind, address, port, transport, login, status, cluster_name, switch_name, storage, host_id, uri, detail)
select 'hv-east-01', 'ph-east-01', 'east', 'hyper-v', '10.10.1.11', 5985, 'winrm', '', 'Unknown', 'east-compute', 'External', 'C:/Hyper-V', 'ph-east-01', '', 'Recorded with the compute host. The console has not checked WinRM yet.'
where not exists (select 1 from hypervisors where id = 'hv-east-01');

insert into hypervisors (id, name, site, kind, address, port, transport, login, status, cluster_name, switch_name, storage, host_id, uri, detail)
select 'hv-west-01', 'ph-west-01', 'west', 'hyper-v', '10.20.2.11', 5985, 'winrm', '', 'Unknown', 'west-compute', 'External', 'C:/Hyper-V', 'ph-west-01', '', 'Recorded with the compute host. The console has not checked WinRM yet.'
where not exists (select 1 from hypervisors where id = 'hv-west-01');

insert into hypervisors (id, name, site, kind, address, port, transport, login, status, cluster_name, switch_name, storage, host_id, uri, detail)
select 'hv-central-01', 'ph-central-01', 'central', 'hyper-v', '10.30.1.11', 5985, 'winrm', '', 'Unknown', 'central-dr', 'External', 'C:/Hyper-V', 'ph-central-01', '', 'Recorded with the compute host. The console has not checked WinRM yet.'
where not exists (select 1 from hypervisors where id = 'hv-central-01');
