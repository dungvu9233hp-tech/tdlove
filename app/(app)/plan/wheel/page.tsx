'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'
import Wheel from '@/components/Wheel'
import { ok } from '@/lib/util'

const MAX = 12, MIN = 2, SPIN_MS = 4500   // khớp trigger food_options_limit trong phase10.sql

// số nguyên ngẫu nhiên đều trong [0, n), dùng bộ sinh số của trình duyệt (loại bỏ lệch modulo)
function rnd(n: number) {
  const lim = Math.floor(0x100000000 / n) * n, b = new Uint32Array(1)
  do { crypto.getRandomValues(b) } while (b[0] >= lim)
  return b[0] % n
}
const when = (s: string) => new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function WheelPage() {
  const { space, me, partner } = useApp()
  const [opts, setOpts] = useState<any[]>([]); const [spins, setSpins] = useState<any[]>([]); const [dishes, setDishes] = useState<string[]>([])
  const [name, setName] = useState(''); const [rot, setRot] = useState(0); const [ms, setMs] = useState(0)
  const [frozen, setFrozen] = useState<string[] | null>(null)   // đang quay thì giữ nguyên các ô, kể cả khi người kia thêm/xóa món
  const [spinning, setSpinning] = useState(false); const [result, setResult] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      sb.from('food_options').select('*').order('created_at'),
      sb.from('food_spins').select('*').order('created_at', { ascending: false }).limit(6),
      sb.from('wishlist_places').select('dish').eq('visited', false)])
    setOpts(a.data ?? []); setSpins(b.data ?? [])
    setDishes(Array.from(new Set((c.data ?? []).map((x: any) => String(x.dish ?? '').trim()).filter((d: string) => d && d.length <= 40))))
  }, [])
  useEffect(() => { load() }, [load])
  // Hai người cùng thêm món, thấy kết quả quay của nhau ngay
  useEffect(() => {
    const ch = sb.channel('wheel-' + space.id)
    ;['food_options', 'food_spins'].forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `space_id=eq.${space.id}` }, () => load()))
    ch.subscribe()
    return () => { sb.removeChannel(ch) }
  }, [space.id, load])
  useEffect(() => () => clearTimeout(timer.current), [])

  const names = opts.map(o => o.name as string)
  const shown = frozen ?? names
  const has = (s: string) => names.some(x => x.toLowerCase() === s.toLowerCase())

  async function add(raw: string) {
    const s = raw.trim().replace(/\s+/g, ' ')
    if (!s || spinning) return
    if (s.length > 40) return alert('Tên món tối đa 40 ký tự')
    if (names.length >= MAX) return alert(`Vòng quay tối đa ${MAX} món. Xóa bớt món rồi thêm nhé.`)
    if (has(s)) return alert('Món này đã có trong vòng quay rồi')
    if (!await ok(sb.from('food_options').insert({ space_id: space.id, name: s }), 'Không thêm được món')) return
    setName(''); setResult(null); load()
  }
  async function remove(o: any) {
    if (spinning) return
    if (!await ok(sb.from('food_options').delete().eq('id', o.id), 'Không xóa được món')) return
    setResult(null); load()
  }

  function spin() {
    if (spinning || names.length < MIN) return
    const list = names.slice(), n = list.length, a = 360 / n
    const idx = rnd(n)                                              // chọn món trúng TRƯỚC, rồi mới tính góc quay để kim dừng đúng ô đó
    const mid = (idx + .5) * a + (rnd(1000) / 1000 - .5) * a * .7   // lệch nhẹ trong ô cho tự nhiên, không chạm vạch chia
    const delta = (((-mid - rot) % 360) + 360) % 360
    const dur = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : SPIN_MS
    setFrozen(list); setResult(null); setSpinning(true); setMs(dur); setRot(rot + 360 * 5 + delta)
    timer.current = setTimeout(async () => {
      const win = list[idx]
      setResult(win); setSpinning(false); setFrozen(null)
      await ok(sb.from('food_spins').insert({ space_id: space.id, name: win }), 'Không lưu được kết quả quay')
      load()
    }, dur + 150)
  }

  const sug = dishes.filter(d => !has(d)).slice(0, 6)
  const pn = partner?.display_name ?? 'Người ấy'
  return <>
    <Head t="Quay món"><Link href="/plan" className="pill">Quay lại</Link></Head>
    <div className="b">
      <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 18 }}>
        {shown.length >= MIN
          ? <Wheel names={shown} rot={rot} ms={ms} />
          : <div className="s" style={{ textAlign: 'center', padding: '28px 0' }}>Thêm ít nhất {MIN} món để bắt đầu quay.</div>}
        <button className="btn" onClick={spin} disabled={spinning || names.length < MIN}>{spinning ? 'Đang quay…' : 'Quay!'}</button>
        <div aria-live="polite">{result && !spinning && <div style={{ textAlign: 'center' }}>
          <div className="s">Hôm nay hai đứa ăn</div>
          <b style={{ fontSize: 26, margin: '2px 0 8px' }}>🎉 {result}</b>
          <a className="pill" href={`https://www.google.com/maps/search/${encodeURIComponent(result)}`} target="_blank" rel="noopener noreferrer">Tìm quán gần đây</a>
        </div>}</div>
      </div>

      <div className="k" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>Món trong vòng ({names.length}/{MAX})</b>
        <form className="row" onSubmit={e => { e.preventDefault(); add(name) }}>
          <input placeholder="Thêm món, ví dụ: bún chả" value={name} maxLength={40} disabled={spinning} onChange={e => setName(e.target.value)} aria-label="Tên món" />
          <button className="pill on" style={{ flex: 'none' }} type="submit" disabled={spinning || !name.trim()}>Thêm</button>
        </form>
        {opts.length > 0 && <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {opts.map(o => <span key={o.id} className="pill" style={{ flex: 'none' }}>{o.name}{' '}
            <button style={{ border: 0, background: 'none', font: 'inherit', fontWeight: 800, cursor: 'pointer', color: 'inherit' }} disabled={spinning} onClick={() => remove(o)} aria-label={`Xóa ${o.name}`}>×</button></span>)}
        </div>}
        {sug.length > 0 && names.length < MAX && <>
          <div className="s">Từ "Quán muốn thử" (bấm để thêm):</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {sug.map(d => <button key={d} className="chip" style={{ flex: 'none' }} disabled={spinning} onClick={() => add(d)}>+ {d}</button>)}
          </div>
        </>}
      </div>

      {spins.length > 0 && <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <b>Các lần quay gần đây</b>
        {spins.map(s => <div key={s.id} className="s">{s.name} · {s.spun_by === me.id ? 'Bạn' : pn} · {when(s.created_at)}</div>)}
        <button className="pill" style={{ alignSelf: 'flex-start' }} onClick={async () => { if (confirm('Xóa lịch sử quay?') && await ok(sb.from('food_spins').delete().eq('space_id', space.id), 'Không xóa được')) load() }}>Xóa lịch sử</button>
      </div>}
    </div>
  </>
}
