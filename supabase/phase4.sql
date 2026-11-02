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
