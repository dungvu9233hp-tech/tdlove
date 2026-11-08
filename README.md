# tdlove v1 (giai đoạn 1)

1. Tạo project tại supabase.com, chạy `supabase/schema.sql` trong SQL Editor, rồi lần lượt `phase2.sql`, `phase2b.sql`, `phase3.sql`, `phase4.sql` (bản vá bảo mật, bắt buộc), `phase5.sql` (hoàn thiện Chat), `phase6.sql` (Khoảnh khắc: media, album, tim, bình luận), `phase7.sql` (Nhật ký), `phase8_trc.sql` (Nhật ký riêng tư).
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

- Chạy `supabase/phase9.sql` (SAU `phase8_trc.sql`, chạy lại vẫn an toàn) **trước khi** đưa bản app mới lên Vercel. Thêm cột `review`, `visited_on` cho `wishlist_places` và bảng `wishlist_media` (ảnh của quán).
- Luồng: thêm quán vào danh sách → đi ăn → bấm "Chưa đến" (đổi thành "Đã đến") → form đánh giá tự mở: chọn ngày, chấm 1–5 sao, viết đánh giá, tải ảnh. Sau đó bấm "Sửa đánh giá / ảnh" để chỉnh lại bất cứ lúc nào.
- Ảnh: tối đa 10 ảnh mỗi quán, mỗi ảnh gốc ≤ 15 MB, tự resize 1600px + thumbnail 480px, dùng chung bucket `media` với Khoảnh khắc và Nhật ký. Bấm ảnh để xem toàn màn hình.
- Danh sách quán là chung của hai người nên cả hai đều viết/sửa đánh giá và thêm/gỡ ảnh được. Xóa quán thì ảnh của quán cũng bị xóa khỏi Storage.

## Vòng quay chọn món (WHEEL-01..02)

- Chạy `supabase/phase10.sql` (SAU `phase9.sql`, chạy lại vẫn an toàn) **trước khi** đưa bản app mới lên Vercel. Thêm bảng `food_options` (món trong vòng) và `food_spins` (lịch sử quay), cả hai bật realtime.
- Vào Kế hoạch → "Quay món" (hoặc từ trang Quán muốn thử). Hai người cùng thêm/xóa món, 2–12 món, không trùng tên. Món "nên thử" của các quán chưa đến hiện sẵn dưới dạng gợi ý bấm để thêm.
- Bấm "Quay!": app chọn món trúng ngẫu nhiên (bộ sinh số của trình duyệt, mỗi món xác suất bằng nhau) rồi quay vòng dừng đúng ô đó. Kết quả lưu vào "Các lần quay gần đây" nên người kia thấy ngay; hiệu ứng quay chỉ chạy trên máy người bấm.
- Đang quay thì các ô được giữ nguyên, kể cả khi người kia thêm/xóa món cùng lúc. Máy bật "giảm chuyển động" thì kết quả hiện ngay, không quay.

## Nhật ký riêng tư (DIARY-04)

- Chạy `supabase/phase8_trc.sql` (SAU `phase7.sql`, chạy lại vẫn an toàn) **trước khi** đưa bản app mới lên Vercel, rồi `supabase functions deploy anniversary`.
- Trong form viết/sửa có công tắc "🔒 Chỉ mình tôi xem". Bài riêng tư và ảnh đính kèm bị ẩn khỏi người kia ngay ở cơ sở dữ liệu (RLS), không chỉ ở giao diện; chỉ tác giả bật/tắt được.
- Bài riêng tư không bao giờ được đẩy vào thông báo "Ngày này năm trước" của người kia; tác giả vẫn thấy nó ở Trang chủ của mình.
- Bản vá `phase17.sql` khóa quyền đọc bucket `media` theo bản ghi metadata còn nhìn thấy được. Ảnh nhật ký riêng tư không còn được liệt kê/ký URL bởi thành viên còn lại; URL mới có TTL mặc định 5 phút và cache tách theo tài khoản. URL đã phát hành bởi phiên bản cũ có thể còn hiệu lực tới hết hạn cũ (tối đa 1 giờ).

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


