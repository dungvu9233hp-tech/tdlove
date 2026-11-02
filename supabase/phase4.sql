-- Giai đoạn 4 (vá lỗi từ báo cáo rà soát 03/11/2026): chạy trong Supabase > SQL Editor, một lần, sau phase3.sql

-- #1: không cho client tự sửa space_id (nếu không, ai biết uuid của Space khác có thể tự nhảy vào).
-- Chỉ còn sửa được tên và ảnh đại diện; create_space/join_space là security definer nên vẫn gán space_id bình thường.
revoke update on profiles from authenticated, anon;
grant update (display_name, avatar_url) on profiles to authenticated;

-- #2: tạo lại mã mời khi mã cũ hết hạn (chỉ khi Space chưa đủ hai người)
create or replace function renew_invite() returns text language plpgsql security definer set search_path=public as $$
declare c text; begin
  if my_space() is null then raise exception 'Bạn chưa ở trong Space nào'; end if;
  if (select count(*) from profiles where space_id=my_space())>=2 then raise exception 'Space này đã đủ hai người'; end if;
  update spaces set invite_code=substr(md5(random()::text),1,8), invite_expires=now()+interval '24 hours'
    where id=my_space() returning invite_code into c;
  return c; end $$;
revoke all on function renew_invite() from public, anon;
grant execute on function renew_invite() to authenticated;

-- ====== Phần 2: #6, #8, #9, #11, #12 (chạy sau phần 1, vẫn trong phase4) ======

-- #6: hết giờ chia sẻ thì người kia không đọc được vị trí nữa (chủ vị trí vẫn thấy dòng của mình để tắt/gia hạn)
drop policy if exists lo_r on locations;
create policy lo_r on locations for select using (space_id=my_space() and (user_id=auth.uid() or share_until>now()));
delete from locations where share_until<now();   -- dọn các dòng vị trí đã hết hạn còn sót

-- #8: kênh tín hiệu cuộc gọi chuyển sang kênh private, chỉ hai người trong Space đọc/ghi được kênh call-<space id>
drop policy if exists call_rt_read on realtime.messages;
drop policy if exists call_rt_write on realtime.messages;
create policy call_rt_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) = 'call-' || my_space()::text);
create policy call_rt_write on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and (select realtime.topic()) = 'call-' || my_space()::text);

-- #9: mã mời 12 ký tự, join_space khóa dòng Space khi kiểm tra số người, và giới hạn 5 lần nhập sai / 15 phút / tài khoản
alter table spaces alter column invite_code set default substr(replace(gen_random_uuid()::text,'-',''),1,12);
create or replace function renew_invite() returns text language plpgsql security definer set search_path=public as $$
declare c text; begin
  if my_space() is null then raise exception 'Bạn chưa ở trong Space nào'; end if;
  if (select count(*) from profiles where space_id=my_space())>=2 then raise exception 'Space này đã đủ hai người'; end if;
  update spaces set invite_code=substr(replace(gen_random_uuid()::text,'-',''),1,12), invite_expires=now()+interval '24 hours'
    where id=my_space() returning invite_code into c;
  return c; end $$;
create table if not exists join_attempts(user_id uuid not null, at timestamptz not null default now());
create index if not exists join_attempts_idx on join_attempts(user_id, at);
alter table join_attempts enable row level security;   -- không có policy: chỉ hàm security definer truy cập được
drop function if exists join_space(text, text);
-- Trả về 'ok' hoặc câu báo lỗi (không raise, để lần nhập sai vẫn được ghi lại, vì raise sẽ hoàn tác cả giao dịch)
create function join_space(p_code text, p_name text) returns text language plpgsql security definer set search_path=public as $$
declare s spaces; begin
  if auth.uid() is null then return 'Bạn cần đăng nhập'; end if;
  if (select count(*) from join_attempts where user_id=auth.uid() and at>now()-interval '15 minutes')>=5 then
    return 'Nhập sai mã mời quá nhiều lần, hãy thử lại sau 15 phút'; end if;
  if exists(select 1 from profiles where id=auth.uid() and space_id is not null) then return 'Bạn đã ở trong một Space rồi'; end if;
  select * into s from spaces where invite_code=lower(trim(p_code)) and invite_expires>now() for update;
  if s.id is null then insert into join_attempts(user_id) values(auth.uid()); return 'Mã mời không đúng hoặc đã hết hạn'; end if;
  if (select count(*) from profiles where space_id=s.id)>=2 then return 'Space này đã đủ hai người'; end if;
  insert into profiles(id,space_id,display_name) values(auth.uid(),s.id,p_name)
    on conflict(id) do update set space_id=s.id, display_name=p_name;
  update spaces set invite_expires=now()-interval '1 second' where id=s.id;
  delete from join_attempts where user_id=auth.uid();
  return 'ok'; end $$;
revoke all on function join_space(text, text) from public, anon;
grant execute on function join_space(text, text) to authenticated;

-- #11: giới hạn cột được sửa, và policy update có with check
drop policy if exists pr_u on profiles;
create policy pr_u on profiles for update using (id=auth.uid()) with check (id=auth.uid());
drop policy if exists ms_u on messages;   -- chỉ người nhận được đánh dấu "đã xem", và chỉ sửa cột seen_at
create policy ms_u on messages for update using (space_id=my_space() and sender<>auth.uid()) with check (space_id=my_space() and sender<>auth.uid());
revoke update on messages from authenticated, anon;
grant update (seen_at) on messages to authenticated;
drop policy if exists di_u on diary_entries;
create policy di_u on diary_entries for update using (author=auth.uid()) with check (author=auth.uid() and space_id=my_space());
revoke update on diary_entries from authenticated, anon;
grant update (entry_date, title, body, mood) on diary_entries to authenticated;

-- #12: lưu đăng ký nhận thông báo đẩy (mỗi trình duyệt/máy một dòng)
create table if not exists push_subscriptions(
  endpoint text primary key, user_id uuid not null default auth.uid() references auth.users on delete cascade,
  space_id uuid not null, p256dh text not null, auth text not null, created_at timestamptz default now());
alter table push_subscriptions enable row level security;
drop policy if exists ps_all on push_subscriptions;
create policy ps_all on push_subscriptions for all using (user_id=auth.uid()) with check (user_id=auth.uid() and space_id=my_space());
