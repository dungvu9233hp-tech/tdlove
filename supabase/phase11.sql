-- Giai đoạn 11 (MAP-07): lưu lịch sử hành trình của một chuyến đi. Chạy trong Supabase > SQL Editor, một lần, SAU phase10.sql (chạy lại vẫn an toàn).
-- Mặc định KHÔNG lưu gì: chỉ khi người dùng bấm "Bắt đầu ghi" mới có dòng trong `trips` và `location_history` (NFR-03).
-- Hành trình chỉ chủ của nó xem được, trừ khi chủ bật "Cho người ấy xem" (cột `shared`). Chủ xóa được bất cứ lúc nào.

create table if not exists trips(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_id uuid references plans on delete set null,        -- gắn với một Kế hoạch (không bắt buộc)
  name text not null check (char_length(name) between 1 and 60),
  started_at timestamptz not null default now(),
  ended_at timestamptz,                                    -- null = đang ghi
  last_at timestamptz,                                     -- lúc lưu điểm gần nhất (để biết app đã đóng quá lâu thì tự dừng)
  distance_m integer not null default 0, point_count integer not null default 0,
  shared boolean not null default false,
  created_at timestamptz default now());
-- mỗi người chỉ ghi một hành trình tại một thời điểm
create unique index if not exists trips_one_active on trips(user_id) where ended_at is null;
create index if not exists trips_space_idx on trips(space_id, started_at desc);

create table if not exists location_history(
  id uuid primary key default gen_random_uuid(),           -- app tự sinh id để gửi lại khi mất mạng không bị trùng điểm
  trip_id uuid not null references trips on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  space_id uuid not null references spaces on delete cascade,
  lat double precision not null, lng double precision not null, accuracy real,
  recorded_at timestamptz not null default now());
create index if not exists location_history_trip_idx on location_history(trip_id, recorded_at);

alter table trips enable row level security;
alter table location_history enable row level security;

drop policy if exists tr_r on trips; drop policy if exists tr_i on trips; drop policy if exists tr_u on trips; drop policy if exists tr_d on trips;
create policy tr_r on trips for select using (user_id=auth.uid() or (shared and space_id=my_space()));
create policy tr_i on trips for insert with check (user_id=auth.uid() and space_id=my_space()
  and (plan_id is null or exists(select 1 from plans p where p.id=plan_id and p.space_id=my_space())));
create policy tr_u on trips for update using (user_id=auth.uid()) with check (user_id=auth.uid() and space_id=my_space()
  and (plan_id is null or exists(select 1 from plans p where p.id=plan_id and p.space_id=my_space())));
create policy tr_d on trips for delete using (user_id=auth.uid());
-- chỉ sửa được các cột này (không đổi chủ, không đổi Space, không đổi giờ bắt đầu)
revoke update on trips from authenticated, anon;
grant update (name, plan_id, shared, ended_at, last_at, distance_m, point_count) on trips to authenticated;

drop policy if exists lh_r on location_history; drop policy if exists lh_i on location_history; drop policy if exists lh_d on location_history;
-- thấy được hành trình nào (theo policy của trips) thì thấy các điểm của hành trình đó
create policy lh_r on location_history for select using (exists(select 1 from trips t where t.id=trip_id));
create policy lh_i on location_history for insert with check (user_id=auth.uid() and space_id=my_space()
  and exists(select 1 from trips t where t.id=trip_id and t.user_id=auth.uid()));
create policy lh_d on location_history for delete using (user_id=auth.uid());
revoke update on location_history from authenticated, anon;   -- điểm đã ghi không sửa được, chỉ xóa (xóa cả hành trình)
