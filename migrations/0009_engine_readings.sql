-- Drop invented headroom history. A sample is kept only after an engine or port check.

alter table workload_samples add column if not exists source text not null default '';
alter table workload_samples add column if not exists detail text not null default '';

delete from workload_samples where source = '';
