'use client'
import { useMemo, useState } from 'react'
import type { GameProps } from '@/lib/games/types'
import { rnd } from '@/lib/games/content'

type Ship = { len: number; r: number; c: number; d: 'h' | 'v' }
type Placed = Ship & { idx: number }
const SIZE = 10
const key = (r: number, c: number) => `${r},${c}`
const cellsOf = (s: Ship) => Array.from({ length: s.len }, (_, k) => [s.r + (s.d === 'v' ? k : 0), s.c + (s.d === 'h' ? k : 0)] as [number, number])
const fits = (s: Ship, others: Placed[]) => {
  const occ = new Set(others.flatMap(o => cellsOf(o).map(([r, c]) => key(r, c))))
  return cellsOf(s).every(([r, c]) => r >= 0 && r < SIZE && c >= 0 && c < SIZE && !occ.has(key(r, c)))
}
const NAMES: Record<number, string> = { 5: 'Tàu sân bay', 4: 'Tàu chiến', 3: 'Tàu ngầm', 2: 'Tàu tí hon' }

function Sea({ cell }: { cell: (r: number, c: number) => { cls?: string; text?: string; label: string; click?: () => void; off?: boolean } }) {
  return <div className="gm-sea" style={{ ['--n' as any]: SIZE }} role="grid">
    {Array.from({ length: SIZE * SIZE }, (_, i) => {
      const r = Math.floor(i / SIZE), c = i % SIZE, x = cell(r, c)
      return <button key={i} type="button" className={`gm-w ${x.cls ?? ''}`} disabled={x.off || !x.click} onClick={x.click} aria-label={x.label}>{x.text}</button>
    })}
  </div>
}

