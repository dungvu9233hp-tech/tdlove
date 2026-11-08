-- Giai đoạn 26: lưu MẪU photobooth (chỉ cần chèn ảnh) và GÓC PHOTOBOOTH (đăng thành phẩm/mẫu, thả tim, bình luận, thông báo).
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase25.sql. Chạy lại nhiều lần vẫn an toàn.
--
-- Nguyên tắc (giống phase25):
--  * Mọi bảng đều khóa theo Space của mình (my_space()); người ngoài Space không đọc, không ghi được gì.
--  * Mẫu là của chung hai người: ai cũng dùng được, nhưng chỉ người tạo mới sửa/xóa mẫu của mình.
--  * Ảnh nằm trong bucket riêng `pbooth` (private), thư mục <space_id>/<user_id>/...; chỉ ghi/xóa được trong thư mục của chính mình.
--  * Bài đăng loại 'template' không có ảnh riêng, dùng ảnh xem trước của mẫu; xóa mẫu thì bài đăng của mẫu đó cũng mất.
--  * Thông báo do trigger (security definer) tạo ra, dùng chung bảng notifications của phase25.

-- ===== 1. Bucket ảnh riêng =====
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('pbooth', 'pbooth', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pbooth_read on storage.objects;
drop policy if exists pbooth_insert on storage.objects;
drop policy if exists pbooth_delete on storage.objects;
create policy pbooth_read on storage.objects for select to authenticated
  using (bucket_id = 'pbooth' and (storage.foldername(name))[1] = my_space()::text);
create policy pbooth_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'pbooth' and (storage.foldername(name))[1] = my_space()::text
              and (storage.foldername(name))[2] = auth.uid()::text);
create policy pbooth_delete on storage.objects for delete to authenticated
  using (bucket_id = 'pbooth' and (storage.foldername(name))[1] = my_space()::text
         and (storage.foldername(name))[2] = auth.uid()::text);

-- ===== 2. Mẫu photobooth =====
-- data: bố cục đã lưu (khung, màu nền, các ô ảnh để trống, sticker, chữ). Ảnh frame tự tải lên nằm trong data (đường dẫn Storage).
create table if not exists pb_templates(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces on delete cascade,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 200000),
  thumb_path text not null,
  preview_path text not null,
  created_at timestamptz not null default now());
create index if not exists pb_templates_space_idx on pb_templates(space_id, created_at desc);

alter table pb_templates enable row level security;
drop policy if exists pt_r on pb_templates; drop policy if exists pt_i on pb_templates;
drop policy if exists pt_u on pb_templates; drop policy if exists pt_d on pb_templates;
create policy pt_r on pb_templates for select using (space_id = my_space());
create policy pt_i on pb_templates for insert with check (
  space_id = my_space() and owner = auth.uid()
  and thumb_path like my_space()::text || '/' || auth.uid()::text || '/%'
  and preview_path like my_space()::text || '/' || auth.uid()::text || '/%');
create policy pt_u on pb_templates for update using (owner = auth.uid() and space_id = my_space()) with check (
  owner = auth.uid() and space_id = my_space()
  and thumb_path like my_space()::text || '/' || auth.uid()::text || '/%'
  and preview_path like my_space()::text || '/' || auth.uid()::text || '/%');
create policy pt_d on pb_templates for delete using (owner = auth.uid());
revoke all on pb_templates from anon;
revoke update on pb_templates from authenticated;
grant update (name, data, thumb_path, preview_path) on pb_templates to authenticated;

-- ===== 3. Bài đăng ở Góc Photobooth =====
create table if not exists pb_posts(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces on delete cascade,
  author uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('result', 'template')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  caption text not null default '' check (char_length(caption) <= 500),
  image_path text,
  thumb_path text,
  width int check (width is null or width between 1 and 20000),
  height int check (height is null or height between 1 and 20000),
  template_id uuid references pb_templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint pb_posts_kind_chk check (
    (kind = 'result' and image_path is not null and thumb_path is not null and template_id is null)
    or (kind = 'template' and template_id is not null and image_path is null and thumb_path is null)));
create index if not exists pb_posts_space_idx on pb_posts(space_id, created_at desc);
create unique index if not exists pb_posts_tpl_uq on pb_posts(template_id) where template_id is not null;   -- mỗi mẫu đăng một lần

alter table pb_posts enable row level security;
drop policy if exists pp_r on pb_posts; drop policy if exists pp_i on pb_posts;
drop policy if exists pp_u on pb_posts; drop policy if exists pp_d on pb_posts;
create policy pp_r on pb_posts for select using (space_id = my_space());
create policy pp_i on pb_posts for insert with check (
  space_id = my_space() and author = auth.uid()
  and (image_path is null or image_path like my_space()::text || '/' || auth.uid()::text || '/%')
  and (thumb_path is null or thumb_path like my_space()::text || '/' || auth.uid()::text || '/%')
  and (template_id is null or exists (select 1 from pb_templates t where t.id = pb_posts.template_id and t.space_id = my_space())));
