-- Kiểm thử phase25: thông báo (trigger), trả lời bình luận một cấp, ràng buộc GIF, quyền truy cập, chạy lại an toàn.
-- Chạy từ thư mục gốc dự án: psql -v ON_ERROR_STOP=1 -f supabase/tests/phase25_stub.sql -f supabase/phase25.sql -f supabase/tests/phase25_test.sql
\set ON_ERROR_STOP on

-- Dữ liệu: A và B cùng một Space, C ở Space khác
insert into auth.users(id) values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002'), ('cccccccc-0000-0000-0000-000000000003');
insert into spaces(id, name) values ('11111111-1111-1111-1111-111111111111', 'ab'), ('22222222-2222-2222-2222-222222222222', 'c');
insert into profiles(id, space_id, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'B'),
  ('cccccccc-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'C');

-- ===== 1. Khoảnh khắc mới báo cho người kia, không báo cho người đăng =====
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
insert into moments(id, space_id, title, description) values ('dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Chiều ở Hồ Tây', 'Đi dạo');
reset role;
do $$ begin
  assert (select count(*) from notifications) = 1, 'moment: đúng một thông báo';
  assert (select user_id from notifications) = 'bbbbbbbb-0000-0000-0000-000000000002', 'moment: gửi cho B';
  assert (select kind from notifications) = 'moment' and (select moment_title from notifications) = 'Chiều ở Hồ Tây', 'moment: loại và tiêu đề';
  raise notice 'NOTIFY moment ok';
end $$;

-- ===== 2. Bình luận, trả lời, trả lời một câu trả lời (gom về một cấp) =====
select t_as('bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;
insert into moment_comments(id, moment_id, space_id, body) values ('c0000000-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Đẹp quá');
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
insert into moment_comments(id, moment_id, space_id, body, parent_id) values ('c0000000-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Cảm ơn nha', 'c0000000-0000-0000-0000-000000000001');
select t_as('bbbbbbbb-0000-0000-0000-000000000002');
insert into moment_comments(id, moment_id, space_id, body, parent_id) values ('c0000000-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'Lần sau đi nữa', 'c0000000-0000-0000-0000-000000000002');
reset role;
do $$ begin
  assert (select parent_id from moment_comments where id = 'c0000000-0000-0000-0000-000000000003') = 'c0000000-0000-0000-0000-000000000001', 'trả lời một câu trả lời phải gắn về bình luận gốc';
  assert (select parent_id from moment_comments where id = 'c0000000-0000-0000-0000-000000000002') = 'c0000000-0000-0000-0000-000000000001', 'trả lời gắn vào gốc';
  assert (select kind from notifications where comment_id = 'c0000000-0000-0000-0000-000000000001') = 'moment_comment', 'bình luận gốc là moment_comment';
  assert (select user_id from notifications where comment_id = 'c0000000-0000-0000-0000-000000000001') = 'aaaaaaaa-0000-0000-0000-000000000001', 'bình luận của B báo cho A';
  assert (select kind from notifications where comment_id = 'c0000000-0000-0000-0000-000000000002') = 'moment_reply', 'câu trả lời là moment_reply';
  assert (select user_id from notifications where comment_id = 'c0000000-0000-0000-0000-000000000002') = 'bbbbbbbb-0000-0000-0000-000000000002', 'trả lời của A báo cho B';
  assert (select count(*) from notifications where actor = user_id) = 0, 'không ai tự nhận thông báo của mình';
  assert (select body from notifications where comment_id = 'c0000000-0000-0000-0000-000000000001') = 'Đẹp quá', 'nội dung thông báo';
  raise notice 'NOTIFY comment/reply ok';
end $$;

-- trả lời trỏ sang bình luận của khoảnh khắc khác bị từ chối
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
insert into moments(id, space_id, title) values ('dddddddd-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'Khoảnh khắc khác');
do $$ declare failed boolean := false; begin
  begin insert into moment_comments(moment_id, space_id, body, parent_id) values ('dddddddd-0000-0000-0000-00000000000b', '11111111-1111-1111-1111-111111111111', 'x', 'c0000000-0000-0000-0000-000000000001');
  exception when insufficient_privilege then failed := true; end;
  assert failed, 'parent ở moment khác phải bị từ chối';
  raise notice 'REPLY cross-moment rejected ok';
end $$;

-- ===== 3. Bình luận GIF =====
do $$ declare failed boolean; begin
  insert into moment_comments(moment_id, space_id, body, kind, gif_url) values ('dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', '', 'gif', 'https://media2.giphy.com/media/v1.Y2lk/abc/giphy.gif?cid=1&ep=v1&rid=giphy.gif&ct=g');
  insert into moment_comments(moment_id, space_id, body, kind, gif_path) values ('dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', 'kèm chữ', 'gif', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/x.gif');
  failed := false; begin insert into moment_comments(moment_id, space_id, body, kind, gif_url) values ('dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', '', 'gif', 'https://evil.example.com/a.gif'); exception when check_violation then failed := true; end;
  assert failed, 'link ngoài giphy phải bị từ chối';
  failed := false; begin insert into moment_comments(moment_id, space_id, body, kind, gif_url) values ('dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', '', 'gif', 'https://media.giphy.com.evil.example/a.gif'); exception when check_violation then failed := true; end;
  assert failed, 'tên miền giả giphy.com.evil phải bị từ chối';
  failed := false; begin insert into moment_comments(moment_id, space_id, body, kind, gif_url) values ('dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', '', 'gif', 'http://media.giphy.com/a.gif'); exception when check_violation then failed := true; end;
  assert failed, 'http (không https) phải bị từ chối';
  failed := false; begin insert into moment_comments(moment_id, space_id, body, kind, gif_url, gif_path) values ('dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', '', 'gif', 'https://i.giphy.com/a.gif', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/p.gif'); exception when check_violation then failed := true; end;
  assert failed, 'vừa gif_url vừa gif_path phải bị từ chối';
  failed := false; begin insert into moment_comments(moment_id, space_id, body, kind) values ('dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', '', 'gif'); exception when check_violation then failed := true; end;
  assert failed, 'gif không có nguồn phải bị từ chối';
  failed := false; begin insert into moment_comments(moment_id, space_id, body) values ('dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', ''); exception when check_violation then failed := true; end;
  assert failed, 'bình luận chữ rỗng phải bị từ chối';
  failed := false; begin insert into moment_comments(moment_id, space_id, body, kind, gif_path) values ('dddddddd-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111', '', 'gif', '22222222-2222-2222-2222-222222222222/x/x.gif'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'gif_path ngoài thư mục Space phải bị từ chối';
  raise notice 'COMMENT gif constraints ok';
end $$;
reset role;
do $$ begin
  assert (select body from notifications where kind = 'moment_comment' and comment_id in (select id from moment_comments where kind = 'gif' and body = '')) = 'Đã gửi một GIF', 'thông báo cho bình luận GIF không chữ';
  raise notice 'NOTIFY gif body ok';
end $$;

-- ===== 4. Tin nhắn GIF =====
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
do $$ declare failed boolean; mid uuid; begin
  insert into messages(space_id, body, kind, gif_url) values ('11111111-1111-1111-1111-111111111111', '', 'gif', 'https://media3.giphy.com/media/x/giphy.gif') returning id into mid;
  insert into messages(space_id, body, kind, gif_path) values ('11111111-1111-1111-1111-111111111111', '', 'gif', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/y.webp');
  insert into messages(space_id, body, kind, gif_url, reply_to) values ('11111111-1111-1111-1111-111111111111', '', 'gif', 'https://media3.giphy.com/media/x/giphy.gif', mid);   -- trả lời tin vẫn chạy (phase18)
  insert into messages(space_id, body) values ('11111111-1111-1111-1111-111111111111', 'xin chào');
  failed := false; begin insert into messages(space_id, body, kind) values ('11111111-1111-1111-1111-111111111111', '', 'gif'); exception when check_violation then failed := true; end;
  assert failed, 'tin gif không có nguồn phải bị từ chối';
  failed := false; begin insert into messages(space_id, body, kind, gif_url) values ('11111111-1111-1111-1111-111111111111', 'x', 'text', 'https://media3.giphy.com/media/x/giphy.gif'); exception when check_violation then failed := true; end;
  assert failed, 'tin chữ mang gif_url phải bị từ chối';
  failed := false; begin insert into messages(space_id, body, kind, gif_url) values ('11111111-1111-1111-1111-111111111111', '', 'gif', 'https://evil.example.com/a.gif'); exception when check_violation then failed := true; end;
  assert failed, 'tin gif link lạ phải bị từ chối';
  failed := false; begin insert into messages(space_id, body, kind, gif_path) values ('11111111-1111-1111-1111-111111111111', '', 'gif', '22222222-2222-2222-2222-222222222222/c/z.gif'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'tin gif_path ngoài Space phải bị từ chối';
  failed := false; begin insert into messages(space_id, body, kind, gif_url) values ('22222222-2222-2222-2222-222222222222', '', 'gif', 'https://media3.giphy.com/media/x/giphy.gif'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'gửi vào Space khác phải bị từ chối';
  raise notice 'MESSAGE gif ok';
end $$;

-- ===== 5. Quyền trên notifications =====
select t_as('bbbbbbbb-0000-0000-0000-000000000002');
do $$ declare failed boolean; n int; begin
  select count(*) into n from notifications; assert n > 0, 'B thấy thông báo của mình';
  assert (select count(*) from notifications where user_id <> auth.uid()) = 0, 'B không thấy thông báo của người khác';
  failed := false; begin insert into notifications(space_id, user_id, kind) values (my_space(), auth.uid(), 'moment'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'không được tự chèn thông báo';
  failed := false; begin update notifications set body = 'sửa' ; exception when insufficient_privilege then failed := true; end;
  assert failed, 'không được sửa nội dung thông báo';
  update notifications set read_at = now() where read_at is null;
  assert (select count(*) from notifications where read_at is null) = 0, 'đánh dấu đã đọc được';
  delete from notifications where kind = 'moment';
  raise notice 'NOTIFICATIONS rls ok';
end $$;
reset role;
-- B chỉ sửa được thông báo của chính mình: thông báo của A vẫn chưa đọc
do $$ begin assert (select count(*) from notifications where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and read_at is null) > 0, 'thông báo của A không bị B đụng tới'; raise notice 'NOTIFICATIONS isolation ok'; end $$;

-- ===== 6. Bộ sưu tập GIF + Storage =====
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
do $$ declare failed boolean; begin
  insert into gifs(space_id, path) values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/a.gif');
  insert into gifs(space_id, url) values ('11111111-1111-1111-1111-111111111111', 'https://media1.giphy.com/media/q/giphy.gif');
  failed := false; begin insert into gifs(space_id, url) values ('11111111-1111-1111-1111-111111111111', 'https://media1.giphy.com/media/q/giphy.gif'); exception when unique_violation then failed := true; end;
  assert failed, 'không lưu trùng GIF';
  failed := false; begin insert into gifs(space_id, path) values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000002/a.gif'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'không đặt đường dẫn vào thư mục của người khác';
  failed := false; begin insert into gifs(space_id, path, url) values ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/p.gif', 'https://media1.giphy.com/a'); exception when check_violation then failed := true; end;
  assert failed, 'vừa path vừa url bị từ chối';
  failed := false; begin insert into gifs(space_id, url) values ('11111111-1111-1111-1111-111111111111', 'https://evil.example.com/a.gif'); exception when check_violation then failed := true; end;
  assert failed, 'url lạ bị từ chối';
  failed := false; begin update gifs set url = url; exception when insufficient_privilege then failed := true; end;
  assert failed, 'gifs không sửa được';
  assert (select count(*) from gifs) = 2, 'A thấy 2 GIF';
  raise notice 'GIFS table ok';
end $$;
-- B cùng Space thấy và gỡ được; C Space khác không thấy
select t_as('cccccccc-0000-0000-0000-000000000003');
do $$ begin assert (select count(*) from gifs) = 0, 'C không thấy GIF của Space khác'; assert (select count(*) from notifications) = 0, 'C không thấy thông báo'; assert (select count(*) from messages) = 0, 'C không thấy tin nhắn'; raise notice 'GIFS isolation ok'; end $$;
reset role;
insert into storage.objects(bucket_id, name, owner_id) values
  ('gifs', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/a.gif', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('media', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/m.jpg', 'aaaaaaaa-0000-0000-0000-000000000001');
select t_as('bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;
do $$ declare failed boolean; begin
  assert (select count(*) from storage.objects where bucket_id = 'gifs') = 1, 'B đọc được GIF của Space mình';
  insert into storage.objects(bucket_id, name, owner_id) values ('gifs', '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000002/b.gif', 'bbbbbbbb-0000-0000-0000-000000000002');
  failed := false; begin insert into storage.objects(bucket_id, name, owner_id) values ('gifs', '11111111-1111-1111-1111-111111111111/aaaaaaaa-0000-0000-0000-000000000001/hack.gif', 'bbbbbbbb-0000-0000-0000-000000000002'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'không tải vào thư mục của người khác';
  failed := false; begin insert into storage.objects(bucket_id, name, owner_id) values ('gifs', '22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000002/b.gif', 'bbbbbbbb-0000-0000-0000-000000000002'); exception when insufficient_privilege then failed := true; end;
  assert failed, 'không tải vào Space khác';
  raise notice 'STORAGE gifs ok';
end $$;
select t_as('cccccccc-0000-0000-0000-000000000003');
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'gifs') = 0, 'C không đọc được GIF của Space khác'; raise notice 'STORAGE isolation ok'; end $$;
reset role;
do $$ begin
  assert (select public from storage.buckets where id = 'gifs') = false, 'bucket gifs phải private';
  assert (select file_size_limit from storage.buckets where id = 'gifs') = 8388608, 'giới hạn 8 MB';
  raise notice 'BUCKET gifs ok';
end $$;

-- ===== 7. Xóa bình luận gốc thì câu trả lời và thông báo đi theo; xóa khoảnh khắc thì thông báo đi theo =====
select t_as('bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;
delete from moment_comments where id = 'c0000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  assert (select count(*) from moment_comments where id in ('c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003')) = 0, 'xóa gốc thì trả lời đi theo';
  assert (select count(*) from notifications where comment_id in ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002')) = 0, 'thông báo của bình luận đã xóa cũng mất';
  delete from moments where id = 'dddddddd-0000-0000-0000-00000000000a';
  assert (select count(*) from notifications where moment_id = 'dddddddd-0000-0000-0000-00000000000a') = 0, 'thông báo của khoảnh khắc đã xóa cũng mất';
  raise notice 'CASCADE ok';
end $$;

-- ===== 8. Chạy lại phase25.sql lần hai vẫn an toàn và không đổi dữ liệu =====
select count(*) as before from notifications \gset
\i supabase/phase25.sql
do $$ begin raise notice 'RERUN ok'; end $$;
select t_as('aaaaaaaa-0000-0000-0000-000000000001');
set role authenticated;
do $$ begin
  insert into moments(space_id, title) values ('11111111-1111-1111-1111-111111111111', 'Sau khi chạy lại');
  raise notice 'TRIGGERS after rerun ok';
end $$;
reset role;
do $$ begin
  assert (select count(*) from notifications where moment_title = 'Sau khi chạy lại') = 1, 'sau khi chạy lại vẫn chỉ một thông báo mỗi khoảnh khắc (không nhân đôi trigger)';
  raise notice 'ALL phase25 tests passed';
end $$;
