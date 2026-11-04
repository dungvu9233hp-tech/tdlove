-- Giai đoạn 12: Hộp thời gian (CAPSULE-01..03)
-- Chạy trong Supabase > SQL Editor, một lần, SAU phase11.sql. Chạy lại nhiều lần vẫn an toàn.
-- Một người viết thư (kèm tối đa 3 ảnh) và hẹn NGÀY mở. Trước ngày đó người kia chỉ thấy lời gợi ý và số ngày còn lại.
-- Khóa nội dung nằm ở server (RLS dùng now() của Postgres): sửa giờ máy hay gọi API trực tiếp cũng không đọc sớm được.
-- Người viết luôn xem lại được thư của mình.

-- capsules: thông tin hiển thị cho cả hai (ai chôn, ngày mở, lời gợi ý). KHÔNG chứa nội dung thư và ảnh.
create table if not exists capsules(
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces on delete cascade,
  author uuid not null default auth.uid() references auth.users on delete cascade,
  teaser text check (teaser is null or char_length(teaser) <= 140),   -- lời gợi ý, người kia thấy trước
  unlock_at timestamptz not null,                                      -- 00:00 (giờ máy người viết) của ngày mở
  photo_count int not null default 0 check (photo_count between 0 and 3),
  opened_at timestamptz,                                               -- lần đầu người kia mở
  notified_at timestamptz,                                             -- Edge Function `anniversary` đã đẩy thông báo "mở được rồi"
  created_at timestamptz default now());
create index if not exists capsules_space_idx on capsules(space_id, unlock_at);

-- capsule_contents: nội dung thật, chỉ đọc được khi tới ngày mở (hoặc là người viết)
create table if not exists capsule_contents(
  capsule_id uuid primary key references capsules on delete cascade,
  body text not null default '' check (char_length(body) <= 5000),
  photo_paths text[] not null default '{}');

alter table capsules enable row level security;
alter table capsule_contents enable row level security;

-- Không có policy insert/update: ghi dữ liệu chỉ qua create_capsule() và open_capsule() bên dưới.
drop policy if exists cp_r on capsules; drop policy if exists cp_d on capsules;
create policy cp_r on capsules for select using (space_id=my_space());
create policy cp_d on capsules for delete using (space_id=my_space() and author=auth.uid());
revoke insert, update on capsules from authenticated, anon;

drop policy if exists cc_r on capsule_contents;
create policy cc_r on capsule_contents for select using (exists(
  select 1 from capsules c where c.id=capsule_id and c.space_id=my_space() and (c.author=auth.uid() or c.unlock_at<=now())));
revoke insert, update, delete on capsule_contents from authenticated, anon;   -- xóa hộp thì nội dung tự xóa theo (on delete cascade)

-- Chôn hộp: kiểm tra ngày mở nằm sau hôm nay, ảnh nằm đúng thư mục của hộp, ghi cả hai bảng cùng lúc
create or replace function create_capsule(p_id uuid, p_teaser text, p_unlock timestamptz, p_body text, p_paths text[])
returns void language plpgsql security definer set search_path=public as $$
declare n int := coalesce(array_length(p_paths,1),0); sp uuid := my_space(); pth text;
begin
  if auth.uid() is null or sp is null then raise exception 'Bạn chưa vào Space nào'; end if;
  if p_unlock is null or p_unlock <= now() then raise exception 'Hãy chọn ngày mở sau hôm nay'; end if;
  if n > 3 then raise exception 'Mỗi hộp tối đa 3 ảnh'; end if;
  if char_length(btrim(coalesce(p_body,''))) = 0 and n = 0 then raise exception 'Hãy viết gì đó hoặc thêm một tấm ảnh'; end if;
  if char_length(coalesce(p_body,'')) > 5000 then raise exception 'Thư dài quá (tối đa 5000 ký tự)'; end if;
  if n > 0 then
    foreach pth in array p_paths loop
      if pth not like sp::text||'/'||p_id::text||'/%' then raise exception 'Đường dẫn ảnh không hợp lệ'; end if;
    end loop;
  end if;
  insert into capsules(id, space_id, author, teaser, unlock_at, photo_count)
    values(p_id, sp, auth.uid(), nullif(btrim(coalesce(p_teaser,'')),''), p_unlock, n);
  insert into capsule_contents(capsule_id, body, photo_paths) values(p_id, btrim(coalesce(p_body,'')), coalesce(p_paths,'{}'));
end $$;

-- Đánh dấu "đã mở": chỉ người KHÔNG phải tác giả, chỉ khi đã tới ngày, chỉ ghi lần đầu
create or replace function open_capsule(cid uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update capsules set opened_at = now()
   where id = cid and space_id = my_space() and author <> auth.uid() and unlock_at <= now() and opened_at is null;
end $$;

revoke all on function create_capsule(uuid, text, timestamptz, text, text[]) from public, anon;
revoke all on function open_capsule(uuid) from public, anon;
grant execute on function create_capsule(uuid, text, timestamptz, text, text[]) to authenticated;
grant execute on function open_capsule(uuid) to authenticated;

-- Ảnh nằm ở bucket riêng `capsules` (KHÔNG dùng bucket `media`: policy media_all cho người kia liệt kê và tải mọi tệp trong thư mục Space,
-- nên ảnh sẽ lộ trước ngày mở). Đường dẫn: <space_id>/<capsule_id>/<số>.jpg
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values('capsules', 'capsules', false, 5242880, array['image/jpeg'])
  on conflict(id) do update set public=false, file_size_limit=5242880, allowed_mime_types=array['image/jpeg'];

drop policy if exists capsules_obj_i on storage.objects; drop policy if exists capsules_obj_r on storage.objects; drop policy if exists capsules_obj_d on storage.objects;
create policy capsules_obj_i on storage.objects for insert to authenticated
  with check (bucket_id='capsules' and (storage.foldername(name))[1]=my_space()::text);
-- đọc được ảnh chỉ khi hộp tương ứng đã mở khóa (hoặc mình là người viết)
create policy capsules_obj_r on storage.objects for select to authenticated
  using (bucket_id='capsules' and exists(
    select 1 from capsules c where c.id::text=(storage.foldername(name))[2] and c.space_id::text=(storage.foldername(name))[1]
      and c.space_id=my_space() and (c.author=auth.uid() or c.unlock_at<=now())));
-- chỉ người đã tải lên mới xóa được (người viết xóa hộp thì app xóa luôn ảnh)
create policy capsules_obj_d on storage.objects for delete to authenticated
  using (bucket_id='capsules' and owner_id=auth.uid()::text and (storage.foldername(name))[1]=my_space()::text);
