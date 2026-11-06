-- Giai đoạn 16: Bản đồ Kỷ niệm (MAP-08..15)
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase15.sql. Chạy lại nhiều lần vẫn an toàn.
-- Gom các nơi hai người đã đi từ nhiều nguồn (Moment, Nhật ký, Plan, Hành trình) thành một dạng chung.

-- 1. Điền bù toạ độ cho Moment từ ảnh có GPS (chạy một lần, bọc trong transaction)
-- Chỉ cập nhật moment đang NULL lat/lng, lấy ảnh đầu tiên có GPS theo sort trong bảng media
do $$
declare
  updated_count int := 0;
begin
  update moments m
  set lat = x.lat, lng = x.lng
  from (
    select distinct on (md.moment_id)
      md.moment_id, md.lat, md.lng
    from media md
    where md.lat is not null and md.lng is not null
    order by md.moment_id, md.sort asc
  ) x
  where m.id = x.moment_id
    and (m.lat is null or m.lng is null)
    and m.deleted_at is null;
  get diagnostics updated_count = row_count;
  raise notice 'Đã cập nhật toạ độ cho % moment từ ảnh', updated_count;
end $$;

-- 2. View/RPC memory_places: gom các "lần ghé thăm" từ 4 nguồn
-- Tham số from/to có thể bỏ (null) để lấy toàn bộ; client tự lọc chip
create or replace function memory_places(p_from date default null, p_to date default null)
returns table(
  source text,
  title text,
  lat double precision,
  lng double precision,
  visited_on date,
  ref_id uuid,
  kind text,
  is_private boolean,
  author uuid
)
language sql stable security invoker set search_path = public as $$
  -- Moment: có lat/lng hoặc đã điền bù từ ảnh
  select
    'moment'::text as source,
    m.title,
    m.lat,
    m.lng,
    m.taken_on as visited_on,
    m.id as ref_id,
    'moment'::text as kind,
    false as is_private,
    m.author
  from moments m
  where m.space_id = my_space()
    and m.deleted_at is null
    and m.lat is not null and m.lng is not null
    and (p_from is null or m.taken_on >= p_from)
    and (p_to is null or m.taken_on <= p_to)

  union all

  -- Nhật ký: có địa điểm thông qua moment_id hoặc plan_id (lấy từ stop của plan)
  select
    'journal'::text as source,
    coalesce(nullif(trim(e.title),''), 'Nhật ký') as title,
    coalesce(m.lat, s.lat) as lat,
    coalesce(m.lng, s.lng) as lng,
    e.entry_date as visited_on,
    e.id as ref_id,
    'journal'::text as kind,
    e.is_private as is_private,
    e.author
  from diary_entries e
  left join moments m on e.moment_id = m.id
  left join plans p on e.plan_id = p.id
  left join lateral (
    select lat, lng from stops
    where plan_id = p.id and lat is not null and lng is not null
    order by sort asc
    limit 1
  ) s on true
  where e.space_id = my_space()
    and coalesce(m.lat, s.lat) is not null
    and coalesce(m.lng, s.lng) is not null
    and (p_from is null or e.entry_date >= p_from)
    and (p_to is null or e.entry_date <= p_to)

  union all

  -- Plan: đã chốt và đã qua end_date, lấy toạ độ từ stop đầu tiên có lat/lng
  select
    'plan'::text as source,
    p.name as title,
    s.lat,
    s.lng,
    p.end_date as visited_on,
    p.id as ref_id,
    'plan'::text as kind,
    false as is_private,
    null::uuid as author
  from plans p
  join lateral (
    select lat, lng from stops
    where plan_id = p.id and lat is not null and lng is not null
    order by sort asc
    limit 1
  ) s on true
  where p.space_id = my_space()
    and p.status = 'Đã chốt'
    and p.end_date is not null
    and p.end_date <= (current_date at time zone 'UTC+7')  -- so sánh theo múi giờ VN
    and (p_from is null or p.end_date >= p_from)
    and (p_to is null or p.end_date <= p_to)

  union all

  -- Hành trình ghi lại: chỉ những chuyến đã chia sẻ (shared=true) hoặc là chủ sở hữu
  -- Lấy điểm đầu và cuối của hành trình làm 2 "lần ghé" (hoặc chỉ điểm cuối nếu muốn đơn giản)
  select
    'journey'::text as source,
    t.name || ' (điểm đầu)' as title,
    (lh.points->0->>'lat')::double precision as lat,
    (lh.points->0->>'lng')::double precision as lng,
    t.started_at::date as visited_on,
    t.id as ref_id,
    'journey'::text as kind,
    false as is_private,
    t.user_id as author
  from trips t
  join lateral (
    select jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng) order by recorded_at) as points
    from location_history
    where trip_id = t.id
  ) lh on true
  where t.space_id = my_space()
    and t.ended_at is not null
    and (t.shared or t.user_id = auth.uid())
    and jsonb_array_length(lh.points) > 0
    and (p_from is null or t.started_at::date >= p_from)
    and (p_to is null or t.started_at::date <= p_to)

  union all

  select
    'journey'::text as source,
    t.name || ' (điểm cuối)' as title,
    (lh.points->(jsonb_array_length(lh.points)-1)->>'lat')::double precision as lat,
    (lh.points->(jsonb_array_length(lh.points)-1)->>'lng')::double precision as lng,
    t.ended_at::date as visited_on,
    t.id as ref_id,
    'journey'::text as kind,
    false as is_private,
    t.user_id as author
  from trips t
  join lateral (
    select jsonb_agg(jsonb_build_object('lat', lat, 'lng', lng) order by recorded_at) as points
    from location_history
    where trip_id = t.id
  ) lh on true
  where t.space_id = my_space()
    and t.ended_at is not null
    and (t.shared or t.user_id = auth.uid())
    and jsonb_array_length(lh.points) > 1
    and (p_from is null or t.ended_at::date >= p_from)
    and (p_to is null or t.ended_at::date <= p_to)

  order by visited_on asc, kind;
