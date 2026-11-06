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

## Giải trí: clip TikTok gửi cho nhau (ENT-01..05)

Người này gửi link clip TikTok, người kia mở ra **xem ngay trong app** (trình phát nhúng chính thức của TikTok). App không tải hay lưu video của TikTok, chỉ lưu mã video, caption và tên tác giả (lấy qua oEmbed chính thức). Không có feed cuộn của TikTok; clip đã xóa hoặc đặt riêng tư thì trình phát sẽ báo lỗi, bấm "Mở trong TikTok" để thử lại.

Cài đặt (làm **trước khi** đưa bản app mới lên Vercel):

1. Chạy `supabase/phase13.sql` trong SQL Editor (sau phase12.sql, chạy lại vẫn an toàn). Tạo bảng `clips`, `share_tokens`, hàm `open_clip`/`create_share_token`/`revoke_share_token`, có RLS.
2. Deploy Edge Function **không bắt JWT** (để Phím tắt iPhone gọi được bằng mã gửi nhanh): `supabase functions deploy clip --no-verify-jwt`. Hàm tự xác thực bằng mã gửi nhanh hoặc JWT của người đăng nhập. Thông báo đẩy dùng chung các secret VAPID đã đặt ở `supabase/functions/README.md`; chưa đặt thì vẫn gửi được clip, chỉ không có thông báo.
3. Trang chủ có thẻ "Giải trí" (đếm clip chưa xem), trang là `/fun`.

Cách gửi clip (từ dễ tới khó):

- **Dán trong app:** trong TikTok bấm Chia sẻ > Sao chép liên kết, mở app > Giải trí > "Dán link đã sao chép và gửi". Máy hỏi quyền đọc bộ nhớ tạm thì bấm Cho phép (iPhone hiện nút "Dán" một lần mỗi lượt).
- **Chia sẻ thẳng từ TikTok bằng Phím tắt (iPhone):** vào Giải trí > "Gửi nhanh từ TikTok" > Tạo mã gửi nhanh, sao chép mã và địa chỉ. Mở app **Phím tắt** > dấu **+** > đặt tên "Gửi cho anh", rồi thêm:
  1. Bấm biểu tượng (i) ở đáy > bật **Hiện trong Bảng chia sẻ** > loại đầu vào chỉ chọn **URL** và **Văn bản**.
  2. Hành động **Lấy nội dung của URL**: URL = địa chỉ đã sao chép; bấm Hiện thêm > Phương thức **POST**; Tiêu đề: thêm `x-share-token` = mã đã sao chép; Nội dung yêu cầu = **JSON**, thêm khóa **url** (kiểu Văn bản) = biến **Đầu vào phím tắt**.
  3. Hành động **Lấy giá trị từ từ điển** (khóa `message`) từ kết quả bước 2, rồi **Hiện thông báo** với giá trị đó. Khi gửi được sẽ báo "Đã gửi cho …", lỗi thì báo lý do.
  4. Dùng: trong TikTok bấm Chia sẻ > cuộn hàng biểu tượng > **Gửi cho anh**.
- Mã gửi nhanh là bí mật như mật khẩu: chỉ lưu bản băm trên server, tạo mã mới thì mã cũ hết hiệu lực, có nút "Tắt gửi nhanh". Hàm chỉ đi theo link thuộc tên miền `tiktok.com` (kể cả link rút gọn `vm.tiktok.com`).

Cách test: gửi một clip từ máy này, máy kia phải thấy thẻ clip hiện ra (realtime), có nhãn "Mới", bấm vào xem được và nhãn đổi thành "Đã xem" ở máy người gửi. Trình phát nhúng cần HTTPS (Vercel có sẵn). Chưa chạy thử trên Supabase thật.

### Giải trí tương tác: cảm xúc, bình luận, yêu thích, xem cùng nhau (phase14)

Mở một clip trong Giải trí sẽ có thêm:

