-- Giai đoạn 5: hoàn thiện Chat (CHAT-02 ảnh/video, CHAT-05 trả lời + cảm xúc, CHAT-06 tin thoại, CHAT-07 đang nhập)
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase4.sql. Chạy lại nhiều lần vẫn an toàn.

alter table messages
  add column if not exists kind text not null default 'text',
  add column if not exists media_path text,
  add column if not exists duration int,
  add column if not exists reply_to uuid references messages(id) on delete set null,
  add column if not exists reactions jsonb not null default '{}'::jsonb;
alter table messages drop constraint if exists msg_kind_chk;
alter table messages add constraint msg_kind_chk check (kind in ('text','image','video','voice','location'));
alter table messages drop constraint if exists msg_media_chk;
alter table messages add constraint msg_media_chk check (kind not in ('image','video','voice') or media_path is not null);
update messages set kind='location' where lat is not null and kind='text';   -- tin vị trí cũ

-- Chỉ được gửi tin vào Space của mình; tệp đính kèm phải nằm trong thư mục Space; tin được trả lời phải cùng Space
drop policy if exists ms_i on messages;
create policy ms_i on messages for insert with check (
  space_id=my_space() and sender=auth.uid() and reactions='{}'::jsonb
  and (media_path is null or media_path like my_space()::text||'/%')
  and (reply_to is null or exists (select 1 from messages m where m.id=reply_to and m.space_id=my_space())));

-- Thả/bỏ cảm xúc: hai người có thể thả cùng lúc nên làm trong một lệnh duy nhất, mỗi người một ô trong cột reactions.
-- Thả lại đúng emoji đang chọn thì gỡ ra; thả emoji khác thì đổi.
create or replace function react(p_msg uuid, p_emoji text) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or my_space() is null then raise exception 'Bạn chưa vào Space nào'; end if;
  if p_emoji is null or char_length(p_emoji) not between 1 and 8 then raise exception 'Emoji không hợp lệ'; end if;
  update messages set reactions = case when reactions->>(auth.uid()::text) = p_emoji then reactions - (auth.uid()::text)
                                       else reactions || jsonb_build_object(auth.uid()::text, p_emoji) end
   where id=p_msg and space_id=my_space();
  if not found then raise exception 'Không tìm thấy tin nhắn'; end if;
end $$;
revoke all on function react(uuid, text) from public, anon;
grant execute on function react(uuid, text) to authenticated;

-- CHAT-07: kênh "đang nhập" cũng là kênh private, chỉ hai người trong Space (cùng cách với kênh cuộc gọi ở phase4)
drop policy if exists call_rt_read on realtime.messages;
drop policy if exists call_rt_write on realtime.messages;
create policy call_rt_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) in ('call-'||my_space()::text, 'typing-'||my_space()::text));
create policy call_rt_write on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and (select realtime.topic()) in ('call-'||my_space()::text, 'typing-'||my_space()::text));
