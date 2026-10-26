-- One row per workload per hour. Uptime and spare capacity, not guest latency.

create table if not exists workload_samples (
  id text primary key,
  kind text not null,
  target text not null,
  hour text not null,
  up integer not null,
  performance integer not null
);
