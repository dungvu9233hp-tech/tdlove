-- Giai đoạn 25: thông báo trong app (khoảnh khắc mới, bình luận mới), trả lời bình luận, GIF cho chat và bình luận.
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase24.sql. Chạy lại nhiều lần vẫn an toàn.
--
-- Nguyên tắc:
--  * Bảng notifications chỉ do trigger (security definer) ghi; trình duyệt chỉ đọc, đánh dấu đã đọc (cột read_at) và xóa của chính mình.
--  * Trả lời bình luận chỉ có MỘT cấp: trả lời một câu trả lời thì tự gắn vào bình luận gốc (trigger mc_before).
--  * GIF có hai nguồn: tệp người dùng tải lên bucket riêng `gifs` (gif_path) hoặc link GIPHY (gif_url). Link ngoài chỉ nhận
--    đúng tên miền giphy.com và do chính cơ sở dữ liệu kiểm tra, nên không ai chèn được link bất kỳ vào chat/bình luận.

-- ===== 1. Bình luận Khoảnh khắc: trả lời + GIF =====
alter table moment_comments
  add column if not exists parent_id uuid references moment_comments(id) on delete cascade,
  add column if not exists kind text not null default 'text',
  add column if not exists gif_path text,
  add column if not exists gif_url text;

-- Ràng buộc cũ (phase6) bắt buộc có chữ; bình luận GIF được phép không có chữ
alter table moment_comments drop constraint if exists moment_comments_body_check;
alter table moment_comments drop constraint if exists mc_content_chk;
alter table moment_comments add constraint mc_content_chk check (
  char_length(body) <= 1000 and (
    (kind = 'text' and gif_path is null and gif_url is null and char_length(body) >= 1)
    or (kind = 'gif' and ((gif_path is not null) <> (gif_url is not null))
        and (gif_url is null or (char_length(gif_url) <= 600 and gif_url ~ '^https://(media[0-9]*|i)\.giphy\.com/[^[:space:]<>"'']+$')))));
create index if not exists moment_comments_parent_idx on moment_comments(parent_id) where parent_id is not null;

-- Chỉ một cấp trả lời: trả lời một câu trả lời thì gắn vào bình luận gốc của nó
create or replace function mc_before() returns trigger language plpgsql security definer set search_path=public as $$
declare gp uuid;
begin
  if new.parent_id is not null then
    select parent_id into gp from moment_comments where id = new.parent_id;
    if gp is not null then new.parent_id := gp; end if;
  end if;
  return new;
end $$;
revoke all on function mc_before() from public, anon, authenticated;
drop trigger if exists mc_before_t on moment_comments;
create trigger mc_before_t before insert on moment_comments for each row execute function mc_before();

-- Viết bình luận: đúng tên mình, vào khoảnh khắc của Space mình; bình luận cha phải cùng khoảnh khắc; tệp GIF nằm trong thư mục Space
-- (gọi hàng mới bằng tên bảng để không bị nhầm với bảng con cùng tên, xem phase18.sql)
drop policy if exists mc_i on moment_comments;
create policy mc_i on moment_comments for insert with check (
  space_id = my_space() and author = auth.uid()
  and (gif_path is null or gif_path like my_space()::text || '/%')
  and exists (select 1 from moments m where m.id = moment_comments.moment_id and m.space_id = my_space())
  and (moment_comments.parent_id is null or exists (
        select 1 from moment_comments p
        where p.id = moment_comments.parent_id and p.moment_id = moment_comments.moment_id and p.space_id = my_space())));

-- ===== 2. Chat: tin nhắn GIF =====
alter table messages
  add column if not exists gif_path text,
  add column if not exists gif_url text;
alter table messages drop constraint if exists msg_kind_chk;
alter table messages add constraint msg_kind_chk check (kind in ('text','image','video','voice','location','gif'));
alter table messages drop constraint if exists msg_gif_chk;
alter table messages add constraint msg_gif_chk check (
  (kind = 'gif' and ((gif_path is not null) <> (gif_url is not null))
     and (gif_url is null or (char_length(gif_url) <= 600 and gif_url ~ '^https://(media[0-9]*|i)\.giphy\.com/[^[:space:]<>"'']+$')))
  or (kind <> 'gif' and gif_path is null and gif_url is null));

-- Giữ nguyên các điều kiện của phase18, thêm: tệp GIF phải nằm trong thư mục Space
drop policy if exists ms_i on messages;
create policy ms_i on messages for insert with check (
  space_id = my_space() and sender = auth.uid() and reactions = '{}'::jsonb
  and (media_path is null or media_path like my_space()::text || '/%')
  and (gif_path is null or gif_path like my_space()::text || '/%')
  and (messages.reply_to is null or exists (
        select 1 from messages m
        where m.id = messages.reply_to and m.space_id = my_space())));

