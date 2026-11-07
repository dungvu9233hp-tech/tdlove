'use client'
import { useState } from 'react'
import type { GameProps } from '@/lib/games/types'

const okCode = (s: string, n: number) => s.length === n && /^\d+$/.test(s) && new Set(s).size === n

export default function SoBiMat({ g, me, partnerId, pn, mine, secret, act, busy }: GameProps) {
  const st = g.state, n: number = st.len
  const [v, setV] = useState(''); const [err, setErr] = useState('')
  const clean = (s: string) => s.replace(/\D/g, '').slice(0, n)
  const mySecret: string | undefined = secret?.code
  const mine_g: any[] = st.guesses?.[me] ?? [], their_g: any[] = st.guesses?.[partnerId] ?? []
  const row = (x: any, i: number) => <div key={i}><span>{x.g}</span><span>{x.b} đúng vị trí · {x.c} sai vị trí</span></div>

  async function submit(fn: 'sb_set' | 'sb_guess') {
    if (!okCode(v, n)) return setErr(`Nhập đúng ${n} chữ số, không trùng nhau`)
    setErr('')
    const r = await act(fn, fn === 'sb_set' ? { p_code: v } : { p_guess: v })
    if (r.ok) setV('')
  }
  const input = (label: string, fn: 'sb_set' | 'sb_guess', btn: string) => <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <b>{label}</b>
    <label className="k" style={{ padding: 0 }}><input className="gm-input" value={v} inputMode="numeric" autoComplete="off" maxLength={n} placeholder={'•'.repeat(n)} aria-label={label}
      onChange={e => { setV(clean(e.target.value)); setErr('') }} onKeyDown={e => e.key === 'Enter' && submit(fn)} /></label>
    {err && <div className="gm-err" role="alert">{err}</div>}
    <button className="btn" disabled={busy || v.length !== n} onClick={() => submit(fn)}>{btn}</button>
  </div>

  return <>
    <div className="gm-sub">Mỗi người nghĩ một số {n} chữ số, các chữ số khác nhau. “Đúng vị trí” là đúng số và đúng chỗ; “sai vị trí” là có số đó nhưng ở chỗ khác. Người đi trước đoán đúng thì người kia còn một lượt cuối.</div>
    {mySecret && <div className="k pe">Số bí mật của bạn: <b style={{ display: 'inline', letterSpacing: '.25em' }}>{mySecret}</b></div>}
    {st.phase === 'setup' && (st.ready?.[me]
      ? <div className="k li"><b>Đã chốt số của bạn</b><div className="gm-sub">Đang chờ {pn} chọn số.</div></div>
      : input(`Chọn số bí mật của bạn (${n} chữ số)`, 'sb_set', 'Chốt số'))}
    {st.phase === 'play' && g.status === 'playing' && mine && input(`Đoán số của ${pn}`, 'sb_guess', 'Đoán')}
    {st.phase === 'play' && g.status === 'playing' && !mine && <div className="k li"><div className="gm-sub">{pn} đang đoán…</div></div>}
    {st.reveal && <div className="k pe"><b>Hai số bí mật</b><div className="gm-sub">Của bạn: {st.reveal[me]} · Của {pn}: {st.reveal[partnerId]}</div></div>}
    {(mine_g.length > 0 || their_g.length > 0) && <div className="gm-cols">
      <div><div className="gm-sub" style={{ marginBottom: 6 }}>Bạn đoán ({mine_g.length})</div><div className="gm-hist">{[...mine_g].reverse().map(row)}</div></div>
      <div><div className="gm-sub" style={{ marginBottom: 6 }}>{pn} đoán ({their_g.length})</div><div className="gm-hist">{[...their_g].reverse().map(row)}</div></div>
    </div>}
  </>
}
