'use client'
import type { GameProps } from '@/lib/games/types'
import { xdEval, xdLabel } from '@/lib/games/cards'
import { PCard, Scores } from './ui'

export default function XiDach({ g, me, partnerId, pn, secret, act, busy }: GameProps) {
  const st = g.state
  const playing = g.status === 'playing'
  const show = st.phase === 'show' || g.status === 'done'
  const last = st.last
  const iAmDealer = st.dealer === me
  const myTurn = playing && st.phase === 'play' && st.turn === me
  const myCards: number[] = secret?.cards ?? []
  const ev = myCards.length ? xdEval(myCards) : null
  const need = iAmDealer ? 15 : 16
  const canStand = !!ev && (ev.kind !== 'diem' || ev.pts >= need)
  const canHit = !!ev && myCards.length < 5 && ev.kind !== 'quac' && ev.kind !== 'nguli'
  const theirCount: number = st.counts?.[partnerId] ?? 2

  return <>
    <div className="gm-sub">Rút bài sao cho gần 21 điểm nhất mà không quắc. J, Q, K = 10; A tính 1, 10 hoặc 11 tùy số lá. Con dằn khi từ 16 điểm, cái dằn khi từ 15 điểm. Xì bàng &gt; xì dách &gt; ngũ linh &gt; điểm cao. Ván {st.round}/{st.rounds}.</div>
    <Scores items={[{ name: 'Bạn', n: st.scores?.[me] ?? 0, sub: iAmDealer ? 'Cái' : 'Con' }, { name: pn, n: st.scores?.[partnerId] ?? 0, sub: iAmDealer ? 'Con' : 'Cái' }]} />

    {show && last ? <>
      {[[pn, partnerId], ['Bạn', me]].map(([name, id]) => <div key={id} className={`k ${last.winner === id ? 'pe' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b style={{ fontSize: 16 }}>{name}: {xdLabel(last.ev[id])} {last.winner === id ? '🏆' : ''}</b>
        <div className="gm-hand">{last.hands[id].map((c: number, i: number) => <PCard key={i} c={c} />)}</div>
      </div>)}
      <div className="k li"><b>{last.winner === me ? 'Bạn thắng ván này 🎉' : last.winner ? `${pn} thắng ván này` : 'Ván này hòa'}</b></div>
      {playing && <button className="btn" disabled={busy} onClick={() => act('xd_next')}>Ván tiếp theo (đổi cái)</button>}
    </> : <>
      <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b style={{ fontSize: 16 }}>Bài của {pn} ({theirCount} lá) {st.stood?.[partnerId] ? '· đã dằn' : ''}</b>
        <div className="gm-hand">{Array.from({ length: theirCount }, (_, i) => <PCard key={i} down sm />)}</div>
      </div>
      <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b style={{ fontSize: 16 }}>Bài của bạn {ev ? `· ${xdLabel(ev)}` : ''} {st.stood?.[me] ? '· đã dằn' : ''}</b>
        <div className="gm-hand">{myCards.map((c, i) => <PCard key={i} c={c} />)}</div>
        {myTurn ? <div className="gm-row">
          <button className="btn" style={{ flex: 1 }} disabled={busy || !canHit} onClick={() => act('xd_hit')}>Rút thêm</button>
          <button className="btn ghost" style={{ flex: 1 }} disabled={busy || !canStand} onClick={() => act('xd_stand')}>Dằn</button>
        </div> : <div className="gm-sub" role="status">{st.stood?.[me] ? `Bạn đã dằn, chờ ${pn}…` : `Chờ ${pn}…`}</div>}
        {myTurn && !canStand && ev && <div className="gm-sub">Chưa đủ tuổi: cần từ {need} điểm mới được dằn.</div>}
      </div>
    </>}
  </>
}
