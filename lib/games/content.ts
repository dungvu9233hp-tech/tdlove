// Nội dung tiếng Việt cho các game. Thêm/sửa tự do; không cần đổi gì ở máy chủ.
export type Question = { q: string; o: string[] }

export const QUESTIONS: Question[] = [
  { q: 'Bữa sáng bạn thích nhất?', o: ['Phở', 'Bánh mì', 'Xôi', 'Bún hoặc cháo'] },
  { q: 'Cuối tuần bạn thích làm gì nhất?', o: ['Nằm dài ở nhà', 'Đi cà phê', 'Ra ngoài trời', 'Ăn uống dạo phố'] },
  { q: 'Nơi nghỉ dưỡng mơ ước của bạn?', o: ['Biển', 'Núi', 'Thành phố nhộn nhịp', 'Làng quê yên tĩnh'] },
  { q: 'Bạn là người như thế nào?', o: ['Chim sớm', 'Cú đêm', 'Tùy ngày', 'Ngủ là chân ái'] },
  { q: 'Đồ uống yêu thích của bạn?', o: ['Cà phê', 'Trà sữa', 'Nước ép hoặc sinh tố', 'Trà hoặc nước lọc'] },
  { q: 'Thể loại phim bạn hay xem?', o: ['Tình cảm', 'Hành động', 'Kinh dị', 'Hài'] },
  { q: 'Khi buồn bạn thường làm gì?', o: ['Ngủ một giấc', 'Ăn thật nhiều', 'Nghe nhạc một mình', 'Kể cho ai đó nghe'] },
  { q: 'Món quà bạn thích nhận nhất?', o: ['Quà tự tay làm', 'Đồ dùng thiết thực', 'Một bữa ăn ngon', 'Lời nhắn thật dài'] },
  { q: 'Mùa bạn yêu thích?', o: ['Xuân', 'Hạ', 'Thu', 'Đông'] },
  { q: 'Đồ ăn vặt bạn khó từ chối nhất?', o: ['Đồ ngọt', 'Snack', 'Trái cây', 'Đồ chiên hoặc nướng'] },
  { q: 'Kỳ nghỉ mơ ước của bạn?', o: ['Đi nước ngoài', 'Phượt trong nước', 'Resort thư giãn', 'Ở nhà không làm gì'] },
  { q: 'Cách bạn thể hiện tình cảm nhiều nhất?', o: ['Lời nói', 'Chăm sóc bằng hành động', 'Tặng quà', 'Dành thời gian bên nhau', 'Ôm và chạm nhẹ'] },
  { q: 'Điều bạn sợ nhất trong số này?', o: ['Độ cao', 'Côn trùng, bò sát', 'Bóng tối, ma', 'Cô đơn'] },
  { q: 'Bữa tối lý tưởng của bạn?', o: ['Nhà hàng sang trọng', 'Quán vỉa hè', 'Tự nấu ở nhà', 'Lẩu hoặc nướng'] },
  { q: 'Việc đầu tiên bạn làm khi thức dậy?', o: ['Cầm điện thoại', 'Uống nước', 'Vệ sinh cá nhân', 'Nằm thêm một lát'] },
  { q: 'Buổi hẹn hò bạn thích nhất?', o: ['Xem phim', 'Dạo công viên, picnic', 'Chơi game, board game', 'Ăn uống cùng nhau'] },
  { q: 'Bạn thích thú cưng nào nhất?', o: ['Mèo', 'Chó', 'Cả hai', 'Không nuôi'] },
  { q: 'Bạn tự thấy mình?', o: ['Hướng nội', 'Hơi hướng nội', 'Hơi hướng ngoại', 'Hướng ngoại'] },
  { q: 'Điều làm bạn bực nhất?', o: ['Phải chờ đợi', 'Ồn ào', 'Bừa bộn', 'Bị đánh thức'] },
  { q: 'Siêu năng lực bạn muốn có?', o: ['Bay', 'Đọc suy nghĩ', 'Dừng thời gian', 'Dịch chuyển tức thời'] },
  { q: 'Trúng số bạn sẽ làm gì đầu tiên?', o: ['Du lịch vòng quanh', 'Mua nhà', 'Gửi tiết kiệm', 'Chia cho người thân'] },
  { q: 'Bạn ăn cay thế nào?', o: ['Không ăn được cay', 'Cay vừa', 'Cay nhiều', 'Càng cay càng thích'] },
  { q: 'Cách bạn xả stress?', o: ['Vận động', 'Xem phim, series', 'Đi mua sắm', 'Ăn món ngon'] },
  { q: 'Sau một ngày dài bạn cần gì nhất?', o: ['Một cái ôm', 'Yên tĩnh một mình', 'Bữa ăn ngon', 'Được trò chuyện'] },
  { q: 'Thời điểm trong ngày bạn thích nhất?', o: ['Sáng sớm', 'Buổi trưa', 'Chiều tà', 'Đêm khuya'] },
  { q: 'Loại nhạc bạn nghe nhiều nhất?', o: ['Nhạc trẻ Việt', 'Ballad', 'Nhạc nước ngoài', 'Nhạc không lời, lofi'] },
  { q: 'Khi đi chơi bạn là người?', o: ['Lên lịch trình chi tiết', 'Thích tùy hứng', 'Nhờ người khác lo', 'Chỉ cần được đi'] },
  { q: 'Phong cách ăn mặc của bạn?', o: ['Thoải mái', 'Lịch sự', 'Dễ thương', 'Cá tính'] },
  { q: 'Đi du lịch bạn thích ở đâu?', o: ['Khách sạn tiện nghi', 'Homestay', 'Lều trại', 'Nhà người quen'] },
  { q: 'Lời tỏ tình bạn thấy ấn tượng nhất?', o: ['Bất ngờ lãng mạn', 'Nhắn tin nhẹ nhàng', 'Nói thẳng trực tiếp', 'Thư tay'] },
  { q: 'Khoảnh khắc ngọt ngào nhất với bạn?', o: ['Cùng nấu ăn', 'Cùng đi dạo', 'Nắm tay', 'Nhắn tin trước khi ngủ'] },
  { q: 'Năm năm tới bạn mong điều gì nhất?', o: ['Sự nghiệp vững vàng', 'Một mái ấm', 'Đi được nhiều nơi', 'Bình yên giản dị'] },
  { q: 'Ngày mưa bạn thích làm gì?', o: ['Cà phê và đọc sách', 'Ngủ nướng', 'Ra ngoài tắm mưa', 'Xem phim ở nhà'] },
  { q: 'Điều bạn muốn người ấy làm nhiều hơn?', o: ['Nhắn tin', 'Gặp mặt', 'Ôm', 'Khen ngợi'] },
]

