-- Giai đoạn 8: bài nhật ký riêng tư (DIARY-04)
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase7.sql. Chạy lại nhiều lần vẫn an toàn.
-- Chạy file này TRƯỚC khi đưa bản app mới (có công tắc "Chỉ mình tôi xem") lên Vercel.

alter table diary_entries add column if not exists is_private boolean not null default false;

-- bài riêng tư: chỉ tác giả đọc được (người kia không thấy dòng nào, kể cả khi truy vấn thẳng)
drop policy if exists di_r on diary_entries;
create policy di_r on diary_entries for select
  using (space_id=my_space() and (not is_private or author=auth.uid()));

-- chỉ tác giả được bật/tắt riêng tư (phase4: chỉ tác giả được sửa, và chỉ các cột trong danh sách này)
revoke update on diary_entries from authenticated, anon;
grant update (entry_date, title, body, mood, moment_id, plan_id, is_private) on diary_entries to authenticated;

-- ảnh của bài riêng tư cũng bị ẩn: người kia không có dòng diary_media nên không biết đường dẫn tệp.
-- Truy vấn con trên diary_entries chịu RLS của chính người gọi, nên bài riêng tư của người khác không khớp.
drop policy if exists dm_r on diary_media;
create policy dm_r on diary_media for select
  using (space_id=my_space() and exists(select 1 from diary_entries e where e.id=entry_id));

-- on_this_day trả thêm tác giả và cờ riêng tư. Người dùng đã bị RLS lọc sẵn;
-- Edge Function dùng service_role (bỏ qua RLS) nên phải tự bỏ các dòng is_private.
drop function if exists on_this_day(date);
create function on_this_day(d date)
returns table(kind text, id uuid, space_id uuid, title text, day date, author uuid, is_private boolean)
language sql stable security invoker set search_path = public as $$
  select 'diary'::text, e.id, e.space_id, coalesce(nullif(trim(e.title),''), 'Nhật ký'), e.entry_date, e.author, e.is_private
    from diary_entries e
   where e.entry_date is not null
     and extract(month from e.entry_date) = extract(month from d)
     and extract(day from e.entry_date) = extract(day from d)
     and extract(year from e.entry_date) < extract(year from d)
  union all
  select 'moment'::text, m.id, m.space_id, m.title, m.taken_on, null::uuid, false
    from moments m
   where m.deleted_at is null
     and extract(month from m.taken_on) = extract(month from d)
     and extract(day from m.taken_on) = extract(day from d)
     and extract(year from m.taken_on) < extract(year from d)
  order by 5 desc $$;
revoke all on function on_this_day(date) from public, anon;
grant execute on function on_this_day(date) to authenticated, service_role;