## Bản vá bảo mật và Bản đồ Kỷ niệm (phase17)

- Sau khi đã chạy `supabase/phase16.sql`, chạy `supabase/phase17.sql` trong Supabase SQL Editor **trước khi deploy frontend**. Migration thay policy Storage rộng `media_all` bằng quyền đọc theo bản ghi đang được phép xem; quyền cập nhật/xóa được giới hạn theo tác giả hoặc nội dung dùng chung.
- Ảnh upload mới được đặt dưới `space_id/user_id/...`. Quyền sửa/xóa đối chiếu `owner_id` của Storage, thư mục user và bản ghi metadata (khi còn tồn tại), nên vẫn hỗ trợ các tệp cũ và giữ nguyên thứ tự xóa hiện tại. Cache URL ký được tách theo user để không dùng nhầm URL giữa hai phiên đăng nhập trên cùng trình duyệt.
- Bản đồ Kỷ niệm hiển thị cả kế hoạch có trạng thái `Đã đi`, ngoài kế hoạch `Đã chốt` có ngày kết thúc đã qua.
- Cập nhật framework: Next.js `15.5.29`, React/React DOM `19.3.1` và typings React `19.3.0`. Sau khi áp dụng mã nguồn, chạy `npm install` để đồng bộ `package-lock.json`, rồi `npm run build`.

## Vá C2: ảnh bìa kế hoạch (phase19)

- Sau `supabase/phase18.sql`, chạy `supabase/phase19.sql` trong Supabase SQL Editor. Migration thêm điều kiện `plans.cover_path` vào policy đọc/sửa/xóa Storage để người còn lại xem được ảnh bìa kế hoạch. Có thể chạy lại an toàn.

## Vá lỗi mức trung bình (phase20 đến phase23)

Chạy lần lượt trong Supabase SQL Editor, **sau `phase19.sql`**, rồi deploy frontend và Edge Functions. Tất cả đều chạy lại an toàn.

- `phase20.sql` (T4, T9): `spaces` chỉ còn sửa được cột `name` và `start_date`; trigger chặn ngày bắt đầu yêu ngoài khoảng 01/01/1950 đến hôm nay; `create_space` từ chối khi người gọi đã ở trong một Space.
- `phase21.sql` (T7): bảng `calls` và hàm `ringing_call()`, để bên nhận đang đóng app vẫn thấy cuộc gọi khi mở app từ thông báo đẩy.
- `phase22.sql` (T11b): `memory_places` không còn lặp toàn bộ đường đi ở dòng điểm cuối của hành trình.
- `phase23.sql` (T15, L3): cột `stops.end_time` và hàm `set_stop_vote` (bình chọn Thích/Không không ghi đè nhau).
- Deploy lại hàm: `supabase functions deploy anniversary`. Hàm này giờ **chỉ nhận khóa service_role** trong header `Authorization` (T8); lịch `pg_cron` ở `supabase/functions/README.md` đã gửi đúng khóa này. Nhắc thêm 7 ngày, kỷ niệm tháng và 29/02 (T2) cũng nằm trong hàm này.
- T9, bước làm tay: khi cả hai đã vào Space, vào Supabase > Authentication > Providers > Email và tắt **Allow new users to sign up**. Không có bước này thì ai biết địa chỉ site vẫn tạo được tài khoản mới.

## Trò chơi cho hai người (phase24)

Mở từ Trang chủ > **Trò chơi** (`/games`). Chín trò, chơi cùng lúc hoặc chơi dở rồi để đó, lúc nào rảnh người kia vào chơi tiếp:

- **Cờ bàn:** Cờ caro (bàn 15x15 hoặc 10x10, nối 5 quân).
- **Giấu thông tin:** Số bí mật (Bulls & Cows), Phá thuyền (mỗi người tự xếp đội tàu, người kia không thấy).
- **Bài:** Lật bài trí nhớ (đối kháng hoặc cùng đội), Bài cào (ba cào, tính nút), Xì dách 2 người (cái và con đổi vai).
- **Gắn kết:** Ai hiểu ai nhất (một người trả lời về mình, người kia đoán), Vẽ và đoán (vẽ trực tiếp), Thật hay thách (thẻ nhẹ nhàng, thân mật, sâu sắc).
- **Hộp quà thử thách** (`/games/rewards`): mỗi người tự viết sẵn các phần quà “mình sẽ làm cho người ấy”; người thắng một ván rút ngẫu nhiên một phần từ hộp của người kia.

