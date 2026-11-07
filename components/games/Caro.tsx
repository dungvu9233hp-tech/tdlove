'use client'
import type { GameProps } from '@/lib/games/types'

export default function Caro({ g, me, pn, mine, act, busy }: GameProps) {
  const st = g.state, n: number = st.size, board: string = st.board
  const last = st.last as [number, number] | null
  const win = new Set<number>((st.win ?? []).map((c: number[]) => c[0] * n + c[1]))
  const mark = me === g.p1 ? '✕' : '○'
  const playing = g.status === 'playing'
  return <>
    <div className="gm-row gm-sub"><span>Bạn là <b style={{ display: 'inline' }}>{mark}</b>, {pn} là <b style={{ display: 'inline' }}>{mark === '✕' ? '○' : '✕'}</b></span><span>Nối đủ 5 quân liền nhau để thắng</span></div>
    <div className="gm-board" style={{ ['--n' as any]: n }} role="grid" aria-label={`Bàn cờ caro ${n} nhân ${n}`}>
      {Array.from({ length: n * n }, (_, i) => {
        const v = board[i], r = Math.floor(i / n), c = i % n
        const cls = `gm-cell ${v === '1' ? 'x' : v === '2' ? 'o' : ''} ${last && last[0] === r && last[1] === c ? 'last' : ''} ${win.has(i) ? 'win' : ''}`
        return <button key={i} type="button" className={cls} disabled={!playing || !mine || busy || v !== '0'} onClick={() => act('caro_move', { p_r: r, p_c: c })}
          aria-label={`Hàng ${r + 1}, cột ${c + 1}${v === '1' ? ', quân ✕' : v === '2' ? ', quân ○' : ''}`}>{v === '1' ? '✕' : v === '2' ? '○' : ''}</button>
      })}
    </div>
  </>
}
