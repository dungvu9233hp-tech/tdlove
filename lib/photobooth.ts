// Photobooth: mô hình dữ liệu, frame mẫu, tính toán "ảnh luôn phủ kín khung" và xuất PNG.
export type Item = {
  id: string; k: 'photo' | 'sticker' | 'text'
  x: number; y: number; w: number; h: number; r: number      // tâm (x,y), kích thước, góc xoay (độ)
  src?: string; iw?: number; ih?: number                     // ảnh/sticker: đường dẫn + kích thước gốc
  z?: number; ox?: number; oy?: number                       // ô ảnh: zoom (>=1) và dịch ảnh bên trong
  bd?: number; bb?: number; rd?: number                      // ô ảnh: viền, viền đáy thêm (kiểu polaroid), bo góc
  text?: string; fs?: number; color?: string                 // chữ
}
export type Slot = { x: number; y: number; w: number; h: number; r?: number; bd?: number; bb?: number; rd?: number }
export type Frame = { id: string; name: string; W: number; H: number; slots: Slot[]; overlay?: string }   // overlay: ảnh frame PNG có lỗ trong suốt, nằm trên ảnh
export type Sticker = { id: string; name: string; src: string; w: number; cat: string }
export const CATS = ['Tất cả', 'Dâu & đỏ', 'Quán cà phê', 'Hồng nhạt', 'Nét vẽ', 'Mèo cute', 'Sinh nhật', 'Mèo mood', 'Hoa', 'Cúc áo', 'Biển hồng', 'Biển xanh', 'Cottage đỏ', 'Thư tình', 'Máy ảnh']

