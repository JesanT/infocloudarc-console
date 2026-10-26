-- Service IP owner is observed from the Hyper-V host or cluster, not stored as a fixed primary.

alter table dr_services add column if not exists service_ip text not null default '';
alter table dr_services add column if not exists owner_vm_id text;
alter table dr_services add column if not exists owner_source text not null default 'unconfirmed';
alter table dr_services add column if not exists owner_checked_at text not null default '';
alter table dr_vms add column if not exists mac text not null default '';

update dr_services set service_ip = '10.10.1.100', owner_vm_id = 'vm-chk-e' where id = 'svc-checkout' and service_ip = '';
update dr_services set service_ip = '10.10.1.110', owner_vm_id = 'vm-iis-e' where id = 'svc-portal' and service_ip = '';
update dr_services set service_ip = '10.20.2.100', owner_vm_id = 'vm-bill-w' where id = 'svc-billing' and service_ip = '';
update dr_services set service_ip = '10.10.1.120', owner_vm_id = 'vm-cat-e' where id = 'svc-catalog' and service_ip = '';
update dr_services set service_ip = '10.30.1.100', owner_vm_id = 'vm-hr-c' where id = 'svc-hr' and service_ip = '';

update dr_vms set mac = '00:15:5D:11:01:41' where id = 'vm-chk-e' and mac = '';
update dr_vms set mac = '00:15:5D:22:02:41' where id = 'vm-chk-w' and mac = '';
update dr_vms set mac = '00:15:5D:11:01:51' where id = 'vm-pg-e' and mac = '';
update dr_vms set mac = '00:15:5D:22:02:51' where id = 'vm-pg-w' and mac = '';
update dr_vms set mac = '00:15:5D:11:01:42' where id = 'vm-iis-e' and mac = '';
update dr_vms set mac = '00:15:5D:33:03:42' where id = 'vm-iis-c' and mac = '';
update dr_vms set mac = '00:15:5D:11:01:61' where id = 'vm-ot-e' and mac = '';
update dr_vms set mac = '00:15:5D:33:03:61' where id = 'vm-ot-c' and mac = '';
update dr_vms set mac = '00:15:5D:22:02:43' where id = 'vm-bill-w' and mac = '';
update dr_vms set mac = '00:15:5D:33:03:43' where id = 'vm-bill-c' and mac = '';
update dr_vms set mac = '00:15:5D:22:02:52' where id = 'vm-ms-w' and mac = '';
update dr_vms set mac = '00:15:5D:33:03:52' where id = 'vm-ms-c' and mac = '';
update dr_vms set mac = '00:15:5D:11:01:44' where id = 'vm-cat-e' and mac = '';
update dr_vms set mac = '00:15:5D:22:02:44' where id = 'vm-cat-w' and mac = '';
update dr_vms set mac = '00:15:5D:11:01:53' where id = 'vm-mo-e' and mac = '';
update dr_vms set mac = '00:15:5D:22:02:53' where id = 'vm-mo-w' and mac = '';
update dr_vms set mac = '00:15:5D:33:03:45' where id = 'vm-hr-c' and mac = '';
update dr_vms set mac = '00:15:5D:11:01:45' where id = 'vm-hr-e' and mac = '';
update dr_vms set mac = '00:15:5D:33:03:54' where id = 'vm-my-c' and mac = '';
update dr_vms set mac = '00:15:5D:11:01:54' where id = 'vm-my-e' and mac = '';

update dr_workflows
set steps = steps || '["Confirm service IP"]'::jsonb
where not (steps @> '["Confirm service IP"]'::jsonb);
