'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameProps } from '@/lib/games/types'
import { WORDS, rnd, sample } from '@/lib/games/content'
import { Scores } from './ui'

type Stroke = { id: string; color: string; w: number; pts: [number, number][] }
const COLORS = ['#3B1A2B', '#C45379', '#E58AA8', '#B8925A', '#4A7FB0', '#4C9A6A', '#F2B84B']
const SIZES = [3, 7, 14]

export default function VeDoan({ g, me, partnerId, pn, secret, act, busy, ch }: GameProps) {
  const st = g.state, round: number = st.round
  const playing = g.status === 'playing'
  const iDraw = st.drawer === me
  const drawing = st.phase === 'draw' && playing
  const cv = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const cur = useRef<Stroke | null>(null)
  const queue = useRef<[number, number][]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [color, setColor] = useState(COLORS[0]); const [size, setSize] = useState(SIZES[1])
  const [guess, setGuess] = useState(''); const [fb, setFb] = useState('')
  const [custom, setCustom] = useState(''); const [seed, setSeed] = useState(0)
  const suggestions = useMemo(() => sample(WORDS, 3), [round, seed])    // eslint-disable-line react-hooks/exhaustive-deps

  const render = useCallback(() => {
    const c = cv.current; if (!c) return
    const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr) }
    const x = c.getContext('2d'); if (!x) return
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H); x.lineCap = 'round'; x.lineJoin = 'round'
    for (const s of strokes.current) {
      x.strokeStyle = s.color; x.lineWidth = s.w * W / 400; x.beginPath()
      s.pts.forEach(([px, py], i) => i ? x.lineTo(px * W, py * H) : x.moveTo(px * W, py * H))
      if (s.pts.length === 1) x.lineTo(s.pts[0][0] * W + 0.01, s.pts[0][1] * H)
      x.stroke()
    }
  }, [])

  useEffect(() => { strokes.current = []; render(); setFb(''); setGuess('') }, [round, render])
  useEffect(() => { const f = () => render(); window.addEventListener('resize', f); render(); return () => window.removeEventListener('resize', f) }, [render])

  // Nhận nét vẽ từ người kia
  useEffect(() => ch.listen((ev, p) => {
    if (ev === 'stroke' && p.round === round) {
      let s = strokes.current.find(x => x.id === p.id)
      if (!s) { s = { id: p.id, color: p.color, w: p.w, pts: [] }; strokes.current.push(s) }
      s.pts.push(...(p.pts as [number, number][])); render()
    } else if (ev === 'clear' && p.round === round) { strokes.current = []; render() }
    else if (ev === 'sync_req' && iDraw) ch.send('sync', { round, strokes: strokes.current })
    else if (ev === 'sync' && !iDraw && p.round === round) { strokes.current = p.strokes ?? []; render() }
  }), [ch, round, iDraw, render])
  // Người xem vào muộn hoặc vào lại thì xin vẽ lại từ đầu
  useEffect(() => {
    if (st.phase === 'pick') return
    const ask = () => { if (!iDraw) ch.send('sync_req', { round }) }
    const t1 = setTimeout(ask, 800), t2 = setTimeout(ask, 3000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [round, st.phase, iDraw, ch])
  useEffect(() => { if (ch.partnerHere) { if (iDraw) ch.send('sync', { round, strokes: strokes.current }); else ch.send('sync_req', { round }) } }, [ch.partnerHere])  // eslint-disable-line react-hooks/exhaustive-deps

  const flush = () => {
    timer.current = null
    if (!cur.current || !queue.current.length) return
    ch.send('stroke', { round, id: cur.current.id, color: cur.current.color, w: cur.current.w, pts: queue.current })
    queue.current = []
  }
  const pos = (e: React.PointerEvent): [number, number] => {
    const r = cv.current!.getBoundingClientRect()
    return [Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000]
  }
  const down = (e: React.PointerEvent) => {
    if (!iDraw || !drawing) return
    cv.current!.setPointerCapture(e.pointerId)
    const p = pos(e)
    cur.current = { id: `${Date.now().toString(36)}${rnd(1e6).toString(36)}`, color, w: size, pts: [p] }
    strokes.current.push(cur.current); queue.current = [p]; render(); flush()
  }
  const move = (e: React.PointerEvent) => {
    if (!cur.current) return
    const p = pos(e); cur.current.pts.push(p); queue.current.push(p); render()
    if (!timer.current) timer.current = setTimeout(flush, 60)
  }
  const up = () => { if (!cur.current) return; if (timer.current) clearTimeout(timer.current); flush(); cur.current = null }
  const clear = () => { strokes.current = []; render(); ch.send('clear', { round }) }
  const undo = () => { strokes.current = strokes.current.slice(0, -1); render(); ch.send('sync', { round, strokes: strokes.current }) }

  async function submit() {
    const t = guess.trim(); if (!t) return
    const r = await act('vd_guess', { p_text: t })
    if (r.ok) { setFb(r.data ? '' : 'Chưa đúng, thử lại nhé!'); setGuess('') }
  }
  const hint = (st.wl as number[] | null)?.map(n => Array.from({ length: n }, () => '＿').join(' ')).join('   ')

  return <>
    <Scores items={[{ name: 'Bạn', n: st.scores?.[me] ?? 0 }, { name: pn, n: st.scores?.[partnerId] ?? 0 }]} />
    <div className="gm-sub">Lượt {round}/{st.rounds}. Người vẽ không được viết chữ. Đoán đúng được 1 điểm; hai đứa thay nhau vẽ.</div>

    {st.phase === 'pick' && (iDraw
      ? <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>Chọn từ để vẽ cho {pn} đoán</b>
        <div className="gm-chips">{suggestions.map(w => <button key={w} className="pill on" disabled={busy} onClick={() => act('vd_set_word', { p_word: w })}>{w}</button>)}
          <button className="pill" onClick={() => setSeed(s => s + 1)}>🔄 Gợi ý khác</button></div>
        <div className="row"><label className="k"><input value={custom} maxLength={30} onChange={e => setCustom(e.target.value)} placeholder="Hoặc tự nghĩ một từ…" aria-label="Từ tự nghĩ" /></label>
          <button className="rb" disabled={busy || !custom.trim()} onClick={() => act('vd_set_word', { p_word: custom })}>Vẽ</button></div>
      </div>
      : <div className="k li"><b>{pn} đang chọn từ để vẽ…</b></div>)}

    {st.phase !== 'pick' && <>
      <canvas ref={cv} className="gm-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        role="img" aria-label={iDraw ? 'Khung vẽ của bạn' : `Hình ${pn} đang vẽ`} />
      {iDraw && st.phase === 'draw' && playing && <>
        <div className="k pk gm-big">Từ cần vẽ: <b style={{ display: 'inline' }}>{secret?.word}</b></div>
        <div className="gm-colors" role="group" aria-label="Màu bút">
          {COLORS.map(c => <button key={c} className={`gm-sw ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Màu ${c}`} />)}
          <button className={`gm-sw ${color === '#FFFFFF' ? 'on' : ''}`} style={{ background: '#fff' }} onClick={() => setColor('#FFFFFF')} aria-label="Cục tẩy">🧽</button>
        </div>
        <div className="gm-row">
          {SIZES.map(s => <button key={s} className={`pill ${size === s ? 'on' : ''}`} onClick={() => setSize(s)}>{s < 5 ? 'Nét mảnh' : s < 10 ? 'Vừa' : 'Dày'}</button>)}
          <button className="pill" onClick={undo}>↩ Hoàn tác</button><button className="pill" onClick={clear}>Xóa hết</button>
        </div>
      </>}
      {!iDraw && st.phase === 'draw' && playing && <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="gm-word" aria-label="Số chữ của từ cần đoán">{hint}</div>
        <div className="row"><label className="k"><input value={guess} onChange={e => { setGuess(e.target.value); setFb('') }} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Đoán xem…" aria-label="Đáp án của bạn" maxLength={40} autoComplete="off" /></label>
          <button className="rb" disabled={busy || !guess.trim()} onClick={submit}>Đoán</button></div>
        {fb && <div className="gm-sub" role="status">{fb}</div>}
        {(st.guesses as string[])?.length > 0 && <div className="gm-chips">{[...st.guesses].reverse().map((t: string, i: number) => <span key={i} className="pill" style={{ opacity: .7 }}>{t}</span>)}</div>}
      </div>}
      {iDraw && st.phase === 'draw' && (st.guesses as string[])?.length > 0 && <div className="gm-sub">{pn} đã đoán: {[...st.guesses].reverse().slice(0, 5).join(', ')}</div>}
      {st.phase === 'draw' && playing && <button className="btn ghost" disabled={busy} onClick={() => { if (confirm('Bỏ qua từ này và xem đáp án? Lượt này sẽ không ai được điểm.')) act('vd_giveup') }}>Bỏ qua từ này</button>}
      {st.phase === 'over' && st.last && <div className="k pe" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="gm-big">{st.last.ok ? (iDraw ? `${pn} đã đoán đúng! 🎉` : 'Bạn đoán đúng rồi! 🎉') : 'Hết lượt, chưa ai đoán được'}<br />Từ đó là: <b style={{ display: 'inline' }}>{st.last.word}</b></div>
        {playing && <button className="btn" disabled={busy} onClick={() => act('vd_next')}>{round >= st.rounds ? 'Xem kết quả' : 'Lượt tiếp theo (đổi người vẽ)'}</button>}
      </div>}
    </>}
  </>
}
