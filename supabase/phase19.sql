-- Giai đoạn 19: sửa lỗi C2 - người kia không xem được ảnh bìa kế hoạch.
-- Chạy SAU phase18.sql. Có thể chạy lại an toàn.
--
-- Nguyên nhân: policy đọc/sửa/xóa Storage ở phase17.sql không tham chiếu plans.cover_path,
-- nên chỉ người tải ảnh bìa lên thấy được (người kia nhận 403, ô bìa trống).
-- Cách sửa: thêm điều kiện plans.cover_path = name vào cả ba nhóm policy.

drop policy if exists media_read_visible on storage.objects;
drop policy if exists media_update_owned on storage.objects;
drop policy if exists media_delete_owned on storage.objects;

create policy media_read_visible on storage.objects
for select to authenticated
using (
  bucket_id = 'media'
  and (
    owner_id = auth.uid()::text
    or exists (
      select 1 from public.media md
      where md.space_id = my_space()
        and name in (md.path, md.thumb_path)
    )
    or exists (
      select 1 from public.diary_media dm
      where dm.space_id = my_space()
        and name in (dm.path, dm.thumb_path)
    )
    or exists (
      select 1 from public.wishlist_media wm
      where wm.space_id = my_space()
        and name in (wm.path, wm.thumb_path)
    )
    or exists (
      select 1 from public.messages msg
      where msg.space_id = my_space() and msg.media_path = name
    )
    or exists (
      select 1 from public.moments m
      where m.space_id = my_space() and name = any(m.photos)
    )
    or exists (
      select 1 from public.plans pl
      where pl.space_id = my_space() and pl.cover_path = name
    )
    or exists (
      select 1 from public.profiles p
      where p.space_id = my_space() and p.avatar_url = name
    )
  )
);

-- Cho sửa/xóa tệp của chính user (kể cả tệp mới upload chưa gắn metadata),
-- hoặc tệp đang thuộc bản ghi mà caller có quyền quản lý.
create policy media_update_owned on storage.objects
for update to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = my_space()::text
  and (
    owner_id = auth.uid()::text
    or coalesce((storage.foldername(name))[2], '') = auth.uid()::text
    or exists (
      select 1 from public.media md
      where md.space_id = my_space()
        and name in (md.path, md.thumb_path)
    )
    or exists (
      select 1 from public.diary_media dm
      join public.diary_entries de on de.id = dm.entry_id
      where dm.space_id = my_space() and de.author = auth.uid()
        and name in (dm.path, dm.thumb_path)
    )
    or exists (
      select 1 from public.wishlist_media wm
      where wm.space_id = my_space() and name in (wm.path, wm.thumb_path)
    )
    or exists (
      select 1 from public.messages msg
      where msg.space_id = my_space() and msg.sender = auth.uid() and msg.media_path = name
    )
    or exists (
      select 1 from public.moments m
      where m.space_id = my_space() and name = any(m.photos)
    )
    or exists (
      select 1 from public.plans pl
      where pl.space_id = my_space() and pl.cover_path = name
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.avatar_url = name
    )
  )
)
with check (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = my_space()::text
  and (
    owner_id = auth.uid()::text
    or coalesce((storage.foldername(name))[2], '') = auth.uid()::text
    or exists (
      select 1 from public.media md
      where md.space_id = my_space()
        and name in (md.path, md.thumb_path)
    )
    or exists (
      select 1 from public.diary_media dm
      join public.diary_entries de on de.id = dm.entry_id
      where dm.space_id = my_space() and de.author = auth.uid()
        and name in (dm.path, dm.thumb_path)
    )
    or exists (
      select 1 from public.wishlist_media wm
      where wm.space_id = my_space() and name in (wm.path, wm.thumb_path)
    )
    or exists (
      select 1 from public.messages msg
      where msg.space_id = my_space() and msg.sender = auth.uid() and msg.media_path = name
    )
    or exists (
      select 1 from public.moments m
      where m.space_id = my_space() and name = any(m.photos)
    )
    or exists (
      select 1 from public.plans pl
      where pl.space_id = my_space() and pl.cover_path = name
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.avatar_url = name
    )
  )
);

create policy media_delete_owned on storage.objects
for delete to authenticated
using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] = my_space()::text
  and (
    owner_id = auth.uid()::text
    or coalesce((storage.foldername(name))[2], '') = auth.uid()::text
    or exists (
      select 1 from public.media md
      where md.space_id = my_space()
        and name in (md.path, md.thumb_path)
    )
    or exists (
      select 1 from public.diary_media dm
      join public.diary_entries de on de.id = dm.entry_id
      where dm.space_id = my_space() and de.author = auth.uid()
        and name in (dm.path, dm.thumb_path)
    )
    or exists (
      select 1 from public.wishlist_media wm
      where wm.space_id = my_space() and name in (wm.path, wm.thumb_path)
    )
    or exists (
      select 1 from public.messages msg
      where msg.space_id = my_space() and msg.sender = auth.uid() and msg.media_path = name
    )
    or exists (
      select 1 from public.moments m
      where m.space_id = my_space() and name = any(m.photos)
    )
    or exists (
      select 1 from public.plans pl
      where pl.space_id = my_space() and pl.cover_path = name
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.avatar_url = name
    )
  )
);