const P = (x: number, y: number, w: number, h: number, r = 0, bd = 0, bb = 0, rd = 0): Slot => ({ x, y, w, h, r, bd, bb, rd })
export const FRAMES: Frame[] = [
  { id: 'blank', name: 'Frame rỗng', W: 1000, H: 1500, slots: [] },
  { id: 'strip', name: 'Dải 4 ảnh', W: 600, H: 1800, slots: [0, 1, 2, 3].map(i => P(50, 50 + i * 380, 500, 350, 0, 0, 0, 14)) },
  { id: 'grid', name: 'Lưới 2×2', W: 1000, H: 1250, slots: [P(40, 40, 440, 440, 0, 0, 0, 16), P(520, 40, 440, 440, 0, 0, 0, 16), P(40, 520, 440, 440, 0, 0, 0, 16), P(520, 520, 440, 440, 0, 0, 0, 16)] },
  { id: 'duo', name: 'Polaroid đôi', W: 1000, H: 1600, slots: [P(120, 60, 760, 720, -3, 28, 100), P(120, 810, 760, 720, 3, 28, 100)] },
  { id: 'one', name: 'Polaroid lớn', W: 1000, H: 1250, slots: [P(80, 80, 840, 1000, 0, 40, 160)] },
  { id: 'collage', name: 'Collage 3 ảnh', W: 1000, H: 1333, slots: [P(400, 50, 540, 560, 4, 24, 70), P(50, 330, 560, 760, -3, 24, 24), P(450, 830, 500, 430, 3, 24, 24)] },
  { id: 'film4', name: 'Phim 4 ô', W: 444, H: 1071, overlay: '/photobooth/frames/film4.png', slots: [{ x: 61.2, y: 20.3, w: 325.6, h: 247.3 }, { x: 60.6, y: 289.6, w: 322.7, h: 243.6 }, { x: 59.2, y: 555.9, w: 319.7, h: 240.1 }, { x: 59.0, y: 817.0, w: 316.0, h: 237.0 }] },
  { id: 'camera-sony', name: 'Máy ảnh', W: 392, H: 297, overlay: '/photobooth/frames/camera-sony.png', slots: [{ x: 51.1, y: 63.1, w: 213.7, h: 159.8, r: 14.9 }] },
  { id: 'caro-1', name: 'Polaroid caro hồng', W: 680, H: 770, overlay: '/photobooth/frames/caro-1.png', slots: [{ x: 88.0, y: 83.0, w: 504, h: 504 }] },
  { id: 'caro-3', name: 'Caro 3 polaroid', W: 1000, H: 1500, overlay: '/photobooth/frames/caro-3.png', slots: [{ x: 124.5, y: 88.2, w: 404.0, h: 404.0, r: -5 }, { x: 460.8, y: 518.1, w: 404.0, h: 404.0, r: 4 }, { x: 145.9, y: 928.1, w: 404.0, h: 404.0, r: -3 }] },
  { id: 'strip-white3', name: 'Dải trắng 3 ảnh', W: 599, H: 1694, overlay: '/photobooth/frames/strip-white3.png', slots: [{ x: 50, y: 53, w: 491, h: 494 }, { x: 50, y: 593, w: 491, h: 494 }, { x: 50, y: 1133, w: 491, h: 494 }] },
  { id: 'strip-grey3', name: 'Dải xám 3 ảnh', W: 420, H: 1205, overlay: '/photobooth/frames/strip-grey3.png', slots: [{ x: 38, y: 35, w: 339, h: 344 }, { x: 38, y: 390, w: 339, h: 344 }, { x: 38, y: 745, w: 339, h: 344 }] },
]
const SK = (id: string, name: string, ext: string, w: number, cat: string): Sticker => ({ id, name, src: `/photobooth/stickers/${id}.${ext}`, w, cat })
export const STICKERS: Sticker[] = [
  SK('cake', 'Bánh dâu', 'png', 300, 'Dâu & đỏ'),
  SK('bear', 'Gấu bông', 'png', 340, 'Dâu & đỏ'),
  SK('phone-rotary', 'Điện thoại', 'png', 320, 'Dâu & đỏ'),
  SK('phone-handset', 'Ống nghe', 'png', 130, 'Dâu & đỏ'),
  SK('clip-1', 'Kẹp đỏ', 'png', 120, 'Dâu & đỏ'),
  SK('clip-2', 'Kẹp đỏ 2', 'png', 130, 'Dâu & đỏ'),
  SK('tag-1', 'Nhãn 1', 'png', 260, 'Dâu & đỏ'),
  SK('tag-2', 'Nhãn 2', 'png', 380, 'Dâu & đỏ'),
  SK('croissant', 'Bánh sừng bò', 'png', 240, 'Quán cà phê'),
  SK('pretzel', 'Bánh pretzel', 'png', 230, 'Quán cà phê'),
  SK('receipt', 'Hóa đơn', 'png', 200, 'Quán cà phê'),
  SK('bubble-hello', 'Bong bóng hỏi', 'png', 330, 'Quán cà phê'),
  SK('bubble-caramel', 'Bong bóng đáp', 'png', 280, 'Quán cà phê'),
  SK('tag-open', 'Nhãn we’re open', 'png', 320, 'Quán cà phê'),
  SK('flower-pink', 'Hoa hồng nhạt', 'png', 230, 'Hồng nhạt'),
  SK('camera-pink', 'Máy ảnh hồng', 'png', 260, 'Hồng nhạt'),
  SK('shark-cat', 'Mèo cá mập', 'png', 230, 'Hồng nhạt'),
  SK('flower-dark', 'Hoa tím', 'png', 120, 'Hồng nhạt'),
  SK('bow', 'Nơ hồng', 'png', 200, 'Hồng nhạt'),
  SK('lips', 'Dấu môi', 'png', 220, 'Hồng nhạt'),
  SK('disco-ball', 'Bóng disco', 'png', 190, 'Hồng nhạt'),
  SK('flower-sticker', 'Hoa viền trắng', 'png', 300, 'Hồng nhạt'),
  SK('disco-heart', 'Tim disco', 'png', 220, 'Hồng nhạt'),
  SK('seal-bow', 'Dấu sáp nơ', 'png', 130, 'Hồng nhạt'),
  SK('lily', 'Hoa lily', 'png', 160, 'Hồng nhạt'),
  SK('lip-balm', 'Son dưỡng dâu', 'png', 230, 'Hồng nhạt'),
  SK('chrome-star', 'Sao bạc', 'png', 240, 'Hồng nhạt'),
  SK('gold-stars', 'Sao vàng', 'png', 260, 'Hồng nhạt'),
  SK('butterfly', 'Bướm', 'png', 220, 'Hồng nhạt'),
  SK('camera-nikon', 'Máy ảnh cũ', 'png', 240, 'Hồng nhạt'),
  SK('basket', 'Giỏ đỏ', 'png', 520, 'Dâu & đỏ'),
  SK('tag-favorite', 'Favorite person', 'png', 260, 'Dâu & đỏ'),
  SK('babygirl', 'Baby girl', 'png', 200, 'Dâu & đỏ'),
  SK('strawberry', 'Dâu tây', 'png', 260, 'Dâu & đỏ'),
  SK('cherry-bow', 'Cherry nơ', 'png', 200, 'Dâu & đỏ'),
  SK('rocket', 'Tên lửa', 'png', 200, 'Dâu & đỏ'),
  SK('clips', 'Kẹp tóc đỏ', 'png', 200, 'Dâu & đỏ'),
  SK('girls', 'Chữ girls', 'png', 220, 'Dâu & đỏ'),
  SK('my-girl', 'Tim my girl', 'png', 160, 'Dâu & đỏ'),
  SK('plate', 'Biển memories', 'png', 130, 'Dâu & đỏ'),
  SK('stars-red', 'Sao đỏ', 'png', 160, 'Dâu & đỏ'),
  SK('heart-line', 'Tim trắng', 'svg', 160, 'Nét vẽ'),
  SK('heart-pink', 'Tim hồng', 'svg', 160, 'Nét vẽ'),
  SK('sparkle', 'Lấp lánh', 'svg', 120, 'Nét vẽ'),
  SK('star-doodle', 'Sao', 'svg', 120, 'Nét vẽ'),
  SK('squiggle', 'Nét lượn', 'svg', 240, 'Nét vẽ'),
  SK('swirl', 'Xoáy', 'svg', 150, 'Nét vẽ'),
  SK('arrow-dash', 'Mũi tên', 'svg', 220, 'Nét vẽ'),
  SK('tape', 'Băng dính', 'svg', 220, 'Nét vẽ'),
  // ---- bộ sticker mèo & sinh nhật (thêm sau) ----
  SK('cat-tulip', 'Mèo ôm tulip', 'webp', 300, 'Mèo cute'),
  SK('cat-hand-bow', 'Mèo che má', 'webp', 215, 'Mèo cute'),
  SK('cat-bigface-bow', 'Mèo má phính', 'webp', 198, 'Mèo cute'),
  SK('cat-bunny-hat', 'Mèo mũ thỏ', 'webp', 196, 'Mèo cute'),
  SK('cat-polka-bow', 'Mèo nơ chấm bi', 'webp', 290, 'Mèo cute'),
  SK('cat-tabby-bow', 'Mèo mướp nơ hồng', 'webp', 236, 'Mèo cute'),
  SK('cat-la-cap', 'Mèo mũ LA', 'webp', 294, 'Mèo cute'),
  SK('cat-kitten-bouquet', 'Mèo con ôm hoa', 'webp', 197, 'Mèo cute'),
  SK('cat-glasses-kitty', 'Mèo kính hồng', 'webp', 275, 'Mèo cute'),
  SK('cat-chiikawa', 'Mèo lè lưỡi nơ trắng', 'webp', 251, 'Mèo cute'),
  SK('cat-matcha-bow', 'Mèo matcha nơ hồng', 'webp', 300, 'Mèo cute'),
  SK('cat-plumeria', 'Mèo hoa sứ', 'webp', 268, 'Mèo cute'),
  SK('cat-diet-coke', 'Mèo Diet Coke', 'webp', 285, 'Mèo cute'),
  SK('cat-matcha-side', 'Mèo cầm matcha', 'webp', 300, 'Mèo cute'),
  SK('cat-shark-fluffy', 'Mèo cá mập lông xù', 'webp', 207, 'Mèo cute'),
  SK('cat-shark-pacifier', 'Mèo cá mập ngậm núm', 'webp', 233, 'Mèo cute'),
  SK('cat-shark-sad', 'Mèo cá mập cau có', 'webp', 219, 'Mèo cute'),
  SK('cat-hands-cheek', 'Mèo ôm má', 'webp', 290, 'Mèo cute'),
  SK('cat-flower-crown', 'Mèo vòng hoa cúc', 'webp', 280, 'Mèo cute'),
  SK('cat-grumpy-bow', 'Mèo cau có nơ hồng', 'webp', 255, 'Mèo cute'),
  SK('cat-bee', 'Mèo ong', 'webp', 242, 'Mèo cute'),
  SK('cat-blush-bows', 'Mèo ửng hồng', 'webp', 251, 'Mèo cute'),
  SK('cat-standing-kitten', 'Mèo con đứng', 'webp', 148, 'Mèo cute'),
  SK('cat-red-star', 'Mèo sao đỏ', 'webp', 228, 'Mèo cute'),
  SK('cat-mushroom', 'Mèo nấm', 'webp', 252, 'Mèo cute'),
  SK('cat-sunglasses', 'Mèo kính râm', 'webp', 290, 'Mèo cute'),
  SK('two-cats-tongue', 'Hai mèo lè lưỡi', 'webp', 320, 'Mèo cute'),
  SK('cat-heart-hands', 'Mèo tim tay', 'webp', 260, 'Mèo cute'),
  SK('party-cat-balloons', 'Mèo bóng bay', 'webp', 249, 'Sinh nhật'),
  SK('kitten-cake-bouquet', 'Mèo bánh kem', 'webp', 273, 'Sinh nhật'),
  SK('cat-party-bouquet', 'Mèo mũ sinh nhật', 'webp', 179, 'Sinh nhật'),
  SK('bday-cake-pink', 'Bánh sinh nhật hồng', 'webp', 239, 'Sinh nhật'),
  SK('cake-strawberry', 'Bánh kem dâu', 'webp', 248, 'Sinh nhật'),
  SK('bday-paper-title', 'Happy Birthday giấy', 'webp', 520, 'Sinh nhật'),
  SK('balloon-happy', 'Bóng chữ HAPPY', 'webp', 460, 'Sinh nhật'),
  SK('balloon-birthday', 'Bóng chữ BIRTHDAY', 'webp', 520, 'Sinh nhật'),
  SK('script-bday-black', 'Happy birthday đen', 'webp', 420, 'Sinh nhật'),
  SK('script-vertical', 'Happy birthday dọc', 'webp', 184, 'Sinh nhật'),
  SK('flork-bday', 'Flork sinh nhật', 'webp', 174, 'Sinh nhật'),
  SK('snoopy-bday', 'Snoopy sinh nhật', 'webp', 300, 'Sinh nhật'),
  SK('goose-cowboy', 'Ngỗng cao bồi', 'webp', 260, 'Sinh nhật'),
  SK('dice-hearts', 'Xúc xắc tim', 'webp', 149, 'Sinh nhật'),
  SK('balloon-dog', 'Chó bóng', 'webp', 188, 'Sinh nhật'),
  SK('main-character', 'Main character', 'webp', 340, 'Sinh nhật'),
  SK('tag-making-memories', 'Making memories', 'webp', 300, 'Sinh nhật'),
  SK('tag-lucky', 'Lucky to have you', 'webp', 300, 'Sinh nhật'),
  SK('heart-you-make-me', 'Tim you make me happy', 'webp', 240, 'Hồng nhạt'),
  SK('heart-3d-pink', 'Tim hồng bóng', 'webp', 217, 'Hồng nhạt'),
  SK('hearts-concentric', 'Tim nhiều lớp', 'webp', 220, 'Hồng nhạt'),
  SK('heart-sleepy', 'Tim ngủ ngoan', 'webp', 200, 'Hồng nhạt'),
  SK('envelope', 'Thư hồng', 'webp', 200, 'Hồng nhạt'),
  SK('bow-satin', 'Nơ satin', 'webp', 200, 'Hồng nhạt'),
  SK('bow-pink-ribbon', 'Nơ ruy băng', 'webp', 200, 'Hồng nhạt'),
  SK('button-pink', 'Cúc áo hồng', 'webp', 120, 'Hồng nhạt'),
  SK('tulips', 'Hoa tulip', 'webp', 235, 'Hồng nhạt'),
  SK('lily-pink', 'Hoa lily hồng', 'webp', 193, 'Hồng nhạt'),
  SK('butterfly-pink', 'Bướm hồng', 'webp', 145, 'Hồng nhạt'),
  SK('sparkle-chrome', 'Lấp lánh bạc', 'webp', 200, 'Hồng nhạt'),
  SK('stars-silver-pair', 'Đôi sao bạc', 'webp', 280, 'Hồng nhạt'),
  SK('mwah', 'Mwah', 'webp', 340, 'Hồng nhạt'),
  SK('lips-red', 'Môi đỏ', 'webp', 250, 'Dâu & đỏ'),
  SK('bow-gingham', 'Nơ caro đỏ', 'webp', 203, 'Dâu & đỏ'),
  SK('strawberry-sparkle', 'Dâu lấp lánh', 'webp', 120, 'Dâu & đỏ'),
  SK('tag-thats-my-girl', 'That’s my girl', 'webp', 87, 'Dâu & đỏ'),
  SK('tag-cherry-girl', 'Cherry girl', 'webp', 300, 'Dâu & đỏ'),
  SK('tart-strawberry', 'Bánh tart dâu', 'webp', 240, 'Dâu & đỏ'),
  SK('mushroom-mario', 'Nấm đỏ', 'webp', 196, 'Dâu & đỏ'),
  SK('buttons-red', 'Cúc áo đỏ', 'webp', 148, 'Dâu & đỏ'),
  SK('ticket-red', 'Vé đỏ', 'webp', 260, 'Dâu & đỏ'),
  SK('sylvanian-strawberry', 'Thỏ mũ dâu', 'webp', 138, 'Dâu & đỏ'),
  SK('strawberry-embroidery', 'Dâu thêu', 'webp', 216, 'Dâu & đỏ'),
  // ---- bộ sticker mood mèo, hoa, cúc áo, biển, cottage, thư tình, máy ảnh (thêm sau) ----
  SK('mood-01', 'Mèo ngủ chăn hồng', 'webp', 181, 'Mèo mood'),
  SK('mood-02', 'Mèo mặt nạ dưa leo', 'webp', 200, 'Mèo mood'),
  SK('mood-03', 'Mèo trùm chăn gõ laptop', 'webp', 232, 'Mèo mood'),
  SK('mood-04', 'Mèo nghe nhạc', 'webp', 208, 'Mèo mood'),
  SK('mood-05', 'Mèo hoodie hồng rối bời', 'webp', 211, 'Mèo mood'),
  SK('mood-06', 'Mèo khóc ôm gấu', 'webp', 182, 'Mèo mood'),
  SK('mood-07', 'Mèo kem giận dỗi', 'webp', 158, 'Mèo mood'),
  SK('mood-08', 'Mèo ngáp to', 'webp', 163, 'Mèo mood'),
  SK('mood-09', 'Mèo mũ Kitty khóc', 'webp', 193, 'Mèo mood'),
  SK('mood-10', 'Mèo bên laptop', 'webp', 165, 'Mèo mood'),
  SK('mood-11', 'Mèo kính râm', 'webp', 167, 'Mèo mood'),
  SK('mood-12', 'Mèo nằm ngửa', 'webp', 204, 'Mèo mood'),
  SK('mood-13', 'Mèo hoodie xám rối bời', 'webp', 200, 'Mèo mood'),
  SK('mood-14', 'Mèo hết pin', 'webp', 219, 'Mèo mood'),
  SK('mood-15', 'Mèo chườm đá', 'webp', 181, 'Mèo mood'),
  SK('mood-16', 'Mèo khóc ôm thú bông', 'webp', 192, 'Mèo mood'),
  SK('mood-17', 'Mèo mũ heo lướt điện thoại', 'webp', 176, 'Mèo mood'),
  SK('mood-18', 'Mèo trà sữa', 'webp', 189, 'Mèo mood'),
  SK('mood-19', 'Mèo kính râm gối hồng', 'webp', 234, 'Mèo mood'),
  SK('mood-20', 'Mèo nằm rối bời', 'webp', 221, 'Mèo mood'),
  SK('mood-21', 'Mèo ôm tim hồng', 'webp', 188, 'Mèo mood'),
  SK('mood-22', 'Mèo tai nghe tim vỡ', 'webp', 231, 'Mèo mood'),
  SK('mood-23', 'Mèo học bài', 'webp', 252, 'Mèo mood'),
  SK('mood-24', 'Mèo áo ếch', 'webp', 173, 'Mèo mood'),
  SK('mood-25', 'Mèo khóc cầm điện thoại', 'webp', 189, 'Mèo mood'),
  SK('mood-26', 'Mèo nằm nghĩ về tim', 'webp', 198, 'Mèo mood'),
  SK('mood-27', 'Mèo đen trùm chăn', 'webp', 204, 'Mèo mood'),
  SK('mood-28', 'Mèo ngủ trên laptop', 'webp', 227, 'Mèo mood'),
  SK('mood-29', 'Mèo áo cá mập', 'webp', 192, 'Mèo mood'),
  SK('mood-30', 'Mèo kính tim', 'webp', 173, 'Mèo mood'),
  SK('mood-31', 'Mèo nơ hồng giận', 'webp', 193, 'Mèo mood'),
  SK('mood-32', 'Mèo tai nghe', 'webp', 186, 'Mèo mood'),
  SK('mood-33', 'Mèo nằm bẹp', 'webp', 212, 'Mèo mood'),
  SK('mood-34', 'Mèo trong túi nơ', 'webp', 232, 'Mèo mood'),
  SK('mood-35', 'Ếch bông nằm', 'webp', 200, 'Mèo mood'),
  SK('mood-36', 'Mèo hoodie xám tim', 'webp', 170, 'Mèo mood'),
  SK('mood-37', 'Mèo nơ ôm má', 'webp', 190, 'Mèo mood'),
  SK('mood-38', 'Mèo ôm tim đỏ', 'webp', 209, 'Mèo mood'),
  SK('mood-39', 'Gấu bông pyjama', 'webp', 190, 'Mèo mood'),
  SK('mood-40', 'Mèo khóc đắp chăn', 'webp', 236, 'Mèo mood'),
  SK('mood-41', 'Mèo khóc dưới mưa', 'webp', 201, 'Mèo mood'),
  SK('hoa-01', 'Lily hồng', 'webp', 340, 'Hoa'),
  SK('hoa-02', 'Hoa sứ trắng vàng', 'webp', 340, 'Hoa'),
  SK('hoa-03', 'Lily đỏ', 'webp', 340, 'Hoa'),
  SK('hoa-04', 'Dâm bụt trắng hồng', 'webp', 340, 'Hoa'),
  SK('hoa-05', 'Hoa sứ cam', 'webp', 340, 'Hoa'),
  SK('hoa-06', 'Dâm bụt trắng', 'webp', 340, 'Hoa'),
  SK('hoa-07', 'Lily hồng nhạt', 'webp', 340, 'Hoa'),
  SK('hoa-08', 'Hoa anh đào', 'webp', 340, 'Hoa'),
  SK('hoa-09', 'Lan hồng đậm', 'webp', 314, 'Hoa'),
  SK('hoa-10', 'Hoa sen', 'webp', 340, 'Hoa'),
  SK('hoa-11', 'Dâm bụt hồng', 'webp', 340, 'Hoa'),
  SK('hoa-12', 'Hoa sứ mint', 'webp', 340, 'Hoa'),
  SK('hoa-13', 'Hoa xanh tím', 'webp', 340, 'Hoa'),
  SK('hoa-14', 'Hoa thủy tiên trắng', 'webp', 340, 'Hoa'),
  SK('hoa-15', 'Hoa xanh nhạt', 'webp', 340, 'Hoa'),
  SK('cuc-01', 'Cúc sọc nâu hồng', 'webp', 175, 'Cúc áo'),
  SK('cuc-02', 'Cúc thỏ kem', 'webp', 184, 'Cúc áo'),
  SK('cuc-03', 'Cúc chấm hồng', 'webp', 172, 'Cúc áo'),
  SK('cuc-04', 'Cúc chấm hồng đậm', 'webp', 174, 'Cúc áo'),
  SK('cuc-05', 'Cúc sao vàng', 'webp', 170, 'Cúc áo'),
  SK('cuc-06', 'Cúc nâu thêu', 'webp', 196, 'Cúc áo'),
  SK('cuc-07', 'Cúc hoa hồng nhạt', 'webp', 181, 'Cúc áo'),
  SK('cuc-08', 'Cúc trắng', 'webp', 182, 'Cúc áo'),
  SK('cuc-09', 'Cúc nâu 4 lỗ', 'webp', 174, 'Cúc áo'),
  SK('cuc-10', 'Cúc hồng hoa', 'webp', 170, 'Cúc áo'),
  SK('cuc-11', 'Cúc hoa kem', 'webp', 178, 'Cúc áo'),
  SK('cuc-12', 'Cúc tim hồng', 'webp', 182, 'Cúc áo'),
  SK('cuc-13', 'Cúc hồng nhạt chéo chỉ', 'webp', 176, 'Cúc áo'),
  SK('cuc-14', 'Cúc tim be', 'webp', 182, 'Cúc áo'),
  SK('cuc-15', 'Cúc nâu chấm trắng', 'webp', 179, 'Cúc áo'),
  SK('cuc-16', 'Cúc hồng marble', 'webp', 160, 'Cúc áo'),
  SK('cuc-17', 'Cúc caro nâu', 'webp', 185, 'Cúc áo'),
  SK('cuc-18', 'Cúc hoa hồng bóng', 'webp', 194, 'Cúc áo'),
  SK('cuc-19', 'Cúc kem', 'webp', 180, 'Cúc áo'),
  SK('cuc-20', 'Cúc hoa hồng viền', 'webp', 185, 'Cúc áo'),
  SK('cuc-21', 'Cúc vàng be', 'webp', 160, 'Cúc áo'),
  SK('cuc-22', 'Cúc caro hồng', 'webp', 169, 'Cúc áo'),
  SK('cuc-23', 'Cúc nâu xám', 'webp', 171, 'Cúc áo'),
  SK('cuc-24', 'Cúc sao hồng', 'webp', 174, 'Cúc áo'),
  SK('cuc-25', 'Cúc hồng pastel', 'webp', 168, 'Cúc áo'),
  SK('cuc-26', 'Cúc nâu chấm hồng', 'webp', 164, 'Cúc áo'),
  SK('cuc-27', 'Cúc sao kem', 'webp', 186, 'Cúc áo'),
  SK('cuc-28', 'Cúc vàng', 'webp', 176, 'Cúc áo'),
  SK('bien-hong-01', 'Ốc xà cừ hồng nhạt', 'webp', 326, 'Biển hồng'),
  SK('bien-hong-02', 'Hoa anh đào viền đen', 'webp', 301, 'Biển hồng'),
  SK('bien-hong-03', 'Dừa', 'webp', 282, 'Biển hồng'),
  SK('bien-hong-04', 'Sao biển hồng', 'webp', 328, 'Biển hồng'),
  SK('bien-hong-05', 'Lan hồng', 'webp', 306, 'Biển hồng'),
  SK('bien-hong-06', 'Sò hồng', 'webp', 277, 'Biển hồng'),
  SK('bien-hong-07', 'Ốc anh vũ', 'webp', 238, 'Biển hồng'),
  SK('bien-hong-08', 'Sò trắng', 'webp', 275, 'Biển hồng'),
  SK('bien-hong-09', 'Ốc hồng 1', 'webp', 262, 'Biển hồng'),
  SK('bien-hong-10', 'Ngọc trai hồng', 'webp', 246, 'Biển hồng'),
  SK('bien-hong-11', 'Ngọc trai trắng', 'webp', 242, 'Biển hồng'),
  SK('bien-hong-12', 'Thạch anh hồng', 'webp', 331, 'Biển hồng'),
  SK('bien-hong-13', 'Ốc hồng 2', 'webp', 340, 'Biển hồng'),
  SK('bien-hong-14', 'Ốc hồng 3', 'webp', 340, 'Biển hồng'),
  SK('bien-hong-15', 'Lily hồng', 'webp', 340, 'Biển hồng'),
  SK('bien-hong-16', 'Đá thạch anh', 'webp', 286, 'Biển hồng'),
  SK('bien-hong-17', 'Sứa hồng', 'webp', 340, 'Biển hồng'),
  SK('bien-hong-18', 'Geode hồng', 'webp', 320, 'Biển hồng'),
  SK('bien-hong-19', 'Sò ngọc trai', 'webp', 314, 'Biển hồng'),
  SK('bien-hong-20', 'Lan hồ điệp trắng', 'webp', 290, 'Biển hồng'),
  SK('bien-hong-21', 'Vỏ ốc xà cừ', 'webp', 314, 'Biển hồng'),
  SK('bien-xanh-01', 'Hai sao biển', 'webp', 340, 'Biển xanh'),
  SK('bien-xanh-02', 'Rùa biển xanh', 'webp', 340, 'Biển xanh'),
  SK('bien-xanh-03', 'Sò xanh', 'webp', 340, 'Biển xanh'),
  SK('bien-xanh-04', 'Hoa xanh tím', 'webp', 296, 'Biển xanh'),
  SK('bien-xanh-05', 'San hô', 'webp', 210, 'Biển xanh'),
  SK('bien-xanh-06', 'Ngọc trai trắng', 'webp', 278, 'Biển xanh'),
  SK('bien-xanh-07', 'Ốc trắng', 'webp', 304, 'Biển xanh'),
  SK('bien-xanh-08', 'Dâm bụt trắng', 'webp', 340, 'Biển xanh'),
  SK('bien-xanh-09', 'Sao biển xanh', 'webp', 340, 'Biển xanh'),
  SK('bien-xanh-10', 'Ốc anh vũ xanh', 'webp', 340, 'Biển xanh'),
  SK('bien-xanh-11', 'Sò xanh đậm', 'webp', 340, 'Biển xanh'),
  SK('bien-xanh-12', 'Ngọc trai xanh', 'webp', 317, 'Biển xanh'),
  SK('bien-xanh-13', 'Vỏ ốc xà cừ', 'webp', 340, 'Biển xanh'),
  SK('bien-xanh-14', 'Sò ngọc trai xanh', 'webp', 340, 'Biển xanh'),
  SK('cot-01', 'Cherry nơ', 'webp', 250, 'Cottage đỏ'),
  SK('cot-02', 'Nơ hồng ruy băng', 'webp', 248, 'Cottage đỏ'),
  SK('cot-03', 'Tim caro', 'webp', 228, 'Cottage đỏ'),
  SK('cot-04', 'Hoa trắng', 'webp', 207, 'Cottage đỏ'),
  SK('cot-05', 'Thư tim', 'webp', 258, 'Cottage đỏ'),
  SK('cot-06', 'Nơ đỏ', 'webp', 294, 'Cottage đỏ'),
  SK('cot-07', 'Sao vàng thêu', 'webp', 213, 'Cottage đỏ'),
  SK('cot-08', 'Nấm đỏ', 'webp', 220, 'Cottage đỏ'),
  SK('cot-09', 'Hoa hồng', 'webp', 207, 'Cottage đỏ'),
  SK('cot-10', 'Tim ren', 'webp', 246, 'Cottage đỏ'),
  SK('cot-11', 'Cherry nơ hồng', 'webp', 225, 'Cottage đỏ'),
  SK('cot-12', 'Tem cherry', 'webp', 232, 'Cottage đỏ'),
  SK('cot-14', 'Thỏ kem', 'webp', 210, 'Cottage đỏ'),
  SK('cot-16', 'Tim đỏ hoa', 'webp', 212, 'Cottage đỏ'),
  SK('cot-17', 'Nơ xanh lá', 'webp', 274, 'Cottage đỏ'),
  SK('cot-18', 'Hoa xanh', 'webp', 172, 'Cottage đỏ'),
  SK('cot-19', 'Sao đỏ', 'webp', 164, 'Cottage đỏ'),
  SK('cot-20', 'Tem hoa', 'webp', 240, 'Cottage đỏ'),
  SK('cot-21', 'Bánh quy', 'webp', 246, 'Cottage đỏ'),
  SK('cot-22', 'Nơ chấm bi', 'webp', 278, 'Cottage đỏ'),
  SK('cot-23', 'Nhành quả mọng', 'webp', 90, 'Cottage đỏ'),
  SK('cot-24', 'Hũ cherry', 'webp', 254, 'Cottage đỏ'),
  SK('cot-25', 'Dâu tây vẽ', 'webp', 220, 'Cottage đỏ'),
  SK('cot-26', 'Tim hồng', 'webp', 153, 'Cottage đỏ'),
  SK('cot-27', 'Bánh kem cherry', 'webp', 309, 'Cottage đỏ'),
  SK('love-01', 'Câu I love you giấy', 'webp', 340, 'Thư tình'),
  SK('love-02', 'I love you đỏ', 'webp', 218, 'Thư tình'),
  SK('love-03', 'You make me happy', 'webp', 222, 'Thư tình'),
  SK('love-04', 'You belong to me', 'webp', 278, 'Thư tình'),
  SK('love-05', 'I love you chữ viết', 'webp', 340, 'Thư tình'),
  SK('love-07', 'Ghim trắng', 'webp', 90, 'Thư tình'),
  SK('love-08', 'And suddenly', 'webp', 243, 'Thư tình'),
  SK('love-09', 'Favorite person', 'webp', 282, 'Thư tình'),
  SK('love-10', 'I’ll always love you', 'webp', 328, 'Thư tình'),
  SK('love-11', 'Tim I’m all yours', 'webp', 212, 'Thư tình'),
  SK('love-12', 'Dấu sáp đỏ', 'webp', 128, 'Thư tình'),
  SK('love-13', 'You, I truly love you', 'webp', 236, 'Thư tình'),
  SK('love-14', 'Love of my life', 'webp', 340, 'Thư tình'),
  SK('love-15', 'Hoa khô băng dính', 'webp', 102, 'Thư tình'),
  SK('love-18', 'Dấu sáp vàng', 'webp', 111, 'Thư tình'),
  SK('love-20', 'Tim caro nâu', 'webp', 141, 'Thư tình'),
  SK('love-22', 'Môi đỏ', 'webp', 117, 'Thư tình'),
  SK('love-23', 'Môi đỏ đậm', 'webp', 118, 'Thư tình'),
  SK('love-25', 'Thư tim đỏ', 'webp', 138, 'Thư tình'),
  SK('love-27', 'Tim vân tay đỏ', 'webp', 134, 'Thư tình'),
  SK('love-28', 'Nơ caro vàng', 'webp', 153, 'Thư tình'),
  SK('love-29', 'Dấu sáp nơ hồng', 'webp', 123, 'Thư tình'),
  SK('love-30', 'Tim báo cũ', 'webp', 164, 'Thư tình'),
  SK('love-31', 'Bướm hồng', 'webp', 135, 'Thư tình'),
  SK('love-32', 'Tem tim', 'webp', 147, 'Thư tình'),
  SK('love-33', 'Tim thêu hồng', 'webp', 141, 'Thư tình'),
  SK('love-34', 'Pretty boy', 'webp', 270, 'Thư tình'),
  SK('love-35', 'You are my sun', 'webp', 280, 'Thư tình'),
  SK('love-37', 'I love you hồng', 'webp', 258, 'Thư tình'),
  SK('love-38', 'Máy nghe nhạc', 'webp', 243, 'Thư tình'),
  SK('love-39', 'Tim caro đỏ', 'webp', 165, 'Thư tình'),
  SK('love-40', 'Tim giải phẫu', 'webp', 129, 'Thư tình'),
  SK('love-41', 'For the love of nostalgia', 'webp', 168, 'Thư tình'),
  SK('love-42', '11:11', 'webp', 144, 'Thư tình'),
  SK('love-44', 'Hoa khô vàng', 'webp', 99, 'Thư tình'),
  SK('love-45', 'He looks like a dream', 'webp', 226, 'Thư tình'),
  SK('love-46', 'Biển I ♥ YOU', 'webp', 200, 'Thư tình'),
  SK('love-48', 'Hoa trắng ép', 'webp', 124, 'Thư tình'),
  SK('love-49', 'Ghim đỏ', 'webp', 98, 'Thư tình'),
  SK('love-50', 'Tim vân tay hồng', 'webp', 144, 'Thư tình'),
  SK('love-51', 'Love you to the moon', 'webp', 306, 'Thư tình'),
  SK('love-52', 'Bướm xanh', 'webp', 138, 'Thư tình'),
  SK('love-53', 'Hoa nâu 1', 'webp', 164, 'Thư tình'),
  SK('love-54', 'Hoa nâu 2', 'webp', 171, 'Thư tình'),
  SK('love-55', 'Nơ satin hồng', 'webp', 160, 'Thư tình'),
  SK('may-anh-01', 'Máy ảnh bạc nơ hồng', 'webp', 340, 'Máy ảnh'),
  SK('may-anh-02', 'Máy ảnh xanh rêu nơ kem', 'webp', 340, 'Máy ảnh'),
  SK('may-anh-03', 'Máy ảnh hồng sao bạc', 'webp', 340, 'Máy ảnh'),
  SK('may-anh-04', 'Máy ảnh đỏ rượu', 'webp', 340, 'Máy ảnh'),
  SK('may-anh-05', 'Máy ảnh kem tulip', 'webp', 340, 'Máy ảnh'),
  SK('may-anh-06', 'Máy ảnh bạc sao', 'webp', 340, 'Máy ảnh'),
  SK('may-anh-07', 'Máy ảnh nâu caro', 'webp', 340, 'Máy ảnh'),
  SK('may-anh-08', 'Máy ảnh hồng hoa đào', 'webp', 340, 'Máy ảnh'),
  SK('may-anh-09', 'Máy ảnh bạc nơ kem', 'webp', 340, 'Máy ảnh'),
  SK('may-anh-10', 'Máy ảnh xanh rêu cherry', 'webp', 340, 'Máy ảnh'),
]
export const BGS = ['#FFE9F1', '#FFFAFC', '#F8DDE8', '#F3E8FF', '#EBD9C3', '#B4476E', '#4A1D35', '#FFFFFF']

