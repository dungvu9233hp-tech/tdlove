-- Kiểm thử phase26: mẫu photobooth, bài đăng, thả tim, bình luận một cấp, thông báo, quyền theo Space, chạy lại an toàn.
-- Chạy từ thư mục gốc dự án (database rỗng):
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/phase25_stub.sql -f supabase/phase25.sql -f supabase/phase26.sql -f supabase/tests/phase26_test.sql
\set ON_ERROR_STOP on
grant delete on storage.objects to authenticated;

insert into auth.users(id) values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002'), ('cccccccc-0000-0000-0000-000000000003');
insert into spaces(id, name) values ('11111111-1111-1111-1111-111111111111', 'ab'), ('22222222-2222-2222-2222-222222222222', 'c');
insert into profiles(id, space_id, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'B'),
  ('cccccccc-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'C');

-- ===== 1. A lưu mẫu; B thấy, C không thấy =====
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
insert into pb_templates(id, space_id, name, data, thumb_path, preview_path) values
  ('eeeeeeee-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Dải 4 ô hồng', '{"v":1,"items":[]}',
   '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/t.jpg', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/p.jpg');
select t_as('bbbbbbbb-0000-0000-0000-000000000002');
do $$ begin assert (select count(*) from pb_templates) = 1, 'B thấy mẫu của A (cùng Space)'; end $$;
select t_as('cccccccc-0000-0000-0000-000000000003');
do $$ begin assert (select count(*) from pb_templates) = 0, 'C (Space khác) không thấy mẫu'; end $$;
reset role;
do $$ begin raise notice 'TEMPLATE visible ok'; end $$;

-- ===== 2. Không ghi được sai: lưu mẫu cho Space khác, giả mạo chủ, đường dẫn ảnh của người khác, sửa mẫu của người khác =====
select t_as('bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;
do $$ begin
  begin insert into pb_templates(space_id, name, data, thumb_path, preview_path) values ('22222222-2222-2222-2222-222222222222', 'x', '{}', 'a', 'a');
    raise exception 'phải chặn: ghi vào Space khác'; exception when insufficient_privilege then null; end;
  begin insert into pb_templates(space_id, owner, name, data, thumb_path, preview_path) values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'x', '{}', 'a', 'a');
    raise exception 'phải chặn: giả mạo chủ mẫu'; exception when insufficient_privilege then null; end;
  begin insert into pb_templates(space_id, name, data, thumb_path, preview_path) values ('11111111-1111-1111-1111-111111111111', 'x', '{}',
      '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/t.jpg', '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000002/p.jpg');
    raise exception 'phải chặn: ảnh nằm trong thư mục của người khác'; exception when insufficient_privilege then null; end;
  begin insert into pb_templates(space_id, name, data, thumb_path, preview_path) values ('11111111-1111-1111-1111-111111111111', '   ', '{}',
      '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000002/t.jpg', '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000002/p.jpg');
    raise exception 'phải chặn: tên rỗng'; exception when check_violation then null; end;
  begin insert into pb_templates(space_id, name, data, thumb_path, preview_path) values ('11111111-1111-1111-1111-111111111111', 'x', '[]',
      '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000002/t.jpg', '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000002/p.jpg');
    raise exception 'phải chặn: data không phải object'; exception when check_violation then null; end;
end $$;
update pb_templates set name = 'B đổi tên' where id = 'eeeeeeee-0000-0000-0000-00000000000a';
delete from pb_templates where id = 'eeeeeeee-0000-0000-0000-00000000000a';
reset role;
do $$ begin
  assert (select name from pb_templates where id = 'eeeeeeee-0000-0000-0000-00000000000a') = 'Dải 4 ô hồng', 'B không sửa/xóa được mẫu của A';
  raise notice 'TEMPLATE guards ok';
end $$;

-- ===== 3. Chủ mẫu đổi tên được; không đổi được owner/space_id =====
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
update pb_templates set name = 'Dải 4 ô hồng v2' where id = 'eeeeeeee-0000-0000-0000-00000000000a';
do $$ begin
  begin update pb_templates set owner = 'bbbbbbbb-0000-0000-0000-000000000002' where id = 'eeeeeeee-0000-0000-0000-00000000000a';
    raise exception 'phải chặn: đổi owner'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin assert (select name from pb_templates) = 'Dải 4 ô hồng v2', 'A đổi tên mẫu của mình'; raise notice 'TEMPLATE owner update ok'; end $$;

-- ===== 4. Bài đăng thành phẩm + bài đăng mẫu; thông báo cho người kia =====
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
insert into pb_posts(id, space_id, kind, title, caption, image_path, thumb_path, width, height) values
  ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'result', 'Ảnh Hồ Tây', 'Hôm nay xinh',
   '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/r.jpg', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/rt.jpg', 1200, 1600);
insert into pb_posts(id, space_id, kind, title, template_id) values
  ('f0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'template', 'Mẫu dải 4 ô', 'eeeeeeee-0000-0000-0000-00000000000a');
do $$ begin
  begin insert into pb_posts(space_id, kind, title, template_id) values ('11111111-1111-1111-1111-111111111111', 'template', 'Đăng lần hai', 'eeeeeeee-0000-0000-0000-00000000000a');
    raise exception 'phải chặn: đăng một mẫu hai lần'; exception when unique_violation then null; end;
  begin insert into pb_posts(space_id, kind, title) values ('11111111-1111-1111-1111-111111111111', 'result', 'Thiếu ảnh');
    raise exception 'phải chặn: thành phẩm không có ảnh'; exception when check_violation then null; end;
  begin insert into pb_posts(space_id, kind, title, image_path, thumb_path, template_id) values ('11111111-1111-1111-1111-111111111111', 'template', 'Mẫu có ảnh riêng',
        '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/r.jpg', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/rt.jpg', 'eeeeeeee-0000-0000-0000-00000000000a');
    raise exception 'phải chặn: bài mẫu không được có ảnh riêng'; exception when check_violation or unique_violation then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from notifications where kind = 'pb_post') = 2, 'hai bài đăng = hai thông báo';
  assert (select count(*) from notifications where kind = 'pb_post' and user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 2, 'thông báo bài đăng gửi cho B';
  assert (select count(*) from notifications where kind = 'pb_post' and user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'không báo cho người đăng';
  assert (select moment_title from notifications where pb_post_id = 'f0000000-0000-0000-0000-000000000001') = 'Ảnh Hồ Tây', 'thông báo mang tiêu đề bài';
  raise notice 'POST + notify ok';
end $$;

-- ===== 5. C (Space khác) không thấy, không bình luận/thả tim được bài của A và B =====
select t_as('cccccccc-0000-0000-0000-000000000003');
set role authenticated;
do $$ begin
  assert (select count(*) from pb_posts) = 0, 'C không thấy bài';
  begin insert into pb_comments(post_id, space_id, body) values ('f0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'chen ngang');
    raise exception 'phải chặn: bình luận bài của Space khác'; exception when insufficient_privilege then null; end;
  begin insert into pb_hearts(post_id, space_id) values ('f0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222');
    raise exception 'phải chặn: thả tim bài của Space khác'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin raise notice 'ISOLATION ok'; end $$;

-- ===== 6. Bình luận, trả lời, trả lời một câu trả lời (gom về một cấp), thông báo =====
select t_as('bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;
insert into pb_comments(id, post_id, space_id, body) values ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Đẹp quá');
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into pb_comments(id, post_id, space_id, body, parent_id) values ('c0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Cảm ơn nha', 'c0000000-0000-0000-0000-000000000001');
select t_as('bbbbbbbb-0000-0000-0000-000000000002');
insert into pb_comments(id, post_id, space_id, body, parent_id) values ('c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Lần sau chụp nữa', 'c0000000-0000-0000-0000-000000000002');
do $$ begin
  begin insert into pb_comments(post_id, space_id, body, parent_id) values ('f0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'cha ở bài khác', 'c0000000-0000-0000-0000-000000000001');
    raise exception 'phải chặn: bình luận cha thuộc bài khác'; exception when insufficient_privilege then null; end;
  begin insert into pb_comments(post_id, space_id, body) values ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '   ');
    raise exception 'phải chặn: bình luận rỗng'; exception when check_violation then null; end;
  begin insert into pb_comments(post_id, space_id, author, body) values ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'mạo danh');
    raise exception 'phải chặn: mạo danh người bình luận'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select parent_id from pb_comments where id = 'c0000000-0000-0000-0000-000000000003') = 'c0000000-0000-0000-0000-000000000001', 'trả lời một câu trả lời phải gắn về bình luận gốc';
  assert (select kind from notifications where kind like 'pb\_c%' and user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and body = 'Đẹp quá') = 'pb_comment', 'bình luận gốc báo cho chủ bài';
  assert (select kind from notifications where kind = 'pb_reply' and user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and body = 'Cảm ơn nha') = 'pb_reply', 'trả lời báo cho người bình luận gốc';
  assert (select count(*) from notifications where user_id = 'cccccccc-0000-0000-0000-000000000003') = 0, 'C không nhận thông báo nào';
  raise notice 'COMMENTS + notify ok';
end $$;

-- ===== 7. Thả tim: một người một tim, bỏ tim được, không mạo danh =====
select t_as('bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;
insert into pb_hearts(post_id, space_id) values ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
do $$ begin
  begin insert into pb_hearts(post_id, space_id) values ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
    raise exception 'phải chặn: thả tim hai lần'; exception when unique_violation then null; end;
  begin insert into pb_hearts(post_id, space_id, user_id) values ('f0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001');
    raise exception 'phải chặn: thả tim hộ người khác'; exception when insufficient_privilege then null; end;
end $$;
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
delete from pb_hearts where post_id = 'f0000000-0000-0000-0000-000000000001';      -- tim của B, A không xóa được
reset role;
do $$ begin assert (select count(*) from pb_hearts) = 1, 'A không gỡ được tim của B'; raise notice 'HEARTS ok'; end $$;

-- ===== 8. Quyền xóa/sửa bài và bình luận: chỉ chủ của chúng =====
select t_as('bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;
delete from pb_posts where id = 'f0000000-0000-0000-0000-000000000001';             -- bài của A
update pb_posts set title = 'B sửa bậy' where id = 'f0000000-0000-0000-0000-000000000001';
delete from pb_comments where id = 'c0000000-0000-0000-0000-000000000002';         -- bình luận của A
do $$ begin
  begin update pb_posts set author = 'bbbbbbbb-0000-0000-0000-000000000002' where id = 'f0000000-0000-0000-0000-000000000001';
    raise exception 'phải chặn: đổi tác giả'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from pb_posts where id = 'f0000000-0000-0000-0000-000000000001' and title = 'Ảnh Hồ Tây') = 1, 'B không xóa/sửa được bài của A';
  assert (select count(*) from pb_comments where id = 'c0000000-0000-0000-0000-000000000002') = 1, 'B không xóa được bình luận của A';
  raise notice 'OWNERSHIP ok';
end $$;
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
update pb_posts set title = 'Ảnh Hồ Tây (sửa)', caption = 'Đã sửa' where id = 'f0000000-0000-0000-0000-000000000001';
delete from pb_comments where id = 'c0000000-0000-0000-0000-000000000001';         -- không phải của A: không xóa
do $$ begin assert (select count(*) from pb_comments where id = 'c0000000-0000-0000-0000-000000000001') = 1, 'A không xóa được bình luận của B'; end $$;
reset role;
do $$ begin assert (select title from pb_posts where id = 'f0000000-0000-0000-0000-000000000001') = 'Ảnh Hồ Tây (sửa)', 'A sửa được bài của mình'; end $$;

-- ===== 9. Xóa mẫu thì bài đăng của mẫu và thông báo liên quan biến mất; xóa bài thì bình luận/tim/thông báo biến mất =====
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
delete from pb_templates where id = 'eeeeeeee-0000-0000-0000-00000000000a';
delete from pb_posts where id = 'f0000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  assert (select count(*) from pb_posts) = 0, 'xóa mẫu kéo theo bài mẫu; xóa bài xong không còn bài';
  assert (select count(*) from pb_comments) = 0 and (select count(*) from pb_hearts) = 0, 'bình luận và tim đi theo bài';
  assert (select count(*) from notifications where pb_post_id is not null) = 0, 'thông báo đi theo bài';
  raise notice 'CASCADE ok';
end $$;

-- ===== 10. Storage: chỉ ghi/xóa trong thư mục của mình, chỉ đọc trong Space =====
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
insert into storage.objects(bucket_id, name) values ('pbooth', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/x.jpg');
do $$ begin
  begin insert into storage.objects(bucket_id, name) values ('pbooth', '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000002/y.jpg');
    raise exception 'phải chặn: ghi vào thư mục người khác'; exception when insufficient_privilege then null; end;
  begin insert into storage.objects(bucket_id, name) values ('pbooth', '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000001/z.jpg');
    raise exception 'phải chặn: ghi vào Space khác'; exception when insufficient_privilege then null; end;
end $$;
select t_as('bbbbbbbb-0000-0000-0000-000000000002');
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'pbooth') = 1, 'B đọc được ảnh của A (cùng Space)'; end $$;
delete from storage.objects where bucket_id = 'pbooth';                              -- không phải của B
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'pbooth') = 1, 'B không xóa được ảnh của A'; end $$;
select t_as('cccccccc-0000-0000-0000-000000000003');
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'pbooth') = 0, 'C không thấy ảnh Space khác'; end $$;
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
delete from storage.objects where bucket_id = 'pbooth';
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'pbooth') = 0, 'A xóa được ảnh của mình'; end $$;
reset role;
do $$ begin raise notice 'STORAGE ok'; end $$;

-- ===== 11. Quyền bảng + chạy lại phase26 không nhân đôi trigger/policy =====
do $$ begin
  assert not has_table_privilege('anon', 'pb_posts', 'select') and not has_table_privilege('anon', 'pb_templates', 'select')
     and not has_table_privilege('anon', 'pb_comments', 'select') and not has_table_privilege('anon', 'pb_hearts', 'select'), 'anon không đụng được bảng nào';
  assert not has_table_privilege('authenticated', 'pb_comments', 'update'), 'không sửa được bình luận';
  assert has_column_privilege('authenticated', 'pb_posts', 'title', 'update') and not has_column_privilege('authenticated', 'pb_posts', 'author', 'update'), 'chỉ sửa tiêu đề/ghi chú bài';
end $$;
\i supabase/phase26.sql
do $$ begin
  assert (select count(*) from pg_trigger where tgname in ('pb_posts_notify_t', 'pb_comments_notify_t', 'pbc_before_t') and not tgisinternal) = 3, 'chạy lại không nhân đôi trigger';
  assert (select count(*) from pg_policies where tablename in ('pb_templates', 'pb_posts', 'pb_hearts', 'pb_comments')) = 4 + 4 + 3 + 3, 'chạy lại không nhân đôi policy';
  assert (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename like 'pb\_%') = 4, 'bật realtime đủ 4 bảng, một lần';
  raise notice 'ALL phase26 tests passed';
end $$;
