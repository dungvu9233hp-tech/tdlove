'use client'
import { useEffect, useState } from 'react'
import type { GameProps } from '@/lib/games/types'
import { baiCaoLabel, baiCaoPts } from '@/lib/games/cards'
import { PCard, Scores } from './ui'

export default function BaiCao({ g, me, partnerId, pn, secret, act, busy }: GameProps) {
  const st = g.state, round: number = st.round
  const playing = g.status === 'playing'
  const show = st.phase === 'show' || g.status === 'done'
  const myCards: number[] = secret?.cards ?? []
  const [peek, setPeek] = useState<boolean[]>([false, false, false])
  useEffect(() => { setPeek([false, false, false]) }, [round])
  const iRevealed = !!st.revealed?.[me], theyRevealed = !!st.revealed?.[partnerId]
  const last = st.last

  return <>
    <div className="gm-sub">Ba lá bài, cộng điểm rồi lấy số hàng đơn vị (10, J, Q, K tính 0). Ba lá J/Q/K là “ba cào”, lớn nhất. Bằng nhau thì hòa. Vòng {round}/{st.rounds}.</div>
    <Scores items={[{ name: 'Bạn', n: st.scores?.[me] ?? 0 }, { name: pn, n: st.scores?.[partnerId] ?? 0 }]} />

    {show && last ? <>
      {[[pn, partnerId], ['Bạn', me]].map(([name, id]) => {
        const cards: number[] = last.hands[id]
        return <div key={id} className={`k ${last.winner === id ? 'pe' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b style={{ fontSize: 16 }}>{name}: {baiCaoLabel(last.pts[id])} {last.winner === id ? '🏆' : ''}</b>
          <div className="gm-hand">{cards.map((c, i) => <PCard key={i} c={c} />)}</div>
        </div>
      })}
      <div className="k li"><b>{last.winner === me ? 'Bạn thắng vòng này 🎉' : last.winner ? `${pn} thắng vòng này` : 'Vòng này hòa'}</b></div>
      {playing && <button className="btn" disabled={busy} onClick={() => act('bc_next')}>Chia bài vòng tiếp</button>}
    </> : <>
      <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b style={{ fontSize: 16 }}>Bài của {pn}</b>
        <div className="gm-hand">{[0, 1, 2].map(i => <PCard key={i} down />)}</div>
        <div className="gm-sub">{theyRevealed ? `${pn} đã lật bài` : `${pn} chưa lật bài`}</div>
      </div>
      <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b style={{ fontSize: 16 }}>Bài của bạn {peek.every(Boolean) && myCards.length === 3 ? `· ${baiCaoLabel(baiCaoPts(myCards))}` : ''}</b>
        <div className="gm-hand">{[0, 1, 2].map(i => <PCard key={i} c={peek[i] ? myCards[i] : undefined} down={!peek[i] || myCards[i] === undefined}
          onClick={myCards[i] === undefined ? undefined : () => setPeek(p => p.map((x, k) => k === i ? !x : x))} label="Chạm để xem lá bài" />)}</div>
        <div className="gm-sub">Chạm từng lá để xem riêng. Chỉ khi bấm “Lật bài” thì bài mới được công bố.</div>
        {iRevealed ? <div className="gm-sub" role="status">Bạn đã lật bài, chờ {pn}…</div>
          : <button className="btn" disabled={busy || !playing} onClick={() => act('bc_reveal')}>Lật bài</button>}
      </div>
    </>}
  </>
}