export const uid = () => Math.random().toString(36).slice(2, 9)
export const slotToItem = (s: Slot): Item => ({ id: uid(), k: 'photo', x: s.x + s.w / 2, y: s.y + s.h / 2, w: s.w, h: s.h, r: s.r ?? 0, z: 1, ox: 0, oy: 0, bd: s.bd ?? 0, bb: s.bb ?? 0, rd: s.rd ?? 0 })

const ms = (() => { let c: HTMLCanvasElement | null = null; return () => (c ??= document.createElement('canvas')).getContext('2d')! })()
export const FONT = "'Mali','Quicksand',system-ui,sans-serif"
export function fitText(it: Item): Item {   // đo chữ để khung chọn ôm sát
  const c = ms(); c.font = `700 ${it.fs}px ${FONT}`
  return { ...it, w: Math.ceil(c.measureText(it.text || ' ').width) + 24, h: Math.ceil((it.fs ?? 60) * 1.35) }
}

// Vùng chứa ảnh trong ô (trừ viền) và kích thước ảnh sau khi phóng để LUÔN phủ kín vùng đó, kể cả ảnh dọc/ngang/vuông bất kỳ.
export function fit(it: Item) {
  const bd = it.bd ?? 0, bb = it.bb ?? bd
  const aw = Math.max(10, it.w - 2 * bd), ah = Math.max(10, it.h - bd - bb)
  const iw = it.iw || 1, ih = it.ih || 1, z = Math.max(1, it.z ?? 1)
  const s = Math.max(aw / iw, ah / ih) * z, dw = iw * s, dh = ih * s
  const mx = (dw - aw) / 2, my = (dh - ah) / 2
  const ox = Math.max(-mx, Math.min(mx, it.ox ?? 0)), oy = Math.max(-my, Math.min(my, it.oy ?? 0))
  return { bd, bb, aw, ah, dw, dh, ox, oy }
}

