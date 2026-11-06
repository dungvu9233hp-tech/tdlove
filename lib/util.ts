export async function shrink(f: File): Promise<Blob> {
  const bmp = await createImageBitmap(f)
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = bmp.width * k; c.height = bmp.height * k
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise(ok => c.toBlob(b => ok(b!), 'image/jpeg', 0.8))
}
export const km = (a: any, b: any) => { const r = (x: number) => x * Math.PI / 180, d = r(b.lat - a.lat), e = r(b.lng - a.lng); return 12742 * Math.asin(Math.sqrt(Math.sin(d / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(e / 2) ** 2)) }
// Lấy tọa độ từ link Google Maps dạng dài (link rút gọn maps.app.goo.gl không đọc được)
export const coords = (u: string) => {
  const m = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || u.match(/[?&](?:q|ll|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/)
  return m ? { lat: +m[1], lng: +m[2] } : {}
}

export const safeUrl = (u?: string | null): string | undefined => {
  if (!u) return undefined
  const s = u.trim()
  const m = s.match(/https?:\/\/[^\s<>"']+/i)       // lấy link nằm trong đoạn văn bản được chia sẻ
  let c = m ? m[0] : s
  if (!m) {                                         // không có scheme: tự thêm https://
    if (/\s/.test(c) || (/^[a-z][a-z0-9+.-]*:/i.test(c) && !/^[^/]+\.[^/:]+/.test(c))) return undefined
    c = 'https://' + c.replace(/^\/\//, '')
  }
  try {
    const x = new URL(c)
    return (x.protocol === 'http:' || x.protocol === 'https:') && x.hostname.includes('.') ? x.href : undefined
  } catch { return undefined }
}
// Chạy một lệnh ghi của Supabase; lỗi thì báo cho người dùng thay vì im lặng, trả về true nếu thành công
export async function ok(q: PromiseLike<{ error: { message: string } | null }>, what = 'Không lưu được'): Promise<boolean> {
  const { error } = await q
  if (error) { alert(`${what}: ${error.message}`); return false }
  return true
}
// Số ngày bên nhau tính theo NGÀY LỊCH CỦA MÁY (không phụ thuộc UTC), ngày bắt đầu yêu là ngày 1
export const daysTogether = (start: string) => {
  const [y, m, d] = start.split('-').map(Number), t = new Date()
  return Math.round((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - Date.UTC(y, m - 1, d)) / 864e5) + 1
}

// Các mốc ngày bên nhau, dùng chung cho Trang chủ, Ngày đặc biệt và (bản sao trong Edge Function anniversary)
export const MILESTONES = [100, 200, 300, 365, 400, 500, 600, 700, 730, 800, 900, 1000, 1500, 2000]
// Ngày kỷ niệm tháng gần nhất (kể cả hôm nay). Bắt đầu yêu ngày 29-31 thì kẹp về ngày cuối tháng, không tràn sang tháng sau.
export const nextMonthAnniv = (start: string, now = new Date()): { date: Date; months: number } | null => {
  const [y, m, d] = start.split('-').map(Number)
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  for (let k = 0; k < 3; k++) {
    const mi = t.getMonth() + k
    const last = new Date(t.getFullYear(), mi + 1, 0).getDate()
    const date = new Date(t.getFullYear(), mi, Math.min(d, last))
    if (date >= t) {
      const months = (date.getFullYear() - y) * 12 + date.getMonth() - (m - 1)
      return months > 0 ? { date, months } : null
    }
  }
  return null
}
// Lần tới của một ngày lặp hằng năm; 29/02 ở năm không nhuận rơi vào 28/02
export const nextYearlyDate = (onDate: string, now = new Date()): Date => {
  const [, m, d] = onDate.split('-').map(Number)
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const at = (y: number) => new Date(y, m - 1, Math.min(d, new Date(y, m, 0).getDate()))
  let n = at(t.getFullYear()); if (n < t) n = at(t.getFullYear() + 1)
  return n
}
