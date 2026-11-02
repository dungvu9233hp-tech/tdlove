# tdlove v1 (giai đoạn 1)

1. Tạo project tại supabase.com, chạy `supabase/schema.sql` trong SQL Editor, rồi lần lượt `phase2.sql`, `phase2b.sql`, `phase3.sql`, `phase4.sql` (phase4 là bản vá bảo mật, bắt buộc).
2. Auth > Providers > Email: tắt "Confirm email" (bản đầu, chỉ hai người dùng).
3. `cp .env.example .env.local`, điền URL và anon key (Project Settings > API).
4. `npm install && npm run dev`, mở http://localhost:3000.
5. Người thứ nhất bấm "Tạo Space mới", lấy mã mời ở Trang chủ gửi cho người kia ("Nhập mã mời").
6. Deploy: đẩy lên GitHub, import vào Vercel, thêm hai biến môi trường như bước 3.

## Gọi thoại/video (CALL-01..04)

- Cần HTTPS (Vercel/Cloudflare Pages có sẵn) để trình duyệt cho dùng micro/camera.
- Gọi qua 4G cần TURN: điền `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USER`, `NEXT_PUBLIC_TURN_PASS` (xem `.env.example`). Thiếu TURN thì chỉ gọi chắc chắn được khi hai máy cùng Wi-Fi.
- Cuộc gọi đến chỉ hiện khi app đang mở (gọi khi app đóng là CALL-05, chưa làm).
- Bật loa ngoài: Chrome Android chọn được thiết bị âm thanh ra; Safari iOS không cho web chọn loa, hệ điều hành tự quyết định.
- Cách test: mở hai máy (một Wi-Fi, một 4G), bấm Gọi/Video ở màn hình Chat.
