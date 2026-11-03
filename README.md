# tdlove v1 (giai đoạn 1)

1. Tạo project tại supabase.com, chạy `supabase/schema.sql` trong SQL Editor, rồi lần lượt `phase2.sql`, `phase2b.sql`, `phase3.sql`, `phase4.sql` (bản vá bảo mật, bắt buộc), `phase5.sql` (hoàn thiện Chat), `phase6.sql` (Khoảnh khắc: media, album, tim, bình luận), `phase7.sql` (Nhật ký), `phase8.sql` (Nhật ký riêng tư).
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

## Khoảnh khắc (MOM-01..11)

- Chạy `supabase/phase6.sql` (an toàn khi chạy lại; tự chuyển ảnh cũ trong `moments.photos` sang bảng `media`).
- Ảnh: tối đa 20 tệp/khoảnh khắc, mỗi ảnh gốc ≤ 15 MB, tự resize 1600px + tạo thumbnail 480px. Ngày chụp và GPS lấy từ EXIF (iOS có thể ẩn GPS tùy tùy chọn khi chọn ảnh).
- Video: ≤ 3 phút, tải bằng giao thức resumable (TUS), có tiến độ, mất mạng thì chờ và tải tiếp. Giới hạn dung lượng mặc định 50 MB vì gói Supabase miễn phí không nhận tệp lớn hơn; sau khi lên gói Pro và nâng giới hạn trong Storage settings, đặt `NEXT_PUBLIC_MAX_VIDEO_MB=200`. Chưa nén video ở máy (trình duyệt di động không làm ổn định được).
- Thùng rác: `/moments/trash`, giữ 30 ngày, quá hạn tự xóa (cả tệp trong Storage) mỗi lần mở trang Khoảnh khắc hoặc thùng rác.
- Chọn địa điểm/tìm tên dùng OpenStreetMap Nominatim (miễn phí, chỉ gọi khi bấm Tìm hoặc chọn điểm).

## Nhật ký (DIARY-01..03)

- Chạy `supabase/phase7.sql` (SAU `phase6.sql`, chạy lại vẫn an toàn): thêm `moment_id`, `plan_id`, `updated_at` cho `diary_entries`, bảng `diary_media` (ảnh đính kèm, tối đa 10 ảnh/bài) và hàm `on_this_day`.
- Ảnh nhật ký dùng chung bucket `media` với Khoảnh khắc: tự resize 1600px + thumbnail 480px, mỗi ảnh gốc ≤ 15 MB.
- Chỉ tác giả được sửa/xóa bài của mình (RLS + quyền cột). Bài đã sửa hiện "đã sửa".
- Lọc theo tháng và tâm trạng, tìm kiếm theo tiêu đề/nội dung (chạy ở máy chủ, tải dần 20 bài mỗi lần khi cuộn). Gắn bài với một Khoảnh khắc hoặc Kế hoạch.
- Nhắc lại kỷ niệm (DIARY-02): Trang chủ hiện nhật ký và Moment của đúng ngày này các năm trước; thông báo đẩy gửi trong cùng hàm `anniversary` mỗi sáng. Sau khi chạy `phase7.sql` hãy deploy lại: `supabase functions deploy anniversary`.

## Đánh giá và ảnh cho Quán muốn thử (WISH-01..02)

- Chạy `supabase/phase9.sql` (SAU `phase8.sql`, chạy lại vẫn an toàn) **trước khi** đưa bản app mới lên Vercel. Thêm cột `review`, `visited_on` cho `wishlist_places` và bảng `wishlist_media` (ảnh của quán).
- Luồng: thêm quán vào danh sách → đi ăn → bấm "Chưa đến" (đổi thành "Đã đến") → form đánh giá tự mở: chọn ngày, chấm 1–5 sao, viết đánh giá, tải ảnh. Sau đó bấm "Sửa đánh giá / ảnh" để chỉnh lại bất cứ lúc nào.
- Ảnh: tối đa 10 ảnh mỗi quán, mỗi ảnh gốc ≤ 15 MB, tự resize 1600px + thumbnail 480px, dùng chung bucket `media` với Khoảnh khắc và Nhật ký. Bấm ảnh để xem toàn màn hình.
- Danh sách quán là chung của hai người nên cả hai đều viết/sửa đánh giá và thêm/gỡ ảnh được. Xóa quán thì ảnh của quán cũng bị xóa khỏi Storage.

## Nhật ký riêng tư (DIARY-04)

- Chạy `supabase/phase8.sql` (SAU `phase7.sql`, chạy lại vẫn an toàn) **trước khi** đưa bản app mới lên Vercel, rồi `supabase functions deploy anniversary`.
- Trong form viết/sửa có công tắc "🔒 Chỉ mình tôi xem". Bài riêng tư và ảnh đính kèm bị ẩn khỏi người kia ngay ở cơ sở dữ liệu (RLS), không chỉ ở giao diện; chỉ tác giả bật/tắt được.
- Bài riêng tư không bao giờ được đẩy vào thông báo "Ngày này năm trước" của người kia; tác giả vẫn thấy nó ở Trang chủ của mình.
- Giới hạn: tệp ảnh nằm chung bucket `media` của Space nên về kỹ thuật người kia vẫn liệt kê được tên tệp trong Storage nếu cố tình, nhưng không biết tệp nào thuộc bài nào và không có đường dẫn từ nhật ký. Nếu cần kín hơn, phải tách bucket riêng cho ảnh riêng tư.
