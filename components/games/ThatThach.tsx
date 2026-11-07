'use client'
import { useState } from 'react'
import type { GameProps } from '@/lib/games/types'
import { CARDS, LEVELS, rnd, type Card } from '@/lib/games/content'

export default function ThatThach({ g, me, pn, mine, act, busy }: GameProps) {
  const st = g.state
  const playing = g.status === 'playing'
  const [lvl, setLvl] = useState<1 | 2 | 3>(1)
  const [card, setCard] = useState<Card | null>(null)
  const [own, setOwn] = useState(''); const [ownType, setOwnType] = useState<'truth' | 'dare'>('truth')
  const draw = (t: 'truth' | 'dare') => {
    const pool = CARDS.filter(c => c.t === t && c.lvl === lvl && c.text !== card?.text)
    setCard(pool[rnd(pool.length)])
  }
  const log: any[] = st.log ?? []
  const label = (t: string) => t === 'truth' ? 'Thật' : 'Thách'
  const send = async (c: { t: string; text: string }) => { const r = await act('td_card', { p_card: c }); if (r.ok) { setCard(null); setOwn('') } }

  return <>
    <div className="gm-sub">Lần lượt ra đề cho nhau: người ra đề chọn “Thật” (một câu hỏi) hoặc “Thách” (một thử thách dễ thương). Làm xong thì đổi vai. Đã hoàn thành {st.count} thẻ.</div>

    {playing && st.phase === 'pick' && (mine
      ? <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>Đến lượt bạn ra đề cho {pn}</b>
        <div className="gm-chips" role="group" aria-label="Mức độ">{([1, 2, 3] as const).map(l => <button key={l} className={`pill ${lvl === l ? 'on' : ''}`} aria-pressed={lvl === l} onClick={() => { setLvl(l); setCard(null) }}>{LEVELS[l]}</button>)}</div>
        <div className="gm-row"><button className="btn" style={{ flex: 1 }} onClick={() => draw('truth')}>Thật 💬</button><button className="btn" style={{ flex: 1 }} onClick={() => draw('dare')}>Thách 🎯</button></div>
        {card && <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="gm-sub">{label(card.t)} · {LEVELS[card.lvl]}</div><div className="gm-big">{card.text}</div>
          <button className="btn" disabled={busy} onClick={() => send(card)}>Gửi cho {pn}</button>
          <button className="pill" onClick={() => draw(card.t)}>Đổi thẻ khác</button>
        </div>}
        <details><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Hoặc tự viết đề</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <div className="gm-chips">{(['truth', 'dare'] as const).map(t => <button key={t} className={`pill ${ownType === t ? 'on' : ''}`} onClick={() => setOwnType(t)}>{label(t)}</button>)}</div>
            <label className="k"><input value={own} maxLength={240} onChange={e => setOwn(e.target.value)} placeholder="Viết câu hỏi hoặc thử thách của bạn…" aria-label="Đề tự viết" /></label>
            <button className="btn" disabled={busy || !own.trim()} onClick={() => send({ t: ownType, text: own.trim() })}>Gửi đề này</button>
          </div></details>
      </div>
      : <div className="k li"><b>{pn} đang chọn đề cho bạn…</b></div>)}

    {playing && st.phase === 'card' && st.card && (st.target === me
      ? <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="gm-sub">{pn} ra đề cho bạn · {label(st.card.t)}</div><div className="gm-big">{st.card.text}</div>
        <button className="btn" disabled={busy} onClick={() => act('td_done', { p_skip: false })}>Xong rồi ✓</button>
        <button className="pill" disabled={busy} onClick={() => act('td_done', { p_skip: true })}>Bỏ qua thẻ này</button>
      </div>
      : <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><div className="gm-sub">Bạn đã gửi cho {pn} · {label(st.card.t)}</div><div className="gm-big">{st.card.text}</div><div className="gm-sub">Đang chờ {pn}…</div></div>)}

    {log.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="gm-sub">Gần đây</div>
      {log.map((l, i) => <div key={i} className="k"><div className="gm-sub">{l.who === me ? 'Bạn' : pn} · {label(l.t)} {l.skip ? '· đã bỏ qua' : '✓'}</div><div style={{ fontSize: 15 }}>{l.text}</div></div>)}
    </div>}
  </>
}
