-- Giai đoạn 2: chạy trong Supabase > SQL Editor (chỉ chạy một lần)
create table locations(
  user_id uuid primary key references auth.users on delete cascade,
  space_id uuid not null, lat double precision not null, lng double precision not null,
  accuracy real, updated_at timestamptz default now(), share_until timestamptz not null);
create table plans(
  id uuid primary key default gen_random_uuid(), space_id uuid not null,
  name text not null, start_date date, end_date date, area text,
  status text default 'Ý tưởng', created_at timestamptz default now());
create table stops(
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans on delete cascade, space_id uuid not null,
  day int default 1, start_time time, type text default 'Khác', name text not null,
  address text, note text, est_cost bigint default 0, actual_cost bigint, paid_by uuid,
  created_at timestamptz default now());
alter table locations enable row level security;
alter table plans enable row level security;
alter table stops enable row level security;
create policy lo_r on locations for select using (space_id=my_space());
create policy lo_i on locations for insert with check (user_id=auth.uid() and space_id=my_space());
create policy lo_u on locations for update using (user_id=auth.uid());
create policy lo_d on locations for delete using (user_id=auth.uid());
create policy pl_all on plans for all using (space_id=my_space()) with check (space_id=my_space());
create policy st_all on stops for all using (space_id=my_space()) with check (space_id=my_space());
alter publication supabase_realtime add table locations;