// Tải ảnh người dùng: sửa xoay EXIF, thu nhỏ còn tối đa 1800px để máy yếu không bị treo
export async function loadPhoto(f: File) {
  const bm = await createImageBitmap(f, { imageOrientation: 'from-image' })
  const k = Math.min(1, 1800 / Math.max(bm.width, bm.height)), c = document.createElement('canvas')
  c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k)
  c.getContext('2d')!.drawImage(bm, 0, 0, c.width, c.height); bm.close?.()
  const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/jpeg', 0.9))
  return { id: uid(), url: URL.createObjectURL(blob), iw: c.width, ih: c.height }
}
export const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })

// Frame PNG có lỗ trong suốt -> tự tìm các lỗ, mỗi lỗ thành một ô ảnh nằm dưới frame (ảnh to hơn lỗ một chút cũng không lộ viền)
export function findHoles(img: HTMLImageElement, W: number, H: number): Slot[] {
  const gw = 240, gh = Math.max(1, Math.round(gw * img.naturalHeight / img.naturalWidth))
  const c = document.createElement('canvas'); c.width = gw; c.height = gh
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0, gw, gh)
  const d = g.getImageData(0, 0, gw, gh).data, seen = new Uint8Array(gw * gh), out: Slot[] = []
  const hole = (i: number) => d[i * 4 + 3] < 40
  for (let s = 0; s < gw * gh; s++) {
    if (seen[s] || !hole(s)) continue
    let n = 0, x0 = gw, y0 = gh, x1 = 0, y1 = 0; const st = [s]; seen[s] = 1
    while (st.length) {
      const p = st.pop()!, x = p % gw, y = (p / gw) | 0; n++
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      for (const q of [p - 1, p + 1, p - gw, p + gw]) {
        if (q < 0 || q >= gw * gh || seen[q] || !hole(q)) continue
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === gw - 1)) continue
        seen[q] = 1; st.push(q)
      }
    }
    if (n < gw * gh * 0.015 || n > gw * gh * 0.6) continue
    const k = W / gw, e = 2 * k
    out.push({ x: x0 * k - e, y: y0 * k - e, w: (x1 - x0 + 1) * k + 2 * e, h: (y1 - y0 + 1) * k + 2 * e })
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x)
}