-- ===== 3. Bộ sưu tập GIF chung của hai người =====
create table if not exists gifs(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces on delete cascade,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  path text,
  url text,
  created_at timestamptz not null default now(),
  constraint gifs_one_chk check ((path is not null) <> (url is not null)),
  constraint gifs_url_chk check (url is null or (char_length(url) <= 600 and url ~ '^https://(media[0-9]*|i)\.giphy\.com/[^[:space:]<>"'']+$')));
create unique index if not exists gifs_uniq on gifs(space_id, coalesce(path, url));
create index if not exists gifs_space_idx on gifs(space_id, created_at desc);

alter table gifs enable row level security;
drop policy if exists gf_r on gifs; drop policy if exists gf_i on gifs; drop policy if exists gf_d on gifs;
create policy gf_r on gifs for select using (space_id = my_space());
create policy gf_i on gifs for insert with check (
  space_id = my_space() and owner = auth.uid()
  and (path is null or path like my_space()::text || '/' || auth.uid()::text || '/%'));
-- bộ sưu tập là của chung nên ai trong Space cũng gỡ được; tệp trong Storage vẫn giữ để tin cũ không bị mất ảnh
create policy gf_d on gifs for delete using (space_id = my_space());
revoke all on gifs from anon;
revoke update on gifs from authenticated;

-- Bucket riêng, private. Chỉ nhận GIF/WebP tối đa 8 MB. Chỉ đọc và thêm; không sửa/xóa vì tin nhắn cũ còn trỏ tới tệp.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('gifs', 'gifs', false, 8388608, array['image/gif', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists gifs_read on storage.objects;
drop policy if exists gifs_insert on storage.objects;
create policy gifs_read on storage.objects for select to authenticated
  using (bucket_id = 'gifs' and (storage.foldername(name))[1] = my_space()::text);
create policy gifs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gifs' and (storage.foldername(name))[1] = my_space()::text
              and (storage.foldername(name))[2] = auth.uid()::text);

-- ===== 4. Thông báo trong app =====
create table if not exists notifications(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,        -- người nhận
  actor uuid references auth.users on delete set null,                  -- người gây ra thông báo
  kind text not null check (kind in ('moment', 'moment_comment', 'moment_reply')),
  moment_id uuid references moments(id) on delete cascade,
  comment_id uuid references moment_comments(id) on delete cascade,
  moment_title text not null default '' check (char_length(moment_title) <= 200),
  body text not null default '' check (char_length(body) <= 200),
  read_at timestamptz,
  created_at timestamptz not null default now());
create index if not exists notifications_user_idx on notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on notifications(user_id) where read_at is null;
create index if not exists notifications_moment_idx on notifications(moment_id) where moment_id is not null;

alter table notifications enable row level security;
drop policy if exists nt_r on notifications; drop policy if exists nt_u on notifications; drop policy if exists nt_d on notifications;
create policy nt_r on notifications for select using (user_id = auth.uid());
create policy nt_u on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy nt_d on notifications for delete using (user_id = auth.uid());
revoke all on notifications from anon;
revoke insert, update on notifications from authenticated;     -- không ai tự tạo thông báo; chỉ trigger bên dưới
grant update (read_at) on notifications to authenticated;      -- chỉ được đánh dấu đã đọc

-- Có khoảnh khắc mới: báo cho người còn lại trong Space
create or replace function notify_moment() returns trigger language plpgsql security definer set search_path=public as $$
declare r uuid;
begin
  for r in select id from profiles where space_id = new.space_id and id is distinct from new.author loop
    insert into notifications(space_id, user_id, actor, kind, moment_id, moment_title, body)
    values (new.space_id, r, new.author, 'moment', new.id, left(new.title, 200), left(coalesce(new.description, ''), 200));
  end loop;
  return null;
end $$;
revoke all on function notify_moment() from public, anon, authenticated;
drop trigger if exists moments_notify_t on moments;
create trigger moments_notify_t after insert on moments for each row execute function notify_moment();

-- Có bình luận mới (hoặc câu trả lời): báo cho người còn lại
create or replace function notify_comment() returns trigger language plpgsql security definer set search_path=public as $$
declare r uuid; ttl text;
begin
  select title into ttl from moments where id = new.moment_id;
  for r in select id from profiles where space_id = new.space_id and id <> new.author loop
    insert into notifications(space_id, user_id, actor, kind, moment_id, comment_id, moment_title, body)
    values (new.space_id, r, new.author, case when new.parent_id is not null then 'moment_reply' else 'moment_comment' end,
            new.moment_id, new.id, left(coalesce(ttl, ''), 200),
            case when new.kind = 'gif' and btrim(new.body) = '' then 'Đã gửi một GIF' else left(new.body, 200) end);
  end loop;
  return null;
end $$;
revoke all on function notify_comment() from public, anon, authenticated;
drop trigger if exists moment_comments_notify_t on moment_comments;
create trigger moment_comments_notify_t after insert on moment_comments for each row execute function notify_comment();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;
