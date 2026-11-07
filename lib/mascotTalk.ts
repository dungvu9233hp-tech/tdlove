// Lời của linh vật: lúc nhắc việc, lúc hỏi han. Hàm thuần, không đụng DOM, dễ sửa câu chữ.
export type Chip = { label: string; reply?: string; href?: string }
export type Say = { id: string; text: string; chips?: Chip[]; href?: string; hrefLabel?: string; w: number }
export type TalkCtx = {
  hour: number; name: string; partner: string; days: number | null
  unread: number; capsuleReady: number; clips: number; games: number
  next: { t: string; n: number } | null
  plan: { id: string; name: string } | null
  memo: { href: string; title: string; year: string } | null
  hasPartner: boolean
}

// Việc đang chờ: ưu tiên cao, nói trước
export function urgent(c: TalkCtx): Say[] {
  const o: Say[] = []
  if (c.unread > 0) o.push({ id: 'unread', w: 5, text: `${c.partner} nhắn ${c.unread} tin mà ${c.name} chưa đọc kìa, gâu!`, href: '/chat', hrefLabel: 'Đọc ngay' })
  if (c.capsuleReady > 0) o.push({ id: 'capsule', w: 4, text: `Có ${c.capsuleReady} hộp thời gian mở được rồi đó, tò mò ghê!`, href: '/capsule', hrefLabel: 'Mở hộp' })
  if (c.clips > 0) o.push({ id: 'clips', w: 3, text: `${c.partner} gửi ${c.clips} clip mới, xem cùng Shiba nha?`, href: '/fun', hrefLabel: 'Xem clip' })
  if (c.games > 0) o.push({ id: 'games', w: 3, text: `Có ${c.games} ván đang đợi ${c.name} ra nước đi đó, ${c.partner} sốt ruột rồi!`, href: '/games', hrefLabel: 'Vào chơi' })
  if (c.next && c.next.n === 0) o.push({ id: 'today', w: 6, text: `Hôm nay là ${c.next.t} đó! Chúc mừng hai bạn, gâu gâu!`, href: '/special', hrefLabel: 'Xem' })
  else if (c.next && c.next.n <= 7) o.push({ id: 'soon', w: 4, text: `Còn ${c.next.n} ngày nữa là ${c.next.t}. Đã chuẩn bị gì chưa nè?`, href: '/special', hrefLabel: 'Xem' })
  if (c.plan) o.push({ id: 'plan', w: 2, text: `Chuyến "${c.plan.name}" sắp tới rồi, nhớ kiểm tra kế hoạch nhé!`, href: `/plan/${c.plan.id}`, hrefLabel: 'Mở kế hoạch' })
  if (c.memo) o.push({ id: 'memo', w: 3, text: `Ngày này năm ${c.memo.year} hai bạn có "${c.memo.title}". Xem lại không?`, href: c.memo.href, hrefLabel: 'Xem lại' })
  return o
}

// Nhắc theo giờ trong ngày + hỏi han chung chung
export function casual(c: TalkCtx): Say[] {
  const h = c.hour, o: Say[] = []
  if (h >= 5 && h < 10) o.push({ id: 'morning', w: 3, text: `Chào buổi sáng ${c.name}! Hôm nay ăn sáng chưa nè?`, chips: [{ label: 'Rồi nè', reply: 'Giỏi quá! Ăn no mới có sức yêu thương, gâu!' }, { label: 'Chưa', reply: 'Đi ăn ngay đi, Shiba mà đói là Shiba giận đó!' }] })
  if (h >= 11 && h < 14) o.push({ id: 'lunch', w: 3, text: 'Trưa rồi, ăn cơm chưa nè? Đừng bỏ bữa nha.', chips: [{ label: 'Ăn rồi', reply: 'Ngoan quá, cho xoa đầu một cái!' }, { label: 'Sắp ăn', reply: 'Nhớ ăn đủ chất nha, Shiba trông chừng đó.' }] })
  if (h >= 14 && h < 18) o.push({ id: 'water', w: 3, text: 'Uống nước chưa? Uống một ly rồi quay lại đây nhé, gâu!' })
  if (h >= 18 && h < 21) o.push({ id: 'dinner', w: 3, text: 'Chiều tối rồi, hôm nay ăn gì ngon không? Kể Shiba nghe với.' })
  if (h >= 21 || h < 1) o.push({ id: 'sleepy', w: 3, text: 'Khuya rồi nha, đi ngủ sớm đi, mai còn nhiều chuyện vui đang chờ!' })
  if (h >= 1 && h < 5) o.push({ id: 'late', w: 5, text: `Giờ này mà ${c.name} còn thức hả? Nằm xuống ngủ đi, Shiba buồn ngủ lắm rồi...` })
  o.push({ id: 'mood', w: 2, text: `Hôm nay ${c.name} thấy thế nào?`, chips: [
    { label: 'Vui lắm', reply: c.hasPartner ? `Tuyệt vời! Kể ${c.partner} nghe niềm vui này đi.` : 'Tuyệt vời! Shiba vui lây luôn, gâu!', href: c.hasPartner ? '/chat' : undefined },
    { label: 'Hơi mệt', reply: 'Nghỉ một chút nhé, uống miếng nước, hít thở thật sâu. Shiba ngồi đây với bạn.' },
    { label: 'Buồn buồn', reply: c.hasPartner ? `Ôm một cái nè. Nhắn cho ${c.partner} một câu nhé, có người thương luôn muốn nghe mà.` : 'Ôm một cái nè. Có Shiba ở đây rồi.', href: c.hasPartner ? '/chat' : undefined },
  ] })
  if (c.hasPartner) {
    o.push({ id: 'miss', w: 2, text: `Có nhớ ${c.partner} không? Nhắn một câu cho người ta vui đi!`, href: '/chat', hrefLabel: 'Nhắn tin' })
    o.push({ id: 'pmood', w: 2, text: `Hôm nay ${c.partner} có mệt không nhỉ? Hỏi thăm một câu là người ta ấm lòng liền.`, href: '/chat', hrefLabel: 'Hỏi thăm' })
    o.push({ id: 'moment', w: 1, text: 'Hôm nay có gì đẹp đáng nhớ không? Lưu thành một khoảnh khắc đi!', href: '/moments', hrefLabel: 'Lưu khoảnh khắc' })
    o.push({ id: 'diary', w: 1, text: `Viết vài dòng nhật ký cho ${c.partner} đọc nhé?`, href: '/diary', hrefLabel: 'Viết nhật ký' })
    if (c.days) o.push({ id: 'days', w: 1, text: `Hai bạn bên nhau ${c.days} ngày rồi đó! Shiba thấy may mắn ghê.` })
  }
  o.push({ id: 'posture', w: 1, text: 'Ngồi thẳng lưng lên nào, vươn vai một cái cho đỡ mỏi, gâu!' })
  o.push({ id: 'eyes', w: 1, text: 'Nhìn màn hình lâu rồi đó, nhìn ra xa một chút cho đỡ mỏi mắt nha.' })
  return o
}

export const POKE = ['Gâu gâu! Nhột nhột!', 'Hihi, xoa nữa đi!', 'Shiba thương bạn nhất!', 'Gâu! Bạn gọi Shiba hả?', 'Cho Shiba một cái ôm nha!', 'Vẫy đuôi tít luôn nè!']

export function pick(list: Say[], skip?: string): Say | null {
  const l = list.filter(s => s.id !== skip); if (!l.length) return null
  let r = Math.random() * l.reduce((a, s) => a + s.w, 0)
  for (const s of l) { r -= s.w; if (r <= 0) return s }
  return l[l.length - 1]
}
