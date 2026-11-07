// Bộ bài 52 lá, mã hóa 0..51 giống máy chủ: hạng = số % 13 (0 = A, 1..8 = 2..9, 9 = 10, 10 = J, 11 = Q, 12 = K), chất = số / 13 (♠ ♣ ♦ ♥).
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
export const SUITS = ['♠', '♣', '♦', '♥']
export const rankOf = (c: number) => RANKS[c % 13]
export const suitOf = (c: number) => SUITS[Math.floor(c / 13)]
export const isRed = (c: number) => Math.floor(c / 13) >= 2
export const cardName = (c: number) => rankOf(c) + suitOf(c)

// Điểm bài cào để HIỂN THỊ (máy chủ mới là nơi quyết định thắng thua). 10 = ba cào (3 lá J/Q/K).
export function baiCaoPts(cards: number[]): number {
  if (cards.length === 3 && cards.every(c => c % 13 >= 10)) return 10
  return cards.reduce((s, c) => s + (c % 13 === 0 ? 1 : c % 13 >= 9 ? 10 : (c % 13) + 1), 0) % 10
}
export const baiCaoLabel = (p: number) => p === 10 ? 'Ba cào!' : p === 0 ? '0 nút (bù)' : `${p} nút`

export type XdEval = { n: number; pts: number; kind: 'xibang' | 'xidach' | 'nguli' | 'quac' | 'diem' }
// Giống _xd_eval trong phase24.sql
export function xdEval(cards: number[]): XdEval {
  const n = cards.length
  let base = 0, k = 0
  for (const c of cards) { const r = c % 13; if (r === 0) k++; else base += Math.min(r + 1, 10) }
  const opts = n <= 2 ? [1, 11] : n === 3 ? [1, 10, 11] : n === 4 ? [1, 10] : [1]
  let totals = [base]
  for (let i = 0; i < k; i++) totals = totals.flatMap(t => opts.map(d => t + d))
  const ok = totals.filter(t => t <= 21)
  const pts = ok.length ? Math.max(...ok) : Math.min(...totals)
  const kind: XdEval['kind'] = n === 2 && k === 2 ? 'xibang' : n === 2 && k === 1 && base === 10 ? 'xidach' : n === 5 && pts <= 21 ? 'nguli' : pts > 21 ? 'quac' : 'diem'
  return { n, pts, kind }
}
export const xdLabel = (e: XdEval) =>
  e.kind === 'xibang' ? 'Xì bàng!' : e.kind === 'xidach' ? 'Xì dách!' : e.kind === 'nguli' ? 'Ngũ linh!' : e.kind === 'quac' ? `Quắc (${e.pts})` : `${e.pts} điểm`
