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

## Vòng quay chọn món (WHEEL-01..02)

- Chạy `supabase/phase10.sql` (SAU `phase9.sql`, chạy lại vẫn an toàn) **trước khi** đưa bản app mới lên Vercel. Thêm bảng `food_options` (món trong vòng) và `food_spins` (lịch sử quay), cả hai bật realtime.
- Vào Kế hoạch → "Quay món" (hoặc từ trang Quán muốn thử). Hai người cùng thêm/xóa món, 2–12 món, không trùng tên. Món "nên thử" của các quán chưa đến hiện sẵn dưới dạng gợi ý bấm để thêm.
- Bấm "Quay!": app chọn món trúng ngẫu nhiên (bộ sinh số của trình duyệt, mỗi món xác suất bằng nhau) rồi quay vòng dừng đúng ô đó. Kết quả lưu vào "Các lần quay gần đây" nên người kia thấy ngay; hiệu ứng quay chỉ chạy trên máy người bấm.
- Đang quay thì các ô được giữ nguyên, kể cả khi người kia thêm/xóa món cùng lúc. Máy bật "giảm chuyển động" thì kết quả hiện ngay, không quay.

## Nhật ký riêng tư (DIARY-04)

- Chạy `supabase/phase8.sql` (SAU `phase7.sql`, chạy lại vẫn an toàn) **trước khi** đưa bản app mới lên Vercel, rồi `supabase functions deploy anniversary`.
- Trong form viết/sửa có công tắc "🔒 Chỉ mình tôi xem". Bài riêng tư và ảnh đính kèm bị ẩn khỏi người kia ngay ở cơ sở dữ liệu (RLS), không chỉ ở giao diện; chỉ tác giả bật/tắt được.
- Bài riêng tư không bao giờ được đẩy vào thông báo "Ngày này năm trước" của người kia; tác giả vẫn thấy nó ở Trang chủ của mình.
- Giới hạn: tệp ảnh nằm chung bucket `media` của Space nên về kỹ thuật người kia vẫn liệt kê được tên tệp trong Storage nếu cố tình, nhưng không biết tệp nào thuộc bài nào và không có đường dẫn từ nhật ký. Nếu cần kín hơn, phải tách bucket riêng cho ảnh riêng tư.

## Đăng xuất, đổi mật khẩu, quên mật khẩu (AUTH-04)

- Không có file SQL mới, chỉ cần deploy lại app. **Nhưng phải cấu hình Supabase** (Auth), nếu không "Quên mật khẩu" sẽ không chạy:
  1. Auth > URL Configuration: đặt **Site URL** là địa chỉ thật (ví dụ `https://tdlove.vercel.app`) và thêm vào **Redirect URLs**: `https://tdlove.vercel.app/reset-password` và `http://localhost:3000/reset-password` (nếu test ở máy). Thiếu bước này link trong email sẽ về trang chủ thay vì trang đặt lại mật khẩu.
  2. Auth > SMTP Settings: **nên cấu hình SMTP riêng** (Resend, Brevo, Gmail SMTP…). Email mặc định của Supabase chỉ gửi rất ít thư mỗi giờ và có thể chỉ gửi tới email thành viên của dự án, nên người kia có thể không nhận được link.
  3. Auth > Providers > Email: nên đặt độ dài mật khẩu tối thiểu là 8 cho khớp với app (app đã kiểm tra ≥ 8 ký tự ở phía giao diện khi đổi/đặt lại).
- Quên mật khẩu: ở màn đăng nhập bấm "Quên mật khẩu?" → nhập email → nhận link → mở `/reset-password` → nhập mật khẩu mới. App luôn báo "nếu email đã có tài khoản thì đã gửi" để người lạ không dò được email nào đã đăng ký. Có đếm ngược 60 giây trước khi gửi lại.
- Đổi mật khẩu: Cài đặt > "Đổi mật khẩu", phải nhập đúng mật khẩu hiện tại. Sau khi đổi hoặc đặt lại, **các máy khác bị đăng xuất** (máy đang dùng vẫn giữ phiên). Nếu dùng app cài ở Màn hình chính trên iPhone, phiên ở đó tách khỏi Safari nên cần đăng nhập lại.
- Đăng xuất: chỉ đăng xuất máy đang bấm (`scope: 'local'`). Trước đây dùng mặc định của supabase-js nên đăng xuất ở điện thoại sẽ đăng xuất luôn máy tính.

## Hồ sơ cá nhân (AUTH-05)

- Không cần chạy thêm SQL: cột `profiles.avatar_url` và quyền sửa cột đã có từ `phase4.sql`.
- Cài đặt > Hồ sơ của mình: đổi/gỡ ảnh đại diện, sửa tên hiển thị (1–30 ký tự, tự bỏ khoảng trắng thừa). Ảnh gốc ≤ 15 MB, tự cắt vuông ở giữa và thu về tối đa 320 px; lưu trong bucket private `media` tại `<space>/avatars/`, mỗi lần đổi dùng tên tệp mới và xóa tệp cũ.
- Cài đặt > Ngày bắt đầu yêu: sửa được bất cứ lúc nào (không chọn ngày tương lai). Ngày này dùng chung cho cả Space nên người ấy cũng thấy ngày mới; Trang chủ, mốc kỷ niệm và thông báo nhắc đều tính lại từ ngày mới.
- Ảnh đại diện hiện ở Cài đặt, Trang chủ, đầu màn hình Chat và ghim trên Bản đồ; chưa có ảnh thì hiện chữ cái đầu của tên.
- Đăng ký (tạo/vào Space) cũng kiểm tra tên trước khi tạo tài khoản.