export default function PhaThuyen({ g, me, partnerId, pn, mine, secret, act, busy }: GameProps) {
  const st = g.state
  const fleet: number[] = st.fleet
  const playing = g.status === 'playing'
  const [placed, setPlaced] = useState<Placed[]>([])
  const [dir, setDir] = useState<'h' | 'v'>('h')
  const [hover, setHover] = useState<[number, number] | null>(null)
  const nextIdx = fleet.findIndex((_, i) => !placed.some(p => p.idx === i))

  const place = (r: number, c: number) => {
    const at = placed.find(p => cellsOf(p).some(([a, b]) => a === r && b === c))
    if (at) return setPlaced(placed.filter(p => p !== at))                 // chạm vào tàu đã đặt thì nhấc ra để đặt lại
    if (nextIdx < 0) return
    const s: Ship = { len: fleet[nextIdx], r, c, d: dir }
    if (fits(s, placed)) setPlaced([...placed, { ...s, idx: nextIdx }])
  }
  const randomize = () => {
    const out: Placed[] = []
    fleet.forEach((len, idx) => {
      for (let t = 0; t < 500; t++) {
        const s: Ship = { len, r: rnd(SIZE), c: rnd(SIZE), d: rnd(2) ? 'h' : 'v' }
        if (fits(s, out)) { out.push({ ...s, idx }); return }
      }
    })
    setPlaced(out)
  }
  const preview = useMemo(() => {
    if (!hover || nextIdx < 0) return null
    const s: Ship = { len: fleet[nextIdx], r: hover[0], c: hover[1], d: dir }
    return { cells: new Set(cellsOf(s).map(([r, c]) => key(r, c))), ok: fits(s, placed) }
  }, [hover, nextIdx, dir, placed, fleet])

  // ---------- Xếp tàu ----------
  if (st.phase === 'setup') {
    if (st.ready?.[me]) return <div className="k li"><b>Đội tàu của bạn đã sẵn sàng</b><div className="gm-sub">Đang chờ {pn} xếp tàu xong…</div></div>
    const shipCells = new Map<string, number>(placed.flatMap(p => cellsOf(p).map(([r, c]) => [key(r, c), p.idx] as [string, number])))
    return <>
      <div className="gm-sub">Xếp đội tàu của bạn lên bàn. {pn} sẽ không nhìn thấy chúng. Chạm vào một ô để đặt tàu, chạm lại vào tàu đã đặt để nhấc ra.</div>
      <div className="gm-row">
        {fleet.map((len, i) => <span key={i} className={`pill ${placed.some(p => p.idx === i) ? 'on' : i === nextIdx ? 'on' : ''}`} style={{ opacity: placed.some(p => p.idx === i) ? .55 : 1 }}>
          {NAMES[len] ?? 'Tàu'} ({len}){placed.some(p => p.idx === i) ? ' ✓' : ''}</span>)}
      </div>
      <div onMouseLeave={() => setHover(null)}>
        <Sea cell={(r, c) => {
          const k = key(r, c), inPrev = preview?.cells.has(k)
          return { cls: shipCells.has(k) ? 'ship' : inPrev ? (preview!.ok ? 'prev' : 'bad') : '', label: `Hàng ${r + 1}, cột ${c + 1}${shipCells.has(k) ? ', có tàu' : ''}`, click: () => place(r, c) }
        }} />
      </div>
      <div className="gm-row">
        <button className="pill" onClick={() => setDir(dir === 'h' ? 'v' : 'h')}>Hướng: {dir === 'h' ? 'ngang ↔' : 'dọc ↕'}</button>
        <button className="pill" onClick={randomize}>🎲 Xếp ngẫu nhiên</button>
        <button className="pill" onClick={() => setPlaced([])} disabled={!placed.length}>Làm lại</button>
      </div>
      <button className="btn" disabled={busy || placed.length !== fleet.length}
        onClick={() => act('pt_place', { p_ships: placed.map(({ len, r, c, d }) => ({ len, r, c, d })) })}>Sẵn sàng</button>
    </>
  }

  // ---------- Đang đánh / đã xong ----------
  const myShots: any[] = st.shots?.[me] ?? [], theirShots: any[] = st.shots?.[partnerId] ?? []
  const shotAt = (arr: any[], r: number, c: number) => arr.find(s => s.r === r && s.c === c)
  const sunkEnemy: any[] = st.sunk?.[partnerId] ?? [], sunkMine: any[] = st.sunk?.[me] ?? []
  const sunkCells = new Set<string>(sunkEnemy.flatMap(s => s.cells.map(([r, c]: number[]) => key(r, c))))
  const myShips: any[] = secret?.ships ?? st.reveal?.[me] ?? []
  const myShipCells = new Set<string>(myShips.flatMap(s => s.cells.map(([r, c]: number[]) => key(r, c))))
  const enemyReveal = new Set<string>((st.reveal?.[partnerId] ?? []).flatMap((s: any) => s.cells.map(([r, c]: number[]) => key(r, c))))
  const hits = (a: any[]) => a.filter(s => s.h).length

  return <>
    <div className="gm-row gm-sub"><span>Tàu {pn} đã chìm: <b style={{ display: 'inline' }}>{sunkEnemy.length}/{fleet.length}</b></span><span>Tàu của bạn đã chìm: <b style={{ display: 'inline' }}>{sunkMine.length}/{fleet.length}</b></span></div>
    <div><div className="gm-sub" style={{ marginBottom: 6 }}>Biển của {pn} {playing && mine ? '· chạm một ô để bắn' : ''}</div>
      <Sea cell={(r, c) => {
        const s = shotAt(myShots, r, c), k = key(r, c)
        return {
          cls: s ? (sunkCells.has(k) ? 'sunk' : s.h ? 'hit' : 'miss') : enemyReveal.has(k) ? 'ship' : '', text: s ? (s.h ? '✕' : '•') : '',
          label: `Hàng ${r + 1}, cột ${c + 1}${s ? (s.h ? ', trúng' : ', trượt') : ''}`,
          click: () => act('pt_fire', { p_r: r, p_c: c }), off: !playing || !mine || busy || !!s,
        }
      }} /></div>
    <div><div className="gm-sub" style={{ marginBottom: 6 }}>Biển của bạn ({hits(theirShots)} lần {pn} bắn trúng)</div>
      <Sea cell={(r, c) => {
        const s = shotAt(theirShots, r, c), k = key(r, c), has = myShipCells.has(k)
        return { cls: s ? (s.h ? 'hit' : 'miss') : has ? 'ship' : '', text: s ? (s.h ? '✕' : '•') : '', label: `Hàng ${r + 1}, cột ${c + 1}${has ? ', tàu của bạn' : ''}${s ? (s.h ? ', bị bắn trúng' : ', bị bắn trượt') : ''}`, off: true }
      }} /></div>
  </>
}