// Chọn ngẫu nhiên n câu không trùng, đảo thứ tự các lựa chọn không làm (giữ nguyên để dễ đọc)
export function pickQuestions(n: number): Question[] {
  const a = [...QUESTIONS]
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1);[a[i], a[j]] = [a[j], a[i]] }
  return a.slice(0, n)
}

// Số nguyên ngẫu nhiên đều trong [0, n), dùng bộ sinh số của trình duyệt (loại bỏ lệch modulo)
export function rnd(n: number): number {
  const lim = Math.floor(0x100000000 / n) * n, b = new Uint32Array(1)
  do { crypto.getRandomValues(b) } while (b[0] >= lim)
  return b[0] % n
}
export const sample = <T,>(a: T[], k: number): T[] => {
  const x = [...a], out: T[] = []
  while (out.length < k && x.length) out.push(x.splice(rnd(x.length), 1)[0])
  return out
}

export const WORDS = [
  'con mèo', 'con chó', 'ngôi nhà', 'cái cây', 'mặt trời', 'trái tim', 'bánh mì', 'ly trà sữa', 'xe đạp', 'máy bay', 'con cá', 'bông hoa',
  'cái ô', 'điện thoại', 'cầu vồng', 'con voi', 'nón lá', 'áo dài', 'đôi giày', 'ngôi sao', 'trăng khuyết', 'quả dưa hấu', 'con ếch', 'cây đàn',
  'chiếc thuyền', 'kem ốc quế', 'tô phở', 'hoa sen', 'con rồng', 'cái ghế', 'quạt máy', 'con gà', 'đèn lồng', 'ly cà phê', 'con bướm', 'xe máy',
  'đồng hồ', 'nhẫn cưới', 'hoa hồng', 'bó hoa', 'hộp quà', 'bánh sinh nhật', 'đôi dép', 'vali du lịch', 'lều trại', 'pháo hoa', 'bữa tối nến',
  'cặp đôi ôm nhau', 'gấu bông', 'con chim',
]

