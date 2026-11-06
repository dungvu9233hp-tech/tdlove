-- Giai đoạn 22: sửa lỗi T11(b) - Bản đồ Kỷ niệm gửi toàn bộ đường đi (tối đa 6000 điểm) lặp ở cả hai dòng của một hành trình.
-- Chạy SAU phase21.sql. Có thể chạy lại an toàn. Chỉ đổi memory_places: dòng điểm cuối không còn mang journey_path
-- (app chỉ cần đường đi từ dòng điểm đầu).

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
  author uuid,
  journey_path jsonb,
  is_start_point boolean
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
    m.author,
    null::jsonb as journey_path,
    null::boolean as is_start_point
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
    e.author,
    null::jsonb as journey_path,
    null::boolean as is_start_point
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
    null::uuid as author,
    null::jsonb as journey_path,
    null::boolean as is_start_point
  from plans p
  join lateral (
    select lat, lng from stops
    where plan_id = p.id and lat is not null and lng is not null
    order by sort asc
    limit 1
  ) s on true
  where p.space_id = my_space()
    and p.end_date is not null
    and (
      p.status = 'Đã đi'
      or (
        p.status = 'Đã chốt'
        and p.end_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
      )
    )
    and (p_from is null or p.end_date >= p_from)
    and (p_to is null or p.end_date <= p_to)

  union all

  -- Hành trình ghi lại: chỉ những chuyến đã chia sẻ (shared=true) hoặc là chủ sở hữu
  -- Trả về: điểm đầu, điểm cuối, VÀ toàn bộ đường đi (dùng cho FR-14 thay đường nối thẳng)
  select
    'journey'::text as source,
    t.name || ' (điểm đầu)' as title,
    (lh.points->0->>'lat')::double precision as lat,
    (lh.points->0->>'lng')::double precision as lng,
    t.started_at::date as visited_on,
    t.id as ref_id,
    'journey'::text as kind,
    false as is_private,
    t.user_id as author,
    lh.points as journey_path,
    true as is_start_point
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
    t.user_id as author,
    null::jsonb as journey_path,   -- T11b: toàn bộ đường đi chỉ gửi một lần (ở dòng điểm đầu), không lặp ở điểm cuối
    false as is_start_point
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