Cách bật:

1. Supabase > SQL Editor, chạy `supabase/phase24.sql` (sau phase23, chạy lại nhiều lần vẫn an toàn). File này tạo bảng `games`, `game_secrets`, `game_vouchers`, các hàm luật chơi, thêm hai bảng vào Realtime và mở kênh `game-<space>` cho nét vẽ.
2. Muốn có thông báo đẩy “đến lượt bạn” và lời rủ chơi: deploy lại Edge Function `push` (`supabase functions deploy push`). Chưa deploy thì game vẫn chơi bình thường, chỉ không có thông báo. App chỉ gửi thông báo khi người kia không đang mở đúng ván đó, tối đa một lần mỗi 90 giây mỗi ván.
3. Không cần biến môi trường mới.

Thiết kế:

- Mọi luật chơi chạy ở **máy chủ** (hàm `security definer`): kiểm tra đúng lượt, đúng nước đi, chấm thắng thua. Trình duyệt chỉ đọc `games` (đẩy realtime) và gọi hàm; không ghi thẳng vào bảng.
- Thông tin phải giấu (tàu của mình, lá bài trên tay, số bí mật, đáp án, từ cần vẽ, vị trí lá bài úp) nằm trong `game_secrets`. Bảng này bật RLS và không có policy nào, nên trình duyệt không đọc được; chỉ hàm `game_my_secret` trả về đúng phần của người gọi. Xóa ván thì bí mật xóa theo.
- Mỗi trò có đúng một ván đang chơi trong một Space; cột `waiting` cho biết ai đang phải hành động (hiện ở Trang chủ và thông báo).
- Vẽ và đoán: nét vẽ đi qua kênh broadcast, không lưu lại; vào muộn hoặc mở lại thì xin người vẽ gửi lại nét. Từ khóa chỉ nằm trong `game_secrets`, đáp án được so ở máy chủ (không phân biệt hoa thường và dấu).
- Thêm trò mới: thêm tên vào `check` của `games.kind` và các hàm luật trong SQL, viết một component trong `components/games/`, đăng ký ở `lib/games/types.ts` và `app/(app)/games/[id]/page.tsx`. Nội dung (câu hỏi, từ, thẻ, gợi ý quà) nằm ở `lib/games/content.ts`, sửa không cần đụng máy chủ.

Chạy thử luật chơi trên Postgres thường (không cần Supabase): tạo một database rỗng rồi chạy lần lượt `supabase/tests/phase24_stub.sql`, `supabase/phase24.sql`, `phase24_test_1.sql`, `phase24_test_2.sql`, `phase24_test_rls.sql` bằng `psql -v ON_ERROR_STOP=1 -f`. Mỗi bài kiểm tra in `NOTICE: ... ok` khi qua.

## Thông báo, trả lời bình luận, GIF (phase25)

Ba thứ mới cho Khoảnh khắc và Chat:

