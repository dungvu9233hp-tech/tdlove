'use client'
import type { GameProps } from '@/lib/games/types'
import { Scores } from './ui'

export default function LatBai({ g, me, partnerId, pn, mine, act, busy }: GameProps) {
  const st = g.state, n: number = st.n, matched: Record<string, string> = st.matched ?? {}
  const up: { i: number; s: string }[] = st.up ?? []
  const upMap = new Map(up.map(u => [u.i, u.s]))
  const vs = st.mode === 'vs', playing = g.status === 'playing'
  const cols = n % 4 === 0 ? 4 : n % 3 === 0 ? 3 : 4
  const found = Object.keys(matched).length / 2
  return <>
    <div className="gm-sub">{vs ? 'Đối kháng: ai ghép được nhiều cặp hơn thì thắng. Ghép đúng được lật tiếp, lật hụt thì đổi lượt.' : 'Cùng đội: hai đứa thay nhau lật, cùng tìm hết các cặp với ít lượt nhất.'}</div>
    {vs ? <Scores items={[{ name: 'Bạn', n: st.scores?.[me] ?? 0 }, { name: pn, n: st.scores?.[partnerId] ?? 0 }]} />
      : <Scores items={[{ name: 'Đã ghép', n: `${found}/${n / 2}` }, { name: 'Số lượt', n: st.tries }]} />}
    <div className="gm-mem" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: n }, (_, i) => {
        const s = matched[i] ?? upMap.get(i), shown = s !== undefined
        return <button key={i} type="button" className={`gm-mc ${matched[i] ? 'ok' : upMap.has(i) ? 'up' : ''}`} disabled={!playing || !mine || busy || !!matched[i]}
          onClick={() => act('lb_flip', { p_i: i })} aria-label={shown ? `Ô ${i + 1}: ${s}` : `Ô ${i + 1}, đang úp`}>{shown ? s : ''}</button>
      })}
    </div>
    {up.length === 2 && playing && <div className="gm-sub" role="status">Hai ô vừa lật không giống nhau. Chúng sẽ úp lại ở lượt kế tiếp.</div>}
  </>
}
