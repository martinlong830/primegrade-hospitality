-- DoH Inspection App — Supabase schema
-- Run this in the Supabase SQL editor to enable persistent storage.

create table if not exists users (
  id text primary key,
  username text not null unique,
  password text not null,
  name text not null,
  role text not null check (role in ('admin', 'user'))
);

create table if not exists stations (
  id text primary key,
  name text not null,
  slug text not null unique,
  color text not null default '#64748b',
  map_x integer not null default 0,
  map_y integer not null default 0,
  map_width integer not null default 120,
  map_height integer not null default 80
);

create table if not exists task_sections (
  id text primary key,
  station_id text not null references stations(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  time text,
  recurrence text not null default 'daily_once' check (recurrence in ('daily_once', 'interval')),
  interval_minutes integer,
  due_window_minutes integer
);

create table if not exists tasks (
  id text primary key,
  station_id text not null references stations(id) on delete cascade,
  section_id text references task_sections(id) on delete set null,
  title text not null,
  description text not null default '',
  timing_notes text not null default '',
  recurrence text not null default 'daily_once' check (recurrence in ('daily_once', 'interval')),
  interval_minutes integer,
  assigned_user_id text references users(id) on delete set null,
  sort_order integer not null default 0
);

create table if not exists task_completions (
  id text primary key,
  task_id text not null references tasks(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  date date not null default current_date,
  unique (task_id, date)
);

-- Seed data
insert into users (id, username, password, name, role) values
  ('user-admin', 'martin long', 'doh', 'Martin Long', 'admin'),
  ('user-eduardo', 'eduardo ramirez', 'doh', 'Eduardo Ramirez', 'user')
on conflict (id) do nothing;

insert into stations (id, name, slug, color, map_x, map_y, map_width, map_height) values
  ('station-kitchen', 'Kitchen Line', 'kitchen-line', '#ef4444', 417, 87, 108, 28),
  ('station-prep', 'Prep Area', 'prep-area', '#f59e0b', 338, 243, 108, 28),
  ('station-dish', 'Dishwashing', 'dishwashing', '#3b82f6', 496, 281, 108, 28),
  ('station-storage', 'Storage', 'storage', '#10b981', 496, 207, 108, 28)
on conflict (id) do nothing;

insert into task_sections (id, station_id, name, sort_order, time, recurrence, interval_minutes, due_window_minutes) values
  ('section-kitchen-opening', 'station-kitchen', 'Pre-Service', 1, '06:00', 'daily_once', null, 60),
  ('section-kitchen-mid', 'station-kitchen', 'Service Hours', 2, null, 'daily_once', null, null),
  ('section-kitchen-temp', 'station-kitchen', 'Temperature Monitoring', 3, null, 'interval', 120, 30),
  ('section-kitchen-closing', 'station-kitchen', 'End of Day', 4, '22:00', 'daily_once', null, 90),
  ('section-prep-pre-open', 'station-prep', 'Pre-Service', 1, '06:30', 'daily_once', null, 60),
  ('section-prep-mid', 'station-prep', 'Service Hours', 2, null, 'daily_once', null, null),
  ('section-prep-closing', 'station-prep', 'End of Day', 3, '22:00', 'daily_once', null, 90),
  ('section-dish-closing', 'station-dish', 'End of Day', 1, '22:00', 'daily_once', null, 90),
  ('section-storage-opening', 'station-storage', 'Pre-Service', 1, '06:00', 'daily_once', null, 60),
  ('section-storage-temp', 'station-storage', 'Temperature Monitoring', 2, null, 'interval', 120, 30),
  ('section-storage-closing', 'station-storage', 'End of Day', 3, '22:00', 'daily_once', null, 90)
on conflict (id) do nothing;

insert into tasks (id, station_id, section_id, title, description, timing_notes, recurrence, interval_minutes, assigned_user_id, sort_order) values
  ('task-1', 'station-kitchen', 'section-kitchen-opening', 'Check walk-in fridge temperature', 'Record temp — must be ≤ 41°F', '', 'daily_once', null, 'user-eduardo', 1),
  ('task-2', 'station-storage', 'section-storage-opening', 'Check all freezer temperatures', 'Record temp — must be ≤ 0°F', '', 'daily_once', null, null, 2),
  ('task-3', 'station-prep', 'section-prep-pre-open', 'Set up handwash stations', 'Soap, paper towels, and warm running water at each station', 'Verify again at open', 'daily_once', null, 'user-eduardo', 3),
  ('task-4', 'station-kitchen', 'section-kitchen-mid', 'Gloves — no bare hand contact', 'Verify all line cooks using gloves for ready-to-eat food', '', 'daily_once', null, 'user-eduardo', 4),
  ('task-5', 'station-prep', 'section-prep-mid', 'Gloves — no bare hand contact', 'Verify prep staff using gloves for ready-to-eat food', '', 'daily_once', null, null, 5),
  ('task-6', 'station-kitchen', 'section-kitchen-temp', 'Monitor hot-holding temps', 'Check every 2 hours — must be ≥ 135°F', 'Every 2 hours during service', 'interval', 120, null, 6),
  ('task-7', 'station-storage', 'section-storage-temp', 'Monitor cold-holding temps', 'Check every 2 hours — must be ≤ 41°F', 'Every 2 hours during service', 'interval', 120, null, 7),
  ('task-8', 'station-kitchen', 'section-kitchen-closing', 'Sanitize all food-contact surfaces', 'Wipe down prep tables, cutting boards, and line surfaces', '', 'daily_once', null, null, 8),
  ('task-9', 'station-dish', 'section-dish-closing', 'Sanitize dish area surfaces', 'Clean and sanitize sinks, racks, and surrounding areas', '', 'daily_once', null, 'user-eduardo', 9),
  ('task-10', 'station-prep', 'section-prep-closing', 'Label and store all food', 'Date-label all prep items and store at proper temps', '', 'daily_once', null, null, 10),
  ('task-11', 'station-storage', 'section-storage-closing', 'Label and store all food', 'Ensure all stored items are labeled with date and contents', '', 'daily_once', null, null, 11),
  ('task-12', 'station-storage', 'section-storage-closing', 'Remove garbage', 'Empty all trash bins and take to dumpster', '', 'daily_once', null, null, 12)
on conflict (id) do nothing;

-- Allow public read/write for demo (tighten RLS for production)
alter table users enable row level security;
alter table stations enable row level security;
alter table task_sections enable row level security;
alter table tasks enable row level security;
alter table task_completions enable row level security;

create table if not exists map_zones (
  id text primary key,
  name text not null,
  x integer not null,
  y integer not null,
  width integer not null,
  height integer not null
);

create table if not exists map_layout (
  id text primary key default 'default',
  width integer not null,
  height integer not null
);

alter table map_zones enable row level security;
alter table map_layout enable row level security;

create policy "Allow all on map_zones" on map_zones for all using (true) with check (true);
create policy "Allow all on map_layout" on map_layout for all using (true) with check (true);

insert into map_layout (id, width, height) values ('default', 640, 480)
on conflict (id) do nothing;

insert into map_zones (id, name, x, y, width, height) values
  ('dining', 'Dining Room', 16, 16, 280, 456),
  ('kitchen-line', 'Kitchen', 318, 16, 306, 148),
  ('prep', 'Prep', 318, 176, 148, 140),
  ('dry-storage', 'Storage', 476, 176, 148, 68),
  ('dish-pit', 'Dish', 476, 252, 148, 64)
on conflict (id) do nothing;

create policy "Allow all on users" on users for all using (true) with check (true);
create policy "Allow all on stations" on stations for all using (true) with check (true);
create policy "Allow all on task_sections" on task_sections for all using (true) with check (true);
create policy "Allow all on tasks" on tasks for all using (true) with check (true);
create policy "Allow all on task_completions" on task_completions for all using (true) with check (true);
