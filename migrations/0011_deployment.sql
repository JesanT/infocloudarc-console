create table if not exists deploy_repositories (
  id text primary key,
  name text not null,
  site text not null,
  kind text not null,
  protocol text not null,
  address text not null default '',
  path text not null default '',
  constraint deploy_repositories_kind check (kind in ('local', 'mapped', 'nas')),
  constraint deploy_repositories_protocol check (protocol in ('path', 'smb', 'nfs'))
);

create table if not exists deploy_images (
  id text primary key,
  name text not null,
  site text not null,
  repository_id text not null,
  file text not null,
  format text not null,
  os text not null,
  firmware text not null,
  constraint deploy_images_format check (format in ('qcow2', 'vhdx', 'raw', 'iso')),
  constraint deploy_images_firmware check (firmware in ('bios', 'uefi'))
);

create table if not exists deploy_templates (
  id text primary key,
  name text not null,
  site text not null,
  image_id text not null,
  instance_kind text not null,
  vcpu integer not null,
  memory_mb integer not null,
  disk_gb integer not null
);

alter table hypervisors add column if not exists config_repo_id text not null default '';
alter table hypervisors add column if not exists disk_repo_id text not null default '';
alter table hypervisors add column if not exists swap_repo_id text not null default '';

alter table instances add column if not exists hypervisor_id text not null default '';
alter table instances add column if not exists template_id text not null default '';
alter table instances add column if not exists image_id text not null default '';
alter table instances add column if not exists config_path text not null default '';
alter table instances add column if not exists disk_path text not null default '';
alter table instances add column if not exists swap_path text not null default '';

insert into deploy_repositories (id, name, site, kind, protocol, address, path)
select 'repo-east-config', 'east-vm-config', 'east', 'local', 'path', '', 'C:/Hyper-V/Virtual Machines'
where not exists (select 1 from deploy_repositories where id = 'repo-east-config');
insert into deploy_repositories (id, name, site, kind, protocol, address, path)
select 'repo-east-disk', 'east-vm-disks', 'east', 'local', 'path', '', 'C:/Hyper-V/Virtual Hard Disks'
where not exists (select 1 from deploy_repositories where id = 'repo-east-disk');
insert into deploy_repositories (id, name, site, kind, protocol, address, path)
select 'repo-east-swap', 'east-vm-swap', 'east', 'local', 'path', '', 'C:/Hyper-V/Swap'
where not exists (select 1 from deploy_repositories where id = 'repo-east-swap');
insert into deploy_repositories (id, name, site, kind, protocol, address, path)
select 'repo-west-disk', 'west-mapped-disks', 'west', 'mapped', 'path', '', '/mnt/san/vms'
where not exists (select 1 from deploy_repositories where id = 'repo-west-disk');
insert into deploy_repositories (id, name, site, kind, protocol, address, path)
select 'repo-central-nas', 'central-nas', 'central', 'nas', 'nfs', 'nas-central', '/export/vms'
where not exists (select 1 from deploy_repositories where id = 'repo-central-nas');

insert into deploy_images (id, name, site, repository_id, file, format, os, firmware)
select 'img-ubuntu-vhdx', 'ubuntu-22.04', 'east', 'repo-east-disk', 'ubuntu-22.04.vhdx', 'vhdx', 'Ubuntu 22.04', 'uefi'
where not exists (select 1 from deploy_images where id = 'img-ubuntu-vhdx');
insert into deploy_images (id, name, site, repository_id, file, format, os, firmware)
select 'img-ubuntu-qcow2', 'ubuntu-22.04', 'west', 'repo-west-disk', 'ubuntu-22.04.qcow2', 'qcow2', 'Ubuntu 22.04', 'uefi'
where not exists (select 1 from deploy_images where id = 'img-ubuntu-qcow2');
insert into deploy_images (id, name, site, repository_id, file, format, os, firmware)
select 'img-rhel', 'rhel-9', 'east', 'repo-east-disk', 'rhel-9.vhdx', 'vhdx', 'RHEL 9', 'uefi'
where not exists (select 1 from deploy_images where id = 'img-rhel');

insert into deploy_templates (id, name, site, image_id, instance_kind, vcpu, memory_mb, disk_gb)
select 'tpl-ubuntu-compute', 'ubuntu-compute', 'east', 'img-ubuntu-vhdx', 'Compute', 2, 4096, 40
where not exists (select 1 from deploy_templates where id = 'tpl-ubuntu-compute');
insert into deploy_templates (id, name, site, image_id, instance_kind, vcpu, memory_mb, disk_gb)
select 'tpl-ubuntu-west', 'ubuntu-compute-west', 'west', 'img-ubuntu-qcow2', 'Compute', 2, 4096, 40
where not exists (select 1 from deploy_templates where id = 'tpl-ubuntu-west');
insert into deploy_templates (id, name, site, image_id, instance_kind, vcpu, memory_mb, disk_gb)
select 'tpl-rhel-db', 'rhel-database', 'east', 'img-rhel', 'Database', 4, 8192, 100
where not exists (select 1 from deploy_templates where id = 'tpl-rhel-db');

update hypervisors set config_repo_id = 'repo-east-config', disk_repo_id = 'repo-east-disk', swap_repo_id = 'repo-east-swap'
where id = 'hv-east-01' and config_repo_id = '';
update hypervisors set disk_repo_id = 'repo-west-disk' where id = 'hv-west-01' and disk_repo_id = '';
update hypervisors set disk_repo_id = 'repo-central-nas', config_repo_id = 'repo-central-nas', swap_repo_id = 'repo-central-nas'
where id = 'hv-central-01' and disk_repo_id = '';