## Khóa app bằng PIN / sinh trắc học (AUTH-06)

- Không cần chạy thêm SQL. Cấu hình khóa lưu ở **máy này** (localStorage), không lên Supabase: mỗi điện thoại tự đặt PIN riêng.
- Bật ở Cài đặt > Khóa app: PIN 4–6 số (từ chối 0000, 1234…), chọn tự khóa lại sau khi thoát app: ngay lập tức / 1 / 5 / 15 phút, nút "Khóa ngay". Khi app khóa, các trang vẫn nằm yên phía sau (giữ tin đang soạn); cuộc gọi đến vẫn hiện để không lỡ.
- PIN chỉ lưu dạng băm PBKDF2 kèm salt. Nhập sai 5, 7, 9 lần thì phải chờ 30 giây, 2 phút, 10 phút; sai 10 lần thì app đăng xuất khỏi máy này (phải đăng nhập lại bằng mật khẩu, PIN bị xóa). "Quên PIN?" trên màn hình khóa làm đúng như vậy.
- Sinh trắc học (Face ID / vân tay / khóa màn hình của máy) dùng WebAuthn, chỉ hiện nút khi máy hỗ trợ; phải đặt PIN trước và PIN luôn dùng được thay thế. Trên iPhone, mở app từ Màn hình chính (HTTPS). Safari iOS chỉ cho gọi sinh trắc học sau một lần bấm nút nên không tự hiện như Android.
- Đây là khóa màn hình để người khác cầm máy đang mở app không xem được, **không phải mã hóa dữ liệu**: phiên đăng nhập vẫn nằm trong trình duyệt của máy. Vừa đăng nhập bằng mật khẩu (hoặc đặt lại mật khẩu qua email) thì không bị hỏi PIN.
- Tắt sinh trắc học chỉ quên khóa trong app; khóa (passkey) đã tạo vẫn nằm trong danh sách mật khẩu/passkey của máy, xóa trong cài đặt của máy nếu muốn.

## Lịch sử hành trình (MAP-07)

- Chạy `supabase/phase11.sql` (SAU `phase10.sql`, chạy lại vẫn an toàn) **trước khi** đưa bản app mới lên Vercel. Thêm bảng `trips` (mỗi lần ghi là một hành trình) và `location_history` (các điểm), có RLS.
- Mặc định **không lưu gì**. Chỉ khi vào Bản đồ > Ghi lại hành trình > Bắt đầu ghi mới có dữ liệu (NFR-03). Có thể gắn với một Kế hoạch, đặt tên tùy ý.
- Mỗi người chỉ ghi một hành trình tại một thời điểm. Thanh "Đang ghi hành trình" luôn hiện ở đầu mọi màn hình khi đang ghi, bấm Dừng ở đâu cũng được; chuyển sang tab Chat/Khoảnh khắc không làm mất điểm.
- Chỉ ghi khi app đang mở (giới hạn của trình duyệt). Mặc định giữ màn hình sáng khi ghi (Wake Lock; có ô để tắt cho đỡ tốn pin). App đóng quá 2 giờ thì hành trình tự dừng, đủ 6000 điểm cũng tự dừng. Điểm được lọc (bỏ sai số trên 80 m, bỏ lúc đứng yên, bỏ nhiễu nhảy vọt) và gửi lên mỗi ~20 giây; mất mạng thì giữ trong máy và gửi sau.
- Hành trình chỉ chủ của nó xem được. Bấm "Cho người ấy xem" thì người ấy xem được đường đi (tắt lại bất cứ lúc nào). Xóa từng hành trình hoặc xóa tất cả hành trình đã ghi; xóa là xóa hết các điểm. Xóa Kế hoạch thì hành trình vẫn còn, chỉ gỡ liên kết.
- Bảng dữ liệu khác so với mô hình khái niệm trong SRS: `plan_id` nằm ở `trips` (một hành trình gồm nhiều điểm), không lặp lại ở từng điểm.

## Hộp thời gian (CAPSULE-01..04)

- Chạy `supabase/phase12.sql` trong SQL Editor (sau phase11.sql). File tạo bảng, hàm `create_capsule`/`open_capsule` và bucket riêng `capsules`; chạy lại vẫn an toàn.
- Thư và ảnh bị khóa ở server tới ngày mở (RLS dùng đồng hồ của Postgres), người nhận chỉ thấy lời gợi ý và số ngày còn lại.
- Báo "mở được rồi" qua thông báo đẩy: deploy lại Edge Function `anniversary` (`supabase functions deploy anniversary`). Hàm này chạy mỗi sáng 8h nên thông báo đến vào sáng ngày mở.
- Cách test nhanh: chôn một hộp mở ngày mai, rồi trong SQL Editor chạy `update capsules set unlock_at = now() - interval '1 minute';` và tải lại trang bằng máy của người nhận.
