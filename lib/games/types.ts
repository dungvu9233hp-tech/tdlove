// Kiểu dữ liệu và thông tin chung của khu Trò chơi (supabase/phase24.sql).
export type GameKind = 'caro' | 'so_bi_mat' | 'hieu_nhau' | 'lat_bai' | 'pha_thuyen' | 'bai_cao' | 'xi_dach' | 've_doan' | 'that_thach'

export type Game = {
  id: string; space_id: string; kind: GameKind
  status: 'playing' | 'done' | 'abandoned'
  p1: string; p2: string
  waiting: string[]            // những người đang phải hành động (một người = đến lượt người đó)
  winner: string | null        // null + status done = hòa (hoặc game không phân thắng thua)
  state: any                   // phần công khai của ván, do máy chủ giữ
  version: number; reward_drawn: boolean
  created_at: string; updated_at: string
}

// Kết quả gọi hàm của máy chủ
export type ActResult = { ok: boolean; data?: any }
export type Act = (fn: string, args?: Record<string, unknown>) => Promise<ActResult>

// Mọi màn chơi nhận các prop này
export type GameProps = {
  g: Game; me: string; partnerId: string; pn: string
  mine: boolean                // đang đến lượt mình / cần mình hành động
  secret: any                  // phần bí mật của riêng mình (game_my_secret)
  act: Act; busy: boolean
  ch: GameChannel
}

export type GameChannel = {
  partnerHere: boolean         // người kia đang mở đúng ván này
  send: (ev: string, payload: Record<string, unknown>) => void
  listen: (h: (ev: string, p: any) => void) => () => void
}

export type KindInfo = { name: string; icon: string; blurb: string; players: string; group: 'board' | 'secret' | 'card' | 'bond' }

export const KINDS: Record<GameKind, KindInfo> = {
  caro: { name: 'Cờ caro', icon: '⭕', blurb: 'Nối đủ 5 quân liền nhau trước người kia.', players: 'Đối kháng', group: 'board' },
  so_bi_mat: { name: 'Số bí mật', icon: '🔢', blurb: 'Mỗi người nghĩ một dãy số, lần lượt đoán số của nhau.', players: 'Đối kháng', group: 'secret' },
  pha_thuyen: { name: 'Phá thuyền', icon: '🚢', blurb: 'Giấu đội tàu của mình, bắn đoán vị trí tàu người kia.', players: 'Đối kháng', group: 'secret' },
  lat_bai: { name: 'Lật bài trí nhớ', icon: '🃏', blurb: 'Lật tìm các cặp giống nhau, chơi đối kháng hoặc cùng đội.', players: 'Đối kháng hoặc cùng đội', group: 'card' },
  bai_cao: { name: 'Bài cào', icon: '🂡', blurb: 'Ba lá bài, tính nút, ba cào là lớn nhất.', players: 'Đối kháng', group: 'card' },
  xi_dach: { name: 'Xì dách', icon: '🂱', blurb: 'Rút bài sao cho gần 21 điểm mà không quắc. Cái và con đổi vai mỗi ván.', players: 'Đối kháng', group: 'card' },
  hieu_nhau: { name: 'Ai hiểu ai nhất', icon: '💞', blurb: 'Một người trả lời về mình, người kia đoán. Xem hai đứa hiểu nhau đến đâu.', players: 'Cùng vui', group: 'bond' },
  ve_doan: { name: 'Vẽ và đoán', icon: '🎨', blurb: 'Một người vẽ trực tiếp, người kia đoán từ khóa.', players: 'Đối kháng nhẹ', group: 'bond' },
  that_thach: { name: 'Thật hay thách', icon: '🎲', blurb: 'Rút thẻ câu hỏi hoặc thử thách dễ thương cho nhau.', players: 'Cùng vui', group: 'bond' },
}
export const KIND_ORDER: GameKind[] = ['caro', 'so_bi_mat', 'pha_thuyen', 'lat_bai', 'bai_cao', 'xi_dach', 'hieu_nhau', 've_doan', 'that_thach']

export type Voucher = {
  id: string; space_id: string; owner: string; title: string; status: 'pool' | 'won' | 'done'
  holder: string | null; game_id: string | null; created_at: string; won_at: string | null; done_at: string | null
}

// Dòng chữ trạng thái ngắn cho danh sách ván
export function statusText(g: Game, me: string, pn: string): string {
  if (g.status === 'abandoned') return 'Đã kết thúc'
  if (g.status === 'done') return g.winner === me ? 'Bạn thắng 🎉' : g.winner ? `${pn} thắng` : 'Hòa'
  if (g.waiting.includes(me)) return 'Đến lượt bạn'
  return `Chờ ${pn}`
}
