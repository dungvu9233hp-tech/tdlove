-- Giai đoạn 18: sửa lỗi không trả lời được một tin nhắn cụ thể (CHAT-05).
-- Chạy SAU phase17.sql. Có thể chạy lại an toàn.
--
-- Nguyên nhân: policy ms_i (phase5.sql) viết `m.id = reply_to` trong subquery lên chính bảng messages.
-- Bảng m cũng có cột reply_to nên tên không tiền tố bị hiểu là m.reply_to (không phải cột của hàng đang chèn),
-- điều kiện thành `m.id = m.reply_to` và luôn sai. Hậu quả: mọi tin có reply_to đều bị từ chối với lỗi
-- 'new row violates row-level security policy for table "messages"'.
-- Cách sửa: gọi hàng mới bằng tên bảng (messages.reply_to).

drop policy if exists ms_i on messages;
create policy ms_i on messages for insert with check (
  space_id = my_space() and sender = auth.uid() and reactions = '{}'::jsonb
  and (media_path is null or media_path like my_space()::text || '/%')
  and (messages.reply_to is null or exists (
        select 1 from messages m
        where m.id = messages.reply_to and m.space_id = my_space())));
