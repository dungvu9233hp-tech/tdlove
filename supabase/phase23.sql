-- Giai đoạn 23: sửa lỗi T15 (Kế hoạch) và L3 (bình chọn Thích/Không ghi đè nhau).
-- Chạy SAU phase22.sql. Có thể chạy lại an toàn.

-- T15 / PLAN-02: giờ kết thúc của điểm dừng (SRS có, schema chưa có cột).
alter table stops add column if not exists end_time time;

-- L3: trước đây app đọc cả cột likes rồi ghi đè toàn bộ, nên hai người bấm cùng lúc thì mất phiếu của một người.
-- Hàm này chỉ ghi phiếu của chính người gọi (jsonb_set), qua RLS của stops nên chỉ thấy điểm dừng trong Space của mình.
create or replace function set_stop_vote(p_stop uuid, p_vote integer) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if p_vote not in (-1, 0, 1) then raise exception 'Phiếu không hợp lệ'; end if;
  update stops
     set likes = jsonb_set(coalesce(likes, '{}'::jsonb), array[auth.uid()::text], to_jsonb(p_vote), true)
   where id = p_stop and space_id = my_space();
end $$;
revoke all on function set_stop_vote(uuid, integer) from public, anon;
grant execute on function set_stop_vote(uuid, integer) to authenticated;
