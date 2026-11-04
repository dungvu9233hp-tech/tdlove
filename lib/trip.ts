// Lịch sử hành trình (MAP-07): lọc điểm GPS, tính quãng đường, tải/ghi điểm
import { sb } from '@/lib/supabase'
import { km } from '@/lib/util'

export type Fix = { lat: number; lng: number; acc: number | null; t: number }   // t: mili giây
export type Pt = { id: string; trip_id: string; space_id: string; lat: number; lng: number; accuracy: number | null; recorded_at: string }

export const TRIP_CHANGED = 'tdlove-trip-changed', TRIP_STOP = 'tdlove-trip-stop'
export const MAX_POINTS = 6000          // đủ cho khoảng 8 tiếng đi liên tục; quá thì tự dừng để không phình dung lượng
export const STALE_MS = 2 * 3600e3      // app đóng quá 2 tiếng thì hành trình tự dừng, tránh ghi quên
const MIN_STEP_M = 15, MIN_GAP_MS = 5000, MAX_ACC_M = 80, MAX_SPEED = 70   // m, ms, m, m/s (252 km/h)

// Có nên lưu điểm mới không, và đi thêm bao nhiêu mét so với điểm đã lưu trước đó
export function accept(prev: Fix | null, f: Fix): { ok: boolean; d: number } {
  const no = { ok: false, d: 0 }
  if (f.acc != null && f.acc > MAX_ACC_M) return no                      // sai số quá lớn (thường là mới bật GPS)
  if (!prev) return { ok: true, d: 0 }
  const dt = f.t - prev.t; if (dt < MIN_GAP_MS) return no                // dày quá
  const d = km(prev, f) * 1000
  if (d < Math.max(MIN_STEP_M, (f.acc ?? 0) / 2)) return no              // chưa nhích ra khỏi vùng sai số: đứng yên thì không ghi thêm
  if (dt < 60000 && d / (dt / 1000) > MAX_SPEED) return no               // nhảy vọt vô lý trong thời gian ngắn: nhiễu GPS (tách khỏi trường hợp mất sóng lâu rồi xuất hiện ở xa)
  return { ok: true, d }
}

export const fmtKm = (m: number) => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`
export const fmtDur = (ms: number) => {
  const min = Math.floor(ms / 60000); if (min < 1) return 'dưới 1 phút'
  return min < 60 ? `${min} phút` : `${Math.floor(min / 60)} giờ ${min % 60 ? (min % 60) + ' phút' : ''}`.trim()
}
export const uid = () => (globalThis.crypto as any)?.randomUUID?.() ?? 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)

// Bắt đầu ghi một hành trình mới (mỗi người một hành trình đang ghi, do chỉ mục unique ở phase11.sql)
export async function startTrip(spaceId: string, name: string, planId: string | null) {
  const { data, error } = await sb.from('trips').insert({ space_id: spaceId, name, plan_id: planId }).select('*').single()
  if (error) throw new Error(error.code === '23505' ? 'Bạn đang ghi một hành trình rồi, hãy dừng nó trước' : error.message)
  window.dispatchEvent(new Event(TRIP_CHANGED))
  return data
}
// Tải toàn bộ điểm của một hành trình (Supabase trả tối đa 1000 dòng mỗi lần nên phải lấy từng trang)
export async function loadPoints(tripId: string): Promise<[number, number][]> {
  const out: [number, number][] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('location_history').select('lat,lng').eq('trip_id', tripId).order('recorded_at').range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []).map(r => [r.lat, r.lng] as [number, number]))
    if ((data?.length ?? 0) < 1000) return out
  }
}