- **Thả cảm xúc** (❤️ 😂 😮 🥺 🔥 🙈): mỗi người một cảm xúc cho mỗi clip, bấm lại để gỡ. Cả hai cùng thả thì clip được gắn 💞. Máy kia nhận thông báo đẩy (trừ khi đang xem cùng nhau).
- **Bình luận** dưới từng clip, hiện ngay ở máy kia, xóa được bình luận của chính mình.
- **Yêu thích** (⭐) chung cho cả hai, có bộ lọc Tất cả / Chưa xem / Yêu thích ở đầu danh sách.
- **Nhắn kèm khi gửi clip**: ô lời nhắn và vài câu nhắn nhanh, hiện trên thẻ clip và ở trình xem.
- **Xem cùng nhau**: bấm "Rủ … xem cùng", máy kia nhận lời rủ (thẻ ở đầu trang Giải trí hoặc thông báo đẩy, bấm vào là vào thẳng phòng). Ai bấm phát, tạm dừng hay tua thì máy kia theo; thả cảm xúc thì bay lên trên video của cả hai. Có nút "Kéo … về chỗ mình" để ép đồng bộ lại. Điều khiển trình phát qua `postMessage` chính thức của TikTok (play, pause, seekTo), chỉ chạy khi cả hai cùng mở clip đó, không có video nào đi qua server.

Cài đặt (theo thứ tự, **trước khi** đưa bản app mới lên Vercel):

1. Chạy `supabase/phase14.sql` trong SQL Editor (sau phase13.sql, chạy lại vẫn an toàn). Thêm cột `reactions`, `starred`, `comments` cho `clips`, bảng `clip_comments`, hàm `react_clip`/`star_clip`, và tạo lại hai chính sách `call_rt_read`/`call_rt_write` để kênh `together-<space>` dùng được (kênh `call-` và `typing-` vẫn giữ nguyên).
2. Deploy lại hàm `push` vì đã thêm các loại thông báo mới: `supabase functions deploy push`. Hàm `clip` không đổi.

Cách test với hai máy: thả cảm xúc ở máy A, máy B thấy cảm xúc hiện trên thẻ clip. Viết bình luận ở B, A thấy ngay. Bấm "Rủ xem cùng" ở A, B thấy thẻ lời rủ, bấm Tham gia, rồi bấm phát ở A và xem B có phát theo, thử tua và thử thả cảm xúc. **Chưa chạy thử trên máy thật**; phần đồng bộ phát/tạm dừng/tua phụ thuộc cách trình phát của TikTok báo sự kiện. Nếu trình duyệt (nhất là iPhone) chặn tự phát, máy nhận sẽ hiện dòng nhắc "Chạm vào video để phát"; chạm một lần là các lần sau theo kịp.


## Khu cấp độ (bấm trái tim ở Trang chủ)

- **Hai nhân vật 3D nắm tay** (kéo ngang để xoay). Lần đầu mỗi người chọn mình là nhân vật nữ (trái) hay nam (phải); người ấy tự nhận nhân vật còn lại. Chưa mua món nào thì có nút "Đổi chỗ hai nhân vật".
- **Điểm chung + điểm riêng**: mỗi ngày bên nhau +10 điểm chung; mỗi ảnh gửi trong chat +2 điểm chung và +5 điểm riêng cho người gửi (tối đa 10 ảnh mỗi ngày mỗi người, tính theo giờ Việt Nam). Muốn đổi số thì sửa `level_rules()` trong `phase15.sql`, app tự hiển thị số mới.
- **Cấp độ** tính theo tổng điểm đã kiếm của cả hai (cấp 2 = 100, cấp 3 = 300, cấp 4 = 600...), nên tiêu điểm không làm tụt cấp.
- **Cửa hàng**: tóc, áo, quần/váy, giày, trang điểm, kính, mũ, dây chuyền/khăn. Bấm món để thử ngay trên nhân vật, bấm Mua để trả bằng điểm chung hoặc điểm riêng của mình; mua tặng người ấy được. Món cao cấp cần đủ cấp. Điểm, giá và cấp được server kiểm tra (không sửa được từ máy).
- Danh mục đồ nằm ở bảng `shop_items` (thêm món: thêm một dòng SQL và một dòng hình 3D trong `lib/shop.ts`, cùng id).

Cài đặt: chạy `supabase/phase15.sql` trong SQL Editor (sau phase14.sql, chạy lại vẫn an toàn) **trước khi** đưa bản app mới lên Vercel.

Cách test với hai máy: máy A chọn nhân vật, máy B vào là thấy mình đã có nhân vật còn lại. Gửi ảnh trong chat thì điểm tăng ở cả hai máy. Mua một món ở A, B thấy nhân vật đổi đồ ngay. Đã kiểm tra logic SQL trên Postgres thật (mua đủ/thiếu điểm, thiếu cấp, hai người tiêu cùng lúc) và dựng 3D thử bằng trình duyệt headless; chưa chạy trên Supabase thật.
