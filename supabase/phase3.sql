-- Giai đoạn 3: chạy trong Supabase > SQL Editor (một lần)
create table special_dates(
  id uuid primary key default gen_random_uuid(), space_id uuid not null,
  name text not null, on_date date not null, yearly boolean default true, created_at timestamptz default now());
create table diary_entries(
  id uuid primary key default gen_random_uuid(), space_id uuid not null, author uuid default auth.uid(),
  entry_date date default current_date, title text, body text, mood text, created_at timestamptz default now());
alter table special_dates enable row level security;
alter table diary_entries enable row level security;
create policy sd_all on special_dates for all using (space_id=my_space()) with check (space_id=my_space());
create policy di_r on diary_entries for select using (space_id=my_space());
create policy di_i on diary_entries for insert with check (space_id=my_space() and author=auth.uid());
create policy di_u on diary_entries for update using (author=auth.uid());
create policy di_d on diary_entries for delete using (author=auth.uid());
