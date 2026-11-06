TDLOVE — GÓI BẢN VÁ 5 NHÓM LỖI

MỤC ĐÍCH
- Khóa quyền đọc Storage media theo RLS của bản ghi, bao gồm ảnh nhật ký riêng tư; rút TTL URL ký mặc định xuống 5 phút và cache tách theo user.
- Sửa PlacePicker chỉ mở cho đúng Moment được chọn; ký URL thumbnail trước khi hiển thị.
- Sửa timeline playback bằng effect có state mới nhất.
- Bổ sung kế hoạch trạng thái “Đã đi” vào memory_places.
- Nâng Next.js + React, cập nhật tên migration phase8_trc.sql trong README.

CÁCH ÁP DỤNG TRÊN WINDOWS (PowerShell)
1. Clone repo và chuyển về main mới nhất:
   git clone https://github.com/dungvu9233hp-tech/tdlove.git
   cd tdlove
   git pull origin main

2. Tạo nhánh làm việc mới (main không bị thay đổi):
   git switch -c fix/security-map-timeline-2026-11

3. Giải nén apply_tdlove_fix.py vào thư mục gốc tdlove, sau đó chạy:
   py apply_tdlove_fix.py

4. Script tự tạo bản sao file gốc trong `.tdlove_fix_backup/`. Cài dependencies, cập nhật package-lock.json và build:
   npm install
   npm run build

5. Kiểm tra diff rồi commit/push:
   git status
   git diff --check
   git diff
   git add package.json package-lock.json README.md app components lib supabase
   git commit -m "fix: secure private media and repair memory map"
   git push -u origin fix/security-map-timeline-2026-11

6. Tạo Pull Request từ fix/security-map-timeline-2026-11 vào main. Merge sau khi xem CI/build và thử hai tài khoản.

MIGRATION SUPABASE
- Chạy supabase/phase17.sql SAU phase16.sql và TRƯỚC deploy frontend.
- phase17.sql được script tạo từ chính định nghĩa memory_places đã cập nhật trong phase16.sql, nên hai file giữ cùng logic.
- Không chạy phase17.sql trước phase16.sql.

KIỂM THỬ SAU KHI ÁP DỤNG
- Tài khoản A tạo nhật ký riêng tư kèm ảnh. Tài khoản B phải không thấy entry, diary_media và không tạo được signed URL/list object của ảnh đó.
- A mở lại nhật ký riêng tư, ảnh vẫn xem/tải được.
- A tạo Moment ảnh, sửa ảnh cũ, xóa ảnh; thử tương tự với ảnh nhật ký và ảnh Quán muốn thử.
- Trên Map > Kỷ niệm, bấm “Gắn vị trí” cho từng Moment; picker chỉ mở 1 lần và đóng được; preview thumbnail phải hiển thị.
- Bấm Phát lại timeline, xác nhận chỉ số tăng lần lượt đến cuối; dừng, tua thanh, phát lại và đổi chip.
- Tạo một kế hoạch chuyển trạng thái “Đã đi”; kiểm tra xuất hiện trên Bản đồ Kỷ niệm.
- Kiểm tra README chỉ dùng `phase8_trc.sql`, không còn tham chiếu `phase8.sql`.

GIỚI HẠN
- Gói này là patch script chạy trên checkout local của bạn; nó không tạo branch/commit trên GitHub thay bạn.
- Sau khi áp dụng cần `npm install` để tạo lockfile mới và phải chạy build/test trên môi trường có kết nối npm.
- URL signed đã cấp trước khi chuyển nhật ký sang riêng tư từ phiên bản cũ có thể vẫn hoạt động đến khi hết hạn cũ (tối đa 1 giờ); phiên bản vá cấp URL mới với TTL mặc định 5 phút, cache theo user, và RLS chặn request mới không được phép.