- **Thông báo khi người ấy đăng khoảnh khắc mới hoặc bình luận**: có chuông 🔔 ở Trang chủ và Khoảnh khắc (hiện số chưa đọc), bấm vào là mở thẳng khoảnh khắc đó. Đang mở app thì có thẻ thông báo nổi ở đầu màn hình; khoảnh khắc chưa xem có nhãn "Mới" trong danh sách. Đóng app thì có thông báo đẩy (cần bật ở Cài đặt > Bật thông báo như trước). Đang xem đúng khoảnh khắc đó thì không báo thừa.
- **Chế độ trả lời bình luận**: bấm "Trả lời" dưới một bình luận, ô nhập chuyển sang "Trả lời …" (có nút × để hủy). Câu trả lời hiện thụt vào dưới bình luận gốc; chỉ có **một cấp**, trả lời một câu trả lời thì tự gắn về bình luận gốc. Luồng dài chỉ hiện 2 câu mới nhất, bấm để xem hết. Xóa bình luận gốc thì các câu trả lời xóa theo (có hỏi lại).
- **GIF cho tin nhắn và bình luận**: nút **GIF** cạnh ô nhập (Chat và bình luận). Có **bộ sưu tập GIF chung** của hai người ("Của tụi mình"), bấm "＋ Tải GIF lên" để thêm GIF/WebP động từ máy (tối đa 8 MB, 5 tệp mỗi lần). Muốn tìm GIF có sẵn thì thêm khóa GIPHY (bên dưới), sẽ có tab "Tìm GIF", bấm ★ trên một GIF để lưu vào bộ sưu tập.

Cài đặt (theo thứ tự, **trước khi** đưa bản app mới lên Vercel):

1. Supabase > SQL Editor, chạy `supabase/phase25.sql` (sau phase24, chạy lại nhiều lần vẫn an toàn). File này: thêm cột trả lời/GIF cho `moment_comments` và `messages`; tạo bảng `gifs` và bucket riêng `gifs`; tạo bảng `notifications` cùng hai trigger (khoảnh khắc mới, bình luận mới) và bật realtime cho nó.
2. Deploy lại Edge Function `push` để có thông báo đẩy cho khoảnh khắc và bình luận: `supabase functions deploy push`. Chưa deploy thì thông báo trong app (chuông, thẻ nổi) vẫn chạy, chỉ không có thông báo đẩy khi đóng app.
3. (Không bắt buộc) Tìm GIF trên GIPHY: tạo khóa tại developers.giphy.com, đặt `NEXT_PUBLIC_GIPHY_KEY` ở Vercel và `.env.local`, rồi deploy lại. Khóa này nằm trong mã chạy ở trình duyệt nên đặt đúng loại khóa web của GIPHY, đừng dùng khóa riêng tư. Thiếu khóa thì ẩn tab "Tìm GIF".

Thiết kế:

- Thông báo trong app do **trigger ở cơ sở dữ liệu** tạo, nên không phụ thuộc trình duyệt người gửi có kịp gọi hàm hay không. Trình duyệt chỉ được đọc, đánh dấu đã đọc (cột `read_at`) và xóa thông báo của chính mình; không ai tự tạo hay sửa nội dung thông báo được.
- GIF có hai nguồn: tệp tải lên (`gif_path`, nằm trong bucket private `gifs`, đọc bằng link ký 6 giờ) hoặc link GIPHY (`gif_url`). Cơ sở dữ liệu chỉ nhận link `https` đúng tên miền `media*.giphy.com` / `i.giphy.com`, và đường dẫn tệp phải nằm trong thư mục Space của người gửi, nên không chèn được link hay tệp tùy ý vào tin nhắn.
- Bucket `gifs` chỉ cho đọc và thêm, **không sửa/xóa**, để tin nhắn cũ không bị mất GIF. Gỡ một GIF khỏi bộ sưu tập chỉ bỏ nó khỏi danh sách chọn; tệp vẫn nằm trong Storage (mỗi tệp ≤ 8 MB).
- Dùng GIPHY nghĩa là trình duyệt gọi `api.giphy.com` và tải ảnh từ `media*.giphy.com` (kèm chữ "Powered by GIPHY" theo điều khoản của họ). Chỉ gửi từ khóa tìm, không gửi gì khác của hai đứa.

Chạy thử SQL trên Postgres thường (không cần Supabase): tạo một database rỗng rồi chạy `psql -v ON_ERROR_STOP=1 -f supabase/tests/phase25_stub.sql -f supabase/phase25.sql -f supabase/tests/phase25_test.sql` từ thư mục gốc dự án. Kiểm tra trigger thông báo, trả lời một cấp, ràng buộc GIF, quyền truy cập bảng/Storage, và chạy lại không nhân đôi trigger; cuối cùng in `ALL phase25 tests passed`.
