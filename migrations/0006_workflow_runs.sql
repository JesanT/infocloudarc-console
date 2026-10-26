-- Recorded position of a Service DR workflow run. Empty means the workflow is idle.

alter table dr_workflows add column if not exists step_state jsonb not null default '[]'::jsonb;