$$;

revoke all on function memory_places(date, date) from public, anon;
grant execute on function memory_places(date, date) to authenticated, service_role;

-- 3. Hàm đếm số moment còn thiếu toạ độ (dùng cho UI "Gắn vị trí cho kỷ niệm cũ")
create or replace function moments_missing_coords_count()
returns integer
language sql stable security invoker set search_path = public as $$
  select count(*) from moments
  where space_id = my_space()
    and deleted_at is null
    and (lat is null or lng is null);
$$;
revoke all on function moments_missing_coords_count() from public, anon;
grant execute on function moments_missing_coords_count() to authenticated, service_role;

-- 4. Hàm lấy danh sách moment thiếu toạ độ (dùng cho UI gắn vị trí)
create or replace function moments_missing_coords(p_limit int default 50, p_offset int default 0)
returns table(
  id uuid,
  title text,
  taken_on date,
  place text,
  thumb_path text
)
language sql stable security invoker set search_path = public as $$
  select
    m.id,
    m.title,
    m.taken_on,
    m.place,
    md.thumb_path
  from moments m
  left join lateral (
    select thumb_path from media
    where moment_id = m.id and kind = 'image'
    order by sort asc
    limit 1
  ) md on true
  where m.space_id = my_space()
    and m.deleted_at is null
    and (m.lat is null or m.lng is null)
  order by m.taken_on desc, m.created_at desc
  limit p_limit offset p_offset;
$$;
revoke all on function moments_missing_coords(int, int) from public, anon;
grant execute on function moments_missing_coords(int, int) to authenticated, service_role;

-- 5. Cập nhật moment với toạ độ từ PlacePicker (gọi khi người dùng gắn vị trí)
create or replace function set_moment_location(p_moment_id uuid, p_lat double precision, p_lng double precision, p_place text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or my_space() is null then raise exception 'Bạn chưa vào Space nào'; end if;
  update moments
  set lat = p_lat, lng = p_lng, place = p_place, updated_at = now()
  where id = p_moment_id and space_id = my_space();
  if not found then raise exception 'Không tìm thấy khoảnh khắc'; end if;
end $$;
revoke all on function set_moment_location(uuid, double precision, double precision, text) from public, anon;
grant execute on function set_moment_location(uuid, double precision, double precision, text) to authenticated;