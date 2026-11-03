-- Giai đoạn 9: đánh giá + ảnh cho "Quán muốn thử" (WISH-01..02)
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase8.sql. Chạy lại nhiều lần vẫn an toàn.
-- Luồng: thêm quán -> đi ăn -> bấm "Đã đến" -> viết đánh giá, chấm sao, tải ảnh.

-- WISH-01: nội dung đánh giá và ngày đã đến (wishlist_places chưa bị khóa quyền cột nên cột mới sửa được ngay)
alter table wishlist_places
  add column if not exists review text,
  add column if not exists visited_on date,
  add column if not exists updated_at timestamptz;

-- WISH-02: ảnh của quán (tệp nằm chung bucket 'media', thư mục đầu là id Space, policy media_all đã bao phủ)
create table if not exists wishlist_media(
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references wishlist_places(id) on delete cascade,
  space_id uuid not null,
  path text not null,
  thumb_path text,
  size bigint,
  width int, height int,
  sort int not null default 0,
  created_at timestamptz default now());
create index if not exists wishlist_media_place_idx on wishlist_media(place_id, sort);
alter table wishlist_media enable row level security;
drop policy if exists wm_r on wishlist_media; drop policy if exists wm_i on wishlist_media; drop policy if exists wm_d on wishlist_media;
-- danh sách quán là chung của hai người: ai trong Space cũng xem, thêm, gỡ ảnh được
create policy wm_r on wishlist_media for select using (space_id=my_space());
create policy wm_i on wishlist_media for insert with check (space_id=my_space()
  and path like my_space()::text||'/%'
  and (thumb_path is null or thumb_path like my_space()::text||'/%')
  and exists(select 1 from wishlist_places p where p.id=place_id and p.space_id=my_space()));
create policy wm_d on wishlist_media for delete using (space_id=my_space());

-- tối đa 10 ảnh mỗi quán
create or replace function wishlist_media_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from wishlist_media where place_id=new.place_id) >= 10 then
    raise exception 'Mỗi quán tối đa 10 ảnh'; end if;
  return new; end $$;
drop trigger if exists wishlist_media_limit_t on wishlist_media;
create trigger wishlist_media_limit_t before insert on wishlist_media for each row execute function wishlist_media_limit();

-- ghi lại thời điểm sửa đánh giá
create or replace function wishlist_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists wishlist_touch_t on wishlist_places;
create trigger wishlist_touch_t before update on wishlist_places for each row execute function wishlist_touch();
