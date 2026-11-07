import { sb } from '@/lib/supabase'
import { KINDS, type Game, type GameKind } from './types'
import { pickQuestions } from './content'
import { notifyPartner } from '@/lib/push'

// Tùy chọn mặc định khi bắt đầu một ván mới
export function defaultOpts(kind: GameKind): Record<string, unknown> {
  if (kind === 'hieu_nhau') return { qs: pickQuestions(10) }
  return {}
}
// Chơi lại với cùng tùy chọn của ván vừa xong
export function replayOpts(g: Game): Record<string, unknown> {
  const s = g.state ?? {}
  switch (g.kind) {
    case 'caro': return { size: s.size }
    case 'so_bi_mat': return { len: s.len }
    case 'lat_bai': return { pairs: (s.n ?? 16) / 2, mode: s.mode }
    case 'bai_cao': case 'xi_dach': case 've_doan': return { rounds: s.rounds }
    case 'hieu_nhau': return { qs: pickQuestions(10) }
    default: return {}
  }
}
// Tạo ván mới; trả về id hoặc thông báo lỗi
export async function createGame(kind: GameKind, opts: Record<string, unknown> = {}): Promise<{ id?: string; error?: string }> {
  const r = await sb.rpc('game_create', { p_kind: kind, p_opts: opts })
  if (r.error) return { error: r.error.message }
  const id = String(r.data)
  notifyPartner('game', `Rủ bạn chơi ${KINDS[kind].name}, vào xem nhé!`, id)
  return { id }
}
