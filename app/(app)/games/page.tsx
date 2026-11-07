'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'
import { KINDS, KIND_ORDER, statusText, type Game, type GameKind } from '@/lib/games/types'
import { createGame, defaultOpts } from '@/lib/games/api'

type Choice = { v: string | number; l: string }
type OptDef = { key: string; label: string; choices: Choice[]; def: string | number }
// Tùy chọn khi bắt đầu từng game (khớp game_create trong phase24.sql)
const OPTS: Partial<Record<GameKind, OptDef[]>> = {
  caro: [{ key: 'size', label: 'Cỡ bàn', def: 15, choices: [{ v: 15, l: '15 × 15' }, { v: 10, l: '10 × 10 (nhanh)' }] }],
  so_bi_mat: [{ key: 'len', label: 'Số chữ số', def: 4, choices: [{ v: 3, l: '3' }, { v: 4, l: '4' }, { v: 5, l: '5' }] }],
  lat_bai: [
    { key: 'pairs', label: 'Số cặp', def: 8, choices: [{ v: 6, l: '6 cặp' }, { v: 8, l: '8 cặp' }, { v: 10, l: '10 cặp' }] },
    { key: 'mode', label: 'Cách chơi', def: 'vs', choices: [{ v: 'vs', l: 'Đối kháng' }, { v: 'coop', l: 'Cùng đội' }] }],
  bai_cao: [{ key: 'rounds', label: 'Số vòng', def: 3, choices: [{ v: 1, l: '1 vòng' }, { v: 3, l: '3 vòng' }, { v: 5, l: '5 vòng' }] }],
  xi_dach: [{ key: 'rounds', label: 'Số ván', def: 3, choices: [{ v: 1, l: '1 ván' }, { v: 3, l: '3 ván' }, { v: 5, l: '5 ván' }] }],
  ve_doan: [{ key: 'rounds', label: 'Số lượt vẽ', def: 4, choices: [{ v: 2, l: '2 lượt' }, { v: 4, l: '4 lượt' }, { v: 6, l: '6 lượt' }] }],
}

