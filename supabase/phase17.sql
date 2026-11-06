-- Giai đoạn 17: vá quyền đọc ảnh Storage và đồng bộ Bản đồ Kỷ niệm.
-- Chạy SAU phase16.sql và TRƯỚC khi deploy frontend đã vá.
-- Có thể chạy lại an toàn.

-- Xóa policy cũ: nó cho mọi thành viên Space liệt kê/tải mọi object trong bucket media.
drop policy if exists media_all on storage.objects;
drop policy if exists media_read_visible on storage.objects;
drop policy if exists media_insert_space on storage.objects;
drop policy if exists media_update_owned on storage.objects;
drop policy if exists media_delete_owned on storage.objects;

-- Chỉ ký/tải được object đang được tham chiếu bởi dữ liệu mà caller được phép đọc.
-- diary_media SELECT policy (phase8_trc.sql) đi qua RLS của diary_entries,
-- nên ảnh của nhật ký riêng tư không xuất hiện với người còn lại.
create policy media_read_visible on storage.objects
for select to authenticated
using (
  bucket_id = 'media'
  and (
    owner_id = auth.uid()::text
    or exists (
      select 1 from public.media md
      where md.space_id = my_space()
        and name in (md.path, md.thumb_path)
    )
    or exists (
      select 1 from public.diary_media dm
      where dm.space_id = my_space()
        and name in (dm.path, dm.thumb_path)
    )
    or exists (
      select 1 from public.wishlist_media wm
      where wm.space_id = my_space()
        and name in (wm.path, wm.thumb_path)
    )
    or exists (
      select 1 from public.messages msg
      where msg.space_id = my_space() and msg.media_path = name
    )
    or exists (
      select 1 from public.moments m
      where m.space_id = my_space() and name = any(m.photos)
    )
    or exists (
      select 1 from public.profiles p
      where p.space_id = my_space() and p.avatar_url = name
    )
  )
);

-- Upload mới chỉ được đặt trong thư mục Space hiện tại.
create policy media_insert_space on storage.objects
for insert to authenticated
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = my_space()::text
);

-- Cho sửa/xóa tệp của chính user (kể cả tệp mới upload chưa gắn metadata),
-- hoặc tệp đang thuộc bản ghi mà caller có quyền quản lý.
create policy media_update_owned on storage.objects
for update to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = my_space()::text
  and (
    owner_id = auth.uid()::text
    or coalesce((storage.foldername(name))[2], '') = auth.uid()::text
    or exists (
      select 1 from public.media md
      where md.space_id = my_space()
        and name in (md.path, md.thumb_path)
    )
    or exists (
      select 1 from public.diary_media dm
      join public.diary_entries de on de.id = dm.entry_id
      where dm.space_id = my_space() and de.author = auth.uid()
        and name in (dm.path, dm.thumb_path)
    )
    or exists (
      select 1 from public.wishlist_media wm
      where wm.space_id = my_space() and name in (wm.path, wm.thumb_path)
    )
    or exists (
      select 1 from public.messages msg
      where msg.space_id = my_space() and msg.sender = auth.uid() and msg.media_path = name
    )
    or exists (
      select 1 from public.moments m
      where m.space_id = my_space() and name = any(m.photos)
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.avatar_url = name
    )
  )
)
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = my_space()::text
  and (
    owner_id = auth.uid()::text
    or coalesce((storage.foldername(name))[2], '') = auth.uid()::text
    or exists (
      select 1 from public.media md
      where md.space_id = my_space()
        and name in (md.path, md.thumb_path)
    )
    or exists (
      select 1 from public.diary_media dm
      join public.diary_entries de on de.id = dm.entry_id
      where dm.space_id = my_space() and de.author = auth.uid()
        and name in (dm.path, dm.thumb_path)
    )
    or exists (
      select 1 from public.wishlist_media wm
      where wm.space_id = my_space() and name in (wm.path, wm.thumb_path)
    )
    or exists (
      select 1 from public.messages msg
      where msg.space_id = my_space() and msg.sender = auth.uid() and msg.media_path = name
    )
    or exists (
      select 1 from public.moments m
      where m.space_id = my_space() and name = any(m.photos)
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.avatar_url = name
    )
  )
);

create policy media_delete_owned on storage.objects
for delete to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = my_space()::text
  and (
    owner_id = auth.uid()::text
    or coalesce((storage.foldername(name))[2], '') = auth.uid()::text
    or exists (
      select 1 from public.media md
      where md.space_id = my_space()
        and name in (md.path, md.thumb_path)
    )
    or exists (
      select 1 from public.diary_media dm
      join public.diary_entries de on de.id = dm.entry_id
      where dm.space_id = my_space() and de.author = auth.uid()
        and name in (dm.path, dm.thumb_path)
    )
    or exists (
      select 1 from public.wishlist_media wm
      where wm.space_id = my_space() and name in (wm.path, wm.thumb_path)
    )
    or exists (
      select 1 from public.messages msg
      where msg.space_id = my_space() and msg.sender = auth.uid() and msg.media_path = name
    )
    or exists (
      select 1 from public.moments m
      where m.space_id = my_space() and name = any(m.photos)
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.avatar_url = name
    )
  )
);

-- Giữ nguyên RPC map, chỉ cập nhật điều kiện để nhận cả kế hoạch đã đánh dấu "Đã đi".
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
    lh.points as journey_path,
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
