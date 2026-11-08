# Thông báo đẩy (Web Push): CHAT-04, CALL-05, ANNIV-04

Hàm `push` còn gửi thông báo khoảnh khắc mới, bình luận và trả lời bình luận (phase25): sau khi cập nhật mã hãy deploy lại `supabase functions deploy push`.

Cuộc gọi khi app đóng (CALL-05) cần thêm `supabase/phase21.sql`: thông báo đẩy mở app, rồi app hỏi bảng `calls` để hiện cuộc gọi đang đổ chuông.

Phần này **chưa được chạy thử trên Supabase thật**; làm theo từng bước và thử bằng hai máy.

1. Tạo khóa VAPID (một lần): `npx web-push generate-vapid-keys`
2. Đặt biến môi trường cho app (Vercel và `.env.local`): `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<khóa công khai>`, rồi deploy lại.
3. Đặt secret cho Edge Functions (khóa riêng không bao giờ đưa vào app):
   `supabase secrets set VAPID_PUBLIC_KEY=<công khai> VAPID_PRIVATE_KEY=<riêng> VAPID_SUBJECT=mailto:email-cua-ban@example.com`
4. Deploy (chạy `supabase init` và `supabase link --project-ref <ref>` nếu chưa có):
   `supabase functions deploy push` và `supabase functions deploy anniversary`
5. Nhắc ngày đặc biệt mỗi sáng 8h (giờ Việt Nam = 01:00 UTC). Trong SQL Editor (bật extension `pg_cron` và `pg_net` ở Database > Extensions):
   ```sql
   select cron.schedule('tdlove-anniversary', '0 1 * * *', $$
     select net.http_post(
       url := 'https://<ref>.supabase.co/functions/v1/anniversary',
       headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_ROLE_KEY>', 'Content-Type', 'application/json'),
       body := '{}'::jsonb) $$);
   ```
   (Khóa service_role chỉ dán vào SQL Editor, không đưa vào mã nguồn. Hàm `anniversary` từ chối mọi lời gọi không mang đúng khóa này, nên anon key trong trình duyệt không kích hoạt được nó.)
   Nhắc ngày đặc biệt: đúng ngày, trước 1 ngày và trước 7 ngày; có cả kỷ niệm tháng.
6. Mỗi người mở **Cài đặt > Bật thông báo** trên máy của mình. iPhone: phải "Thêm vào Màn hình chính" trước, iOS 16.4 trở lên.
