-- Giai đoạn 21: sửa lỗi T7 - gọi khi app bên nhận đang đóng (CALL-05).
-- Chạy SAU phase20.sql. Có thể chạy lại an toàn.
--
-- Nguyên nhân: lời mời gọi chỉ đi qua kênh broadcast (không lưu lại). Bên nhận đóng app nhận được thông báo đẩy,
-- nhưng mở app thì lời mời đã mất nên cuộc gọi không bao giờ kết nối.
-- Cách sửa: người gọi ghi một dòng vào bảng calls (trạng thái 'ringing'); app bên nhận hỏi hàm ringing_call()
-- khi mở app / quay lại app. Hàm tính theo giờ server nên không lệch đồng hồ máy. Tín hiệu WebRTC vẫn đi qua broadcast.

create table if not exists calls(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null default my_space(),
  caller uuid not null default auth.uid(),
  video boolean not null default false,
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'ended')),
  created_at timestamptz not null default now());
create index if not exists calls_space_idx on calls(space_id, created_at desc);
alter table calls enable row level security;
drop policy if exists calls_r on calls;
drop policy if exists calls_i on calls;
drop policy if exists calls_u on calls;
create policy calls_r on calls for select using (space_id = my_space());
create policy calls_i on calls for insert with check (space_id = my_space() and caller = auth.uid());
create policy calls_u on calls for update using (space_id = my_space() and caller = auth.uid())
  with check (space_id = my_space() and caller = auth.uid());
revoke all on calls from anon, authenticated;
grant select, insert on calls to authenticated;
grant update (status) on calls to authenticated;

-- Cuộc gọi đang đổ chuông (do người kia gọi, trong 30 giây gần nhất), kèm số mili giây còn lại của lần đổ chuông.
create or replace function ringing_call()
returns table(id uuid, video boolean, left_ms integer)
language sql stable security invoker set search_path = public as $$
  select c.id, c.video,
         greatest(1000, 30000 - (extract(epoch from (now() - c.created_at)) * 1000)::integer)
  from calls c
  where c.space_id = my_space() and c.caller <> auth.uid() and c.status = 'ringing'
    and c.created_at > now() - interval '30 seconds'
  order by c.created_at desc limit 1
$$;
revoke all on function ringing_call() from public, anon;
grant execute on function ringing_call() to authenticated;

-- Dọn dòng cũ khi có cuộc gọi mới (giữ 30 ngày gần nhất), không cần cron.
create or replace function calls_trim() returns trigger language plpgsql security definer set search_path = public as $$
begin delete from calls where space_id = new.space_id and created_at < now() - interval '30 days'; return null; end $$;
drop trigger if exists calls_trim_t on calls;
create trigger calls_trim_t after insert on calls for each statement execute function calls_trim();
