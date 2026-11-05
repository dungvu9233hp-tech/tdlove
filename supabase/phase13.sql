-- Giai đoạn 13: Giải trí, clip TikTok gửi cho nhau (ENT-01..05)
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase12.sql. Chạy lại nhiều lần vẫn an toàn.
-- App KHÔNG lưu video của TikTok: chỉ lưu mã video và vài dòng mô tả (tên, caption), phát bằng trình phát nhúng chính thức của TikTok.
-- Ghi dữ liệu chỉ qua Edge Function `clip` (dùng service_role), nên không có policy insert cho người dùng.

create table if not exists clips(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces on delete cascade,
  sender uuid not null references auth.users on delete cascade,
  video_id text not null check (video_id ~ '^[0-9]{8,25}$'),            -- mã video trong link TikTok
  url text not null,                                                    -- link đầy đủ dạng https://www.tiktok.com/@tên/video/mã
  title text check (title is null or char_length(title) <= 300),        -- caption lấy từ oEmbed
  author_name text check (author_name is null or char_length(author_name) <= 80),
  thumb_url text,                                                       -- ảnh bìa (link của TikTok có hạn dùng, app tự ẩn khi hỏng)
  note text check (note is null or char_length(note) <= 200),
  seen_at timestamptz,                                                  -- lần đầu người nhận mở xem
  created_at timestamptz not null default now(),
  unique(space_id, video_id, sender));                                  -- gửi lại cùng một clip thì không thêm dòng mới
create index if not exists clips_space_idx on clips(space_id, created_at desc);

alter table clips enable row level security;
drop policy if exists cl_r on clips; drop policy if exists cl_d on clips;
create policy cl_r on clips for select using (space_id=my_space());
create policy cl_d on clips for delete using (space_id=my_space());     -- cả hai người đều dọn được danh sách chung
revoke insert, update on clips from authenticated, anon;

-- Đánh dấu "đã xem": chỉ người KHÔNG phải người gửi, chỉ ghi lần đầu
create or replace function open_clip(cid uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update clips set seen_at = now()
   where id = cid and space_id = my_space() and sender <> auth.uid() and seen_at is null;
end $$;
revoke all on function open_clip(uuid) from public, anon;
grant execute on function open_clip(uuid) to authenticated;

-- Mã gửi nhanh cho Phím tắt iPhone (không đăng nhập được trong Phím tắt nên dùng mã riêng của từng người).
-- Chỉ lưu bản băm SHA-256; mã gốc hiện đúng một lần lúc tạo. Mỗi người một mã, tạo mã mới thì mã cũ hết hiệu lực.
create table if not exists share_tokens(
  user_id uuid primary key references auth.users on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now());
alter table share_tokens enable row level security;                     -- không có policy nào: chỉ hai hàm dưới và Edge Function (service_role) đụng được
revoke all on share_tokens from anon, authenticated;

create or replace function create_share_token() returns text
language plpgsql security definer set search_path=public as $$
declare t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');   -- 64 ký tự hex
begin
  if auth.uid() is null or my_space() is null then raise exception 'Bạn chưa vào Space nào'; end if;
  insert into share_tokens(user_id, token_hash) values(auth.uid(), encode(sha256(convert_to(t, 'UTF8')), 'hex'))
    on conflict(user_id) do update set token_hash = excluded.token_hash, created_at = now();
  return t;
end $$;

create or replace function revoke_share_token() returns void
language plpgsql security definer set search_path=public as $$
begin
  delete from share_tokens where user_id = auth.uid();
end $$;

revoke all on function create_share_token() from public, anon;
revoke all on function revoke_share_token() from public, anon;
grant execute on function create_share_token() to authenticated;
grant execute on function revoke_share_token() to authenticated;

-- Realtime: clip mới hiện ngay trên máy người nhận
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clips') then
    alter publication supabase_realtime add table clips;
  end if;
end $$;