create policy pp_u on pb_posts for update using (author = auth.uid() and space_id = my_space()) with check (author = auth.uid() and space_id = my_space());
create policy pp_d on pb_posts for delete using (author = auth.uid());
revoke all on pb_posts from anon;
revoke update on pb_posts from authenticated;
grant update (title, caption) on pb_posts to authenticated;

-- ===== 4. Thả tim =====
create table if not exists pb_hearts(
  post_id uuid not null references pb_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  space_id uuid not null references spaces on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id));
alter table pb_hearts enable row level security;
drop policy if exists ph_r on pb_hearts; drop policy if exists ph_i on pb_hearts; drop policy if exists ph_d on pb_hearts;
create policy ph_r on pb_hearts for select using (space_id = my_space());
create policy ph_i on pb_hearts for insert with check (
  space_id = my_space() and user_id = auth.uid()
  and exists (select 1 from pb_posts p where p.id = pb_hearts.post_id and p.space_id = my_space()));
create policy ph_d on pb_hearts for delete using (user_id = auth.uid());
revoke all on pb_hearts from anon;
revoke update on pb_hearts from authenticated;

-- ===== 5. Bình luận (trả lời một cấp, như Khoảnh khắc) =====
create table if not exists pb_comments(
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references pb_posts(id) on delete cascade,
  space_id uuid not null references spaces on delete cascade,
  author uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id uuid references pb_comments(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now());
create index if not exists pb_comments_post_idx on pb_comments(post_id, created_at);

-- Chỉ một cấp trả lời: trả lời một câu trả lời thì gắn vào bình luận gốc
create or replace function pbc_before() returns trigger language plpgsql security definer set search_path=public as $$
declare gp uuid;
begin
  if new.parent_id is not null then
    select parent_id into gp from pb_comments where id = new.parent_id;
    if gp is not null then new.parent_id := gp; end if;
  end if;
  return new;
end $$;
revoke all on function pbc_before() from public, anon, authenticated;
drop trigger if exists pbc_before_t on pb_comments;
create trigger pbc_before_t before insert on pb_comments for each row execute function pbc_before();

alter table pb_comments enable row level security;
drop policy if exists pc_r on pb_comments; drop policy if exists pc_i on pb_comments; drop policy if exists pc_d on pb_comments;
create policy pc_r on pb_comments for select using (space_id = my_space());
create policy pc_i on pb_comments for insert with check (
  space_id = my_space() and author = auth.uid()
  and exists (select 1 from pb_posts p where p.id = pb_comments.post_id and p.space_id = my_space())
  and (pb_comments.parent_id is null or exists (
        select 1 from pb_comments c
        where c.id = pb_comments.parent_id and c.post_id = pb_comments.post_id and c.space_id = my_space())));
create policy pc_d on pb_comments for delete using (author = auth.uid());
revoke all on pb_comments from anon;
revoke update on pb_comments from authenticated;

-- ===== 6. Thông báo: dùng lại bảng notifications của phase25 =====
alter table notifications add column if not exists pb_post_id uuid references pb_posts(id) on delete cascade;
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('moment', 'moment_comment', 'moment_reply', 'pb_post', 'pb_comment', 'pb_reply'));
create index if not exists notifications_pb_idx on notifications(pb_post_id) where pb_post_id is not null;

-- Có bài mới: báo cho người còn lại
create or replace function notify_pb_post() returns trigger language plpgsql security definer set search_path=public as $$
declare r uuid;
begin
  for r in select id from profiles where space_id = new.space_id and id <> new.author loop
    insert into notifications(space_id, user_id, actor, kind, pb_post_id, moment_title, body)
    values (new.space_id, r, new.author, 'pb_post', new.id, left(new.title, 200), left(new.caption, 200));
  end loop;
  return null;
end $$;
revoke all on function notify_pb_post() from public, anon, authenticated;
drop trigger if exists pb_posts_notify_t on pb_posts;
create trigger pb_posts_notify_t after insert on pb_posts for each row execute function notify_pb_post();

-- Có bình luận mới (hoặc câu trả lời): báo cho người còn lại
create or replace function notify_pb_comment() returns trigger language plpgsql security definer set search_path=public as $$
declare r uuid; ttl text;
begin
  select title into ttl from pb_posts where id = new.post_id;
  for r in select id from profiles where space_id = new.space_id and id <> new.author loop
    insert into notifications(space_id, user_id, actor, kind, pb_post_id, moment_title, body)
    values (new.space_id, r, new.author, case when new.parent_id is not null then 'pb_reply' else 'pb_comment' end,
            new.post_id, left(coalesce(ttl, ''), 200), left(new.body, 200));
  end loop;
  return null;
end $$;
revoke all on function notify_pb_comment() from public, anon, authenticated;
drop trigger if exists pb_comments_notify_t on pb_comments;
create trigger pb_comments_notify_t after insert on pb_comments for each row execute function notify_pb_comment();

-- ===== 7. Realtime =====
do $$ declare t text; begin
  foreach t in array array['pb_templates', 'pb_posts', 'pb_hearts', 'pb_comments'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
