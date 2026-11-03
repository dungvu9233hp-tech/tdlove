-- Giai đoạn 10: Vòng quay chọn món (WHEEL-01..02)
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase9.sql. Chạy lại nhiều lần vẫn an toàn.
-- Luồng: hai người thêm món vào vòng -> bấm quay -> kết quả lưu vào lịch sử, người kia thấy ngay.

-- Các món trong vòng quay (chung của hai người)
create table if not exists food_options(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  added_by uuid default auth.uid(),
  created_at timestamptz default now());
-- không trùng tên món trong cùng Space (không phân biệt hoa thường)
create unique index if not exists food_options_uniq on food_options(space_id, lower(btrim(name)));
alter table food_options enable row level security;
drop policy if exists fo_all on food_options;
create policy fo_all on food_options for all using (space_id=my_space()) with check (space_id=my_space());

-- tối đa 12 món để vòng quay còn đọc được
create or replace function food_options_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from food_options where space_id=new.space_id) >= 12 then
    raise exception 'Vòng quay tối đa 12 món'; end if;
  return new; end $$;
drop trigger if exists food_options_limit_t on food_options;
create trigger food_options_limit_t before insert on food_options for each row execute function food_options_limit();

-- Lịch sử các lần quay
create table if not exists food_spins(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  name text not null,
  spun_by uuid default auth.uid(),
  created_at timestamptz default now());
create index if not exists food_spins_idx on food_spins(space_id, created_at desc);
alter table food_spins enable row level security;
drop policy if exists fs_r on food_spins; drop policy if exists fs_i on food_spins; drop policy if exists fs_d on food_spins;
create policy fs_r on food_spins for select using (space_id=my_space());
create policy fs_i on food_spins for insert with check (space_id=my_space() and spun_by=auth.uid());
create policy fs_d on food_spins for delete using (space_id=my_space());

-- hai người thấy thay đổi ngay (bỏ qua nếu bảng đã nằm trong publication)
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='food_options') then
    alter publication supabase_realtime add table food_options; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='food_spins') then
    alter publication supabase_realtime add table food_spins; end if;
end $$;
