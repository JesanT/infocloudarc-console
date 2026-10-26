-- Shared operations console. One row for the site, not per browser.
-- Auth is still the demo role switcher, so this is not scoped to a user id.

create table if not exists console_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
