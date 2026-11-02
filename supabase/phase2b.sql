-- Hoàn thiện giai đoạn 2: chạy trong Supabase > SQL Editor (một lần, sau phase2.sql)
alter table plans add column cover_path text, add column share jsonb default '{}';
alter table stops add column sort bigint default (extract(epoch from clock_timestamp())*1000)::bigint,
  add column lat double precision, add column lng double precision, add column link text,
  add column hours text, add column phone text, add column review_url text, add column likes jsonb default '{}';
update stops set sort=(extract(epoch from created_at)*1000)::bigint;
alter table messages add column lat double precision, add column lng double precision;
create table checklist_items(
  id uuid primary key default gen_random_uuid(), plan_id uuid not null references plans on delete cascade,
  space_id uuid not null, text text not null, done boolean default false, created_at timestamptz default now());
create table wishlist_places(
  id uuid primary key default gen_random_uuid(), space_id uuid not null, name text not null,
  area text, dish text, price text, link text, stars int, visited boolean default false, created_at timestamptz default now());
alter table checklist_items enable row level security;
alter table wishlist_places enable row level security;
create policy ck_all on checklist_items for all using (space_id=my_space()) with check (space_id=my_space());
create policy wl_all on wishlist_places for all using (space_id=my_space()) with check (space_id=my_space());
alter publication supabase_realtime add table stops, checklist_items, plans;