export default function Games() {
  const { me, partner, space } = useApp()
  const r = useRouter()
  const pn = partner?.display_name ?? 'Người ấy'
  const [games, setGames] = useState<Game[] | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<GameKind | null>(null)
  const [opts, setOpts] = useState<Record<string, string | number>>({})
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('')
  const [owed, setOwed] = useState(0)

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      sb.from('games').select('*').order('updated_at', { ascending: false }).limit(300),
      sb.from('game_vouchers').select('id', { count: 'exact', head: true }).eq('holder', me.id).eq('status', 'won'),
    ])
    if (a.error) { setErr('Chưa tải được trò chơi. Đã chạy supabase/phase24.sql chưa?'); setGames([]) }
    else { setErr(''); setGames((a.data ?? []) as Game[]) }
    if (!b.error) setOwed(b.count ?? 0)
  }, [me.id])

  useEffect(() => {
    load()
    const c = sb.channel('games-' + space.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `space_id=eq.${space.id}` }, () => load())
      .subscribe()
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { sb.removeChannel(c); document.removeEventListener('visibilitychange', onVis) }
  }, [space.id, load])

  const active = useMemo(() => (games ?? []).filter(g => g.status === 'playing'), [games])
  const byKind = useMemo(() => new Map(active.map(g => [g.kind, g])), [active])
  const stats = useMemo(() => {
    const done = (games ?? []).filter(g => g.status === 'done')
    const per = new Map<GameKind, { me: number; you: number; tie: number }>()
    for (const g of done) {
      const x = per.get(g.kind) ?? { me: 0, you: 0, tie: 0 }
      if (g.winner === me.id) x.me++; else if (g.winner) x.you++; else x.tie++
      per.set(g.kind, x)
    }
    const all = [...per.values()].reduce((s, x) => ({ me: s.me + x.me, you: s.you + x.you, tie: s.tie + x.tie }), { me: 0, you: 0, tie: 0 })
    return { per, all, n: done.length }
  }, [games, me.id])

  const choose = (k: GameKind) => {
    setMsg('')
    if (open === k) return setOpen(null)
    setOpen(k); setOpts(Object.fromEntries((OPTS[k] ?? []).map(o => [o.key, o.def])))
  }
  async function start(k: GameKind) {
    if (!partner) return setMsg('Hãy mời người ấy vào Space trước, rồi hai đứa mới chơi cùng nhau được.')
    setBusy(true); setMsg('')
    const res = await createGame(k, { ...defaultOpts(k), ...opts })
    setBusy(false)
    if (res.error) return setMsg(res.error)
    r.push(`/games/${res.id}`)
  }

  const needMe = active.filter(g => g.waiting.includes(me.id)).length

  return <>
    <Head t="Trò chơi"><Link href="/" className="pill">Trang chủ</Link></Head>
    <div className="b">
      {err && <div className="k pe"><div className="s">{err}</div></div>}
      {games === null && <div className="s">Đang tải…</div>}

      {active.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>Đang chơi dở {needMe > 0 && <span className="gm-pill-n">{needMe} chờ bạn</span>}</b>
        {active.map(g => {
          const k = KINDS[g.kind], mineTurn = g.waiting.includes(me.id)
          return <Link key={g.id} href={`/games/${g.id}`} className={`k ${mineTurn ? 'pk' : 'li'}`} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }} aria-hidden="true">{k.icon}</span>
            <span className="gm-grow"><b>{k.name}</b><span className="s" style={{ display: 'block' }}>{statusText(g, me.id, pn)}</span></span>
            <span className="pill on" style={{ flex: 'none' }}>{mineTurn ? 'Chơi tiếp' : 'Xem'}</span>
          </Link>
        })}
      </div>}

      <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="gm-row" style={{ justifyContent: 'space-between' }}>
          <b>Tỉ số hai đứa</b>
          <Link href="/games/rewards" className="pill on">🎁 Hộp quà{owed > 0 ? ` (${owed})` : ''}</Link>
        </div>
        {stats.n === 0 ? <div className="s">Chưa có ván nào xong. Chơi một ván thử nhé!</div>
          : <div className="s">Bạn thắng {stats.all.me} · {pn} thắng {stats.all.you} · hòa hoặc cùng vui {stats.all.tie}</div>}
        {stats.n > 0 && <details><summary className="s" style={{ cursor: 'pointer' }}>Chi tiết từng trò</summary>
          <div className="gm-hist" style={{ marginTop: 8 }}>
            {[...stats.per.entries()].map(([k, x]) => <div key={k}><span>{KINDS[k].icon} {KINDS[k].name}</span><span>Bạn {x.me} – {x.you} {pn}{x.tie ? ` · ${x.tie} hòa` : ''}</span></div>)}
          </div></details>}
      </div>

      <b>Chọn trò để chơi cùng {pn}</b>
      {msg && <div className="gm-err" role="alert">{msg}</div>}
      {KIND_ORDER.map(k => {
        const info = KINDS[k], cur = byKind.get(k), def = OPTS[k] ?? []
        return <div key={k} className="k" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button type="button" className="gm-card" style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={() => cur ? r.push(`/games/${cur.id}`) : choose(k)} aria-expanded={open === k}>
            <span className="gm-row"><span style={{ fontSize: 30 }} aria-hidden="true">{info.icon}</span><span className="gm-grow"><b>{info.name}</b><span className="s" style={{ display: 'block' }}>{info.blurb}</span></span></span>
            <span className="gm-sub">{info.players}{cur ? ' · đang có một ván, chạm để tiếp tục' : ''}</span>
          </button>
          {open === k && !cur && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {def.map(o => <div key={o.key}><div className="gm-sub" style={{ marginBottom: 4 }}>{o.label}</div>
              <div className="gm-chips" role="group" aria-label={o.label}>{o.choices.map(c => <button key={String(c.v)} type="button" className={`pill ${opts[o.key] === c.v ? 'on' : ''}`} aria-pressed={opts[o.key] === c.v} onClick={() => setOpts(x => ({ ...x, [o.key]: c.v }))}>{c.l}</button>)}</div></div>)}
            <button className="btn" disabled={busy} onClick={() => start(k)}>{busy ? 'Đang tạo…' : `Rủ ${pn} chơi`}</button>
          </div>}
        </div>
      })}
    </div>
  </>
}