const rr = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)) }
// ph = true: ô ảnh còn trống được vẽ thành ô trắng mờ có chữ "＋ ảnh" (dùng làm ảnh xem trước của mẫu)
export async function render(W: number, H: number, bg: string, bgImg: string | null, overlay: string | null, items: Item[], px = 1200, ph = false) {
  await document.fonts?.ready
  const k = px / W, cv = document.createElement('canvas'); cv.width = px; cv.height = Math.round(H * k)
  const c = cv.getContext('2d')!; c.scale(k, k); c.fillStyle = bg; c.fillRect(0, 0, W, H)
  if (bgImg) c.drawImage(await loadImg(bgImg), 0, 0, W, H)
  const draw = async (it: Item) => {
    c.save(); c.translate(it.x, it.y); c.rotate(it.r * Math.PI / 180)
    if (it.k === 'photo') {
      const f = fit(it), card = f.bd > 0 || f.bb > 0
      if (card) { c.shadowColor = 'rgba(74,29,53,.25)'; c.shadowBlur = 18; c.shadowOffsetY = 6; c.fillStyle = '#fff'; rr(c, -it.w / 2, -it.h / 2, it.w, it.h, it.rd ?? 0); c.fill(); c.shadowColor = 'transparent' }
      const ax = -it.w / 2 + f.bd, ay = -it.h / 2 + f.bd
      if (!it.src) { c.fillStyle = 'rgba(255,255,255,.62)'; rr(c, ax, ay, f.aw, f.ah, card ? 0 : it.rd ?? 0); c.fill(); c.fillStyle = 'rgba(74,29,53,.42)'; c.font = `700 ${Math.max(14, Math.min(f.aw, f.ah) * 0.16)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('＋ ảnh', ax + f.aw / 2, ay + f.ah / 2) }
      if (it.src) { c.save(); rr(c, ax, ay, f.aw, f.ah, card ? 0 : it.rd ?? 0); c.clip(); c.drawImage(await loadImg(it.src), ax + f.aw / 2 - f.dw / 2 + f.ox, ay + f.ah / 2 - f.dh / 2 + f.oy, f.dw, f.dh); c.restore() }
    } else if (it.k === 'sticker' && it.src) c.drawImage(await loadImg(it.src), -it.w / 2, -it.h / 2, it.w, it.h)
    else if (it.k === 'text') { c.font = `700 ${it.fs}px ${FONT}`; c.fillStyle = it.color || '#4A1D35'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(it.text || '', 0, 0) }
    c.restore()
  }
  for (const it of items.filter(i => i.k === 'photo' && (i.src || ph))) await draw(it)
  if (overlay) c.drawImage(await loadImg(overlay), 0, 0, W, H)
  for (const it of items.filter(i => i.k !== 'photo')) await draw(it)
  return new Promise<Blob>(r => cv.toBlob(b => r(b!), 'image/png'))
}

// ---------- Mẫu đã lưu (phase26): bố cục không có ảnh, chỉ cần chèn ảnh ----------
// overlay/bgImg: '/...' là tệp có sẵn trong app; còn lại là đường dẫn trong bucket `pbooth`
export type Tpl = { v: 1; frame: Frame; bg: string; bgImg: string | null; overlay: string | null; items: Item[] }
export const toTpl = (frame: Frame, bg: string, bgImg: string | null, overlay: string | null, items: Item[]): Tpl => ({
  v: 1, frame, bg, bgImg, overlay,
  items: items.map(i => i.k === 'photo' ? { ...i, src: undefined, iw: undefined, ih: undefined, z: 1, ox: 0, oy: 0 } : i),
})
