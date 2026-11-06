-- Giai đoạn 20: vá lỗi mức trung bình T4 và T9 (báo cáo rà soát 07/11/2026).
-- Chạy SAU phase19.sql. Có thể chạy lại an toàn.

-- T4: chỉ còn sửa được tên và ngày bắt đầu yêu của Space (trước đây mọi thành viên sửa được mọi cột,
-- kể cả invite_code/invite_expires). Các hàm security definer (renew_invite, join_space) vẫn ghi bình thường.
revoke update on spaces from authenticated, anon;
grant update (name, start_date) on spaces to authenticated;
drop policy if exists sp_u on spaces;
create policy sp_u on spaces for update using (id = my_space()) with check (id = my_space());

-- T4: ngày bắt đầu yêu phải từ 01/01/1950 đến hôm nay (giờ Việt Nam, chừa 1 ngày lệch múi giờ máy).
-- Ngày quá cũ làm điểm cấp độ (level_stats) phình ra hàng trăm nghìn; ngày tương lai làm số ngày âm.
-- Dùng trigger (không dùng CHECK vì now() không bất biến); chỉ kiểm khi giá trị thay đổi nên dữ liệu cũ không bị chặn.
create or replace function spaces_check_start_date() returns trigger language plpgsql as $$
begin
  if new.start_date is not null
     and (tg_op = 'INSERT' or new.start_date is distinct from old.start_date)
     and (new.start_date < date '1950-01-01'
          or new.start_date > (now() at time zone 'Asia/Ho_Chi_Minh')::date + 1) then
    raise exception 'Ngày bắt đầu yêu phải từ 01/01/1950 đến hôm nay';
  end if;
  return new;
end $$;
drop trigger if exists spaces_start_date_chk on spaces;
create trigger spaces_start_date_chk before insert or update on spaces
  for each row execute function spaces_check_start_date();

-- T9: create_space không được gọi khi đã ở trong một Space (trước đây gọi lại là rời Space cũ và bỏ lại một người).
create or replace function create_space(p_name text) returns text language plpgsql security definer set search_path = public as $$
declare s spaces; begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập'; end if;
  if exists (select 1 from profiles where id = auth.uid() and space_id is not null) then
    raise exception 'Bạn đã ở trong một Space rồi'; end if;
  insert into spaces default values returning * into s;
  insert into profiles(id, space_id, display_name) values (auth.uid(), s.id, p_name)
    on conflict (id) do update set space_id = s.id, display_name = p_name;
  return s.invite_code; end $$;
revoke all on function create_space(text) from public, anon;
grant execute on function create_space(text) to authenticated;