export type Card = { t: 'truth' | 'dare'; lvl: 1 | 2 | 3; text: string }
export const LEVELS: Record<number, string> = { 1: 'Nhẹ nhàng', 2: 'Thân mật', 3: 'Sâu sắc' }
export const CARDS: Card[] = [
  { t: 'truth', lvl: 1, text: 'Món ăn nào bạn thấy ngon nhất khi hai đứa cùng ăn?' },
  { t: 'truth', lvl: 1, text: 'Điều gì ở mình khiến bạn buồn cười nhất?' },
  { t: 'truth', lvl: 1, text: 'Bộ phim hay bài hát nào làm bạn nhớ đến mình?' },
  { t: 'truth', lvl: 1, text: 'Nếu cuối tuần này được đi đâu đó cùng nhau, bạn chọn đâu?' },
  { t: 'truth', lvl: 1, text: 'Thói quen nhỏ nào của mình bạn thấy dễ thương nhất?' },
  { t: 'truth', lvl: 1, text: 'Bạn đã từng giấu mình chuyện nhỏ nào chưa, kể thử nhé?' },
  { t: 'truth', lvl: 2, text: 'Lần đầu gặp mình, bạn đã nghĩ gì?' },
  { t: 'truth', lvl: 2, text: 'Khoảnh khắc nào bạn thấy mình thật sự rung động?' },
  { t: 'truth', lvl: 2, text: 'Có điều gì bạn muốn mình làm nhiều hơn mà chưa dám nói?' },
  { t: 'truth', lvl: 2, text: 'Kỷ niệm của hai đứa nào bạn muốn lặp lại nhất?' },
  { t: 'truth', lvl: 2, text: 'Bạn hình dung buổi hẹn hò hoàn hảo của hai đứa thế nào?' },
  { t: 'truth', lvl: 2, text: 'Lúc nào bạn thấy nhớ mình nhất trong ngày?' },
  { t: 'truth', lvl: 3, text: 'Điều gì ở hai đứa khiến bạn thấy biết ơn nhất?' },
  { t: 'truth', lvl: 3, text: 'Bạn mong hai đứa sẽ như thế nào sau năm năm nữa?' },
  { t: 'truth', lvl: 3, text: 'Có lúc nào bạn thấy chưa được mình hiểu đúng không?' },
  { t: 'truth', lvl: 3, text: 'Bạn muốn mình ủng hộ bạn nhiều hơn ở điều gì?' },
  { t: 'truth', lvl: 3, text: 'Điều bạn tự hào nhất về mối quan hệ của hai đứa?' },
  { t: 'truth', lvl: 3, text: 'Một nỗi lo nhỏ bạn chưa kể với mình là gì?' },
  { t: 'dare', lvl: 1, text: 'Làm mặt hề hoặc bắt chước giọng của một nhân vật hoạt hình.' },
  { t: 'dare', lvl: 1, text: 'Hát một câu bạn thích bằng giọng thật dễ thương.' },
  { t: 'dare', lvl: 1, text: 'Nhắn cho người ấy ba biệt danh mới để đặt cho nhau.' },
  { t: 'dare', lvl: 1, text: 'Kể một chuyện cười, người kia phải nhịn không được cười.' },
  { t: 'dare', lvl: 1, text: 'Nhảy một điệu ngẫu hứng mười giây.' },
  { t: 'dare', lvl: 1, text: 'Chụp một bức ảnh selfie thật ngố gửi cho người kia.' },
  { t: 'dare', lvl: 2, text: 'Viết một lời khen thật lòng dành cho người kia.' },
  { t: 'dare', lvl: 2, text: 'Gọi người kia bằng biệt danh ngọt ngào nhất suốt mười phút.' },
  { t: 'dare', lvl: 2, text: 'Kể lại buổi hẹn đầu tiên bằng đúng ba câu.' },
  { t: 'dare', lvl: 2, text: 'Ôm người kia thật chặt trong mười giây (hoặc gửi một cái ôm bằng lời nếu đang xa nhau).' },
  { t: 'dare', lvl: 2, text: 'Tặng người kia một lời hứa nhỏ cho tuần này.' },
  { t: 'dare', lvl: 2, text: 'Đọc to tin nhắn đầu tiên hai đứa từng nhắn nhau (nếu còn nhớ).' },
  { t: 'dare', lvl: 3, text: 'Nói ba điều bạn trân trọng ở người kia, mỗi điều một câu.' },
  { t: 'dare', lvl: 3, text: 'Viết một lá thư ngắn cho chính hai đứa của năm năm sau.' },
  { t: 'dare', lvl: 3, text: 'Xin lỗi về một chuyện nhỏ mà bạn vẫn còn áy náy.' },
  { t: 'dare', lvl: 3, text: 'Kể điều khiến bạn thấy được yêu thương nhất gần đây.' },
  { t: 'dare', lvl: 3, text: 'Cùng nhau đặt một mục tiêu nhỏ cho tháng tới.' },
  { t: 'dare', lvl: 3, text: 'Nói một điều bạn muốn cảm ơn người kia mà chưa từng nói.' },
]

export const VOUCHER_IDEAS = [
  'Massage vai 15 phút', 'Nấu bữa tối do người thắng chọn món', 'Rửa bát ba ngày liền', 'Người thắng chọn phim tối nay',
  'Một cái ôm thật lâu', 'Viết một lá thư tay', 'Đi ăn quán người thắng chọn', 'Làm theo một yêu cầu nhỏ trong một ngày',
  'Mua trà sữa mang đến tận nơi', 'Chụp cho nhau một bộ ảnh', 'Hát tặng một bài', 'Ngày hôm đó người thắng được quyết định mọi thứ',
]
