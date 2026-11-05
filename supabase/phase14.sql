-- Giai đoạn 14: Giải trí tương tác (thả cảm xúc, bình luận, yêu thích, xem cùng nhau)
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase13.sql. Chạy lại nhiều lần vẫn an toàn.
-- Mọi thay đổi nằm trên bảng clips của phase13; app vẫn không lưu video của TikTok.

-- 1. Cảm xúc và yêu thích nằm ngay trên dòng clip, nên cập nhật realtime sẵn có của clips là đủ để hai máy thấy nhau.
--    reactions: mỗi người một ô {"<user id>": "emoji"}, cùng cách với cột reactions của messages (phase5).
alter table clips
  add column if not exists reactions jsonb not null default '{}'::jsonb,
  add column if not exists starred boolean not null default false,
  add column if not exists comments int not null default 0;     -- số bình luận, do trigger giữ đúng

-- Thả/bỏ cảm xúc: thả lại đúng emoji đang chọn thì gỡ, emoji khác thì đổi. Làm trong một lệnh để hai người thả cùng lúc không đè nhau.
create or replace function react_clip(p_clip uuid, p_emoji text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or my_space() is null then raise exception 'Bạn chưa vào Space nào'; end if;
  if p_emoji is null or char_length(p_emoji) not between 1 and 8 then raise exception 'Emoji không hợp lệ'; end if;
  update clips set reactions = case when reactions->>(auth.uid()::text) = p_emoji then reactions - (auth.uid()::text)
                                    else reactions || jsonb_build_object(auth.uid()::text, p_emoji) end
   where id = p_clip and space_id = my_space();
  if not found then raise exception 'Không tìm thấy clip'; end if;
end $$;

-- Đánh dấu yêu thích: chung cho cả hai ("clip của tụi mình")
create or replace function star_clip(p_clip uuid, p_on boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or my_space() is null then raise exception 'Bạn chưa vào Space nào'; end if;
  update clips set starred = coalesce(p_on, false) where id = p_clip and space_id = my_space();
  if not found then raise exception 'Không tìm thấy clip'; end if;
end $$;

revoke all on function react_clip(uuid, text) from public, anon;
revoke all on function star_clip(uuid, boolean) from public, anon;
grant execute on function react_clip(uuid, text) to authenticated;
grant execute on function star_clip(uuid, boolean) to authenticated;

-- 2. Bình luận dưới từng clip
create table if not exists clip_comments(
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references clips on delete cascade,
  space_id uuid not null references spaces on delete cascade,
  author uuid not null references auth.users on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now());
create index if not exists clip_comments_idx on clip_comments(clip_id, created_at);

alter table clip_comments enable row level security;
drop policy if exists cc_r on clip_comments; drop policy if exists cc_i on clip_comments; drop policy if exists cc_d on clip_comments;
create policy cc_r on clip_comments for select using (space_id = my_space());
-- chỉ bình luận bằng tên mình, vào clip của Space mình
create policy cc_i on clip_comments for insert with check (
  space_id = my_space() and author = auth.uid()
  and exists (select 1 from clips c where c.id = clip_id and c.space_id = my_space()));
create policy cc_d on clip_comments for delete using (space_id = my_space() and author = auth.uid());   -- chỉ xóa bình luận của chính mình
revoke update on clip_comments from authenticated, anon;
revoke all on clip_comments from anon;

create or replace function clip_comments_count() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op = 'INSERT' then update clips set comments = comments + 1 where id = new.clip_id;
  else update clips set comments = greatest(comments - 1, 0) where id = old.clip_id;
  end if;
  return null;
end $$;
revoke all on function clip_comments_count() from public, anon, authenticated;
drop trigger if exists clip_comments_cnt on clip_comments;
create trigger clip_comments_cnt after insert or delete on clip_comments for each row execute function clip_comments_count();

-- 3. Realtime: bình luận mới hiện ngay
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clip_comments') then
    alter publication supabase_realtime add table clip_comments;
  end if;
end $$;

-- 4. Kênh "xem cùng nhau" là kênh broadcast private, chỉ hai người trong Space đọc/ghi được (cùng cách với kênh cuộc gọi, phase4/5).
--    Hai chính sách này được tạo lại đủ cả ba kênh: call-, typing- và together-.
drop policy if exists call_rt_read on realtime.messages;
drop policy if exists call_rt_write on realtime.messages;
create policy call_rt_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) in ('call-'||my_space()::text, 'typing-'||my_space()::text, 'together-'||my_space()::text));
create policy call_rt_write on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) in ('call-'||my_space()::text, 'typing-'||my_space()::text, 'together-'||my_space()::text));
