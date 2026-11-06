'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'
import { daysTogether, ok, MILESTONES as MS, nextMonthAnniv, nextYearlyDate } from '@/lib/util'

const pd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }
const left = (d: Date) => Math.round((+d - +today()) / 864e5)
const when = (n: number) => n === 0 ? 'Hôm nay!' : `Còn ${n} ngày`

export default function Special() {
  const { space } = useApp()
  const [list, setList] = useState<any[]>([]); const [f, setF] = useState({ name: '', date: '', yearly: true })
  const load = useCallback(() => { sb.from('special_dates').select('*').order('on_date').then(r => setList(r.data ?? [])) }, [])
  useEffect(() => { load() }, [load])

  const items: { t: string; d: Date }[] = []
  if (space.start_date) {
    const start = pd(space.start_date), day = daysTogether(space.start_date)
    MS.filter(m => m >= day).slice(0, 3).forEach(m => items.push({ t: `Ngày thứ ${m}`, d: new Date(start.getFullYear(), start.getMonth(), start.getDate() + m - 1) }))
    const ma = nextMonthAnniv(space.start_date)
    if (ma) items.push({ t: ma.months % 12 ? `Kỷ niệm ${ma.months} tháng` : `Kỷ niệm ${ma.months / 12} năm`, d: ma.date })
  }
  list.forEach(s => { const d = s.yearly ? nextYearlyDate(s.on_date) : pd(s.on_date); if (left(d) >= 0) items.push({ t: s.name, d }) })
  items.sort((a, b) => +a.d - +b.d)

  async function save() {
    if (!f.name.trim() || !f.date) return
    if (!await ok(sb.from('special_dates').insert({ space_id: space.id, name: f.name, on_date: f.date, yearly: f.yearly }))) return
    setF({ name: '', date: '', yearly: true }); load()
  }
  return <>
    <Head t="Ngày đặc biệt"><Link href="/" className="pill">Trang chủ</Link></Head>
    <div className="b">
      {!space.start_date && <div className="k pe"><div className="s">Hãy chọn ngày bắt đầu yêu ở Trang chủ để hiện các mốc 100, 200, 365 ngày…</div></div>}
      {items.map((i, k) => <div key={k} className={`k ${left(i.d) === 0 ? 'pk' : ''}`}><b>{i.t}</b><div className="s">{i.d.toLocaleDateString('vi-VN')}, {when(left(i.d))}</div></div>)}
      <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>Thêm ngày đặc biệt</b>
        <input placeholder="Tên, ví dụ: Lần đầu gặp nhau" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
        <label className="s row" style={{ justifyContent: 'flex-start' }}><input type="checkbox" style={{ width: 22, flex: 'none' }} checked={f.yearly} onChange={e => setF({ ...f, yearly: e.target.checked })} />Lặp lại hằng năm</label>
        <button className="btn" onClick={save}>Thêm</button>
      </div>
      {list.map(s => <div key={s.id} className="k row"><div><b>{s.name}</b><div className="s">{pd(s.on_date).toLocaleDateString('vi-VN')}{s.yearly ? ', hằng năm' : ''}</div></div>
        <button className="pill rb" style={{ width: 'auto', height: 'auto', borderRadius: 999 }} onClick={async () => { await ok(sb.from('special_dates').delete().eq('id', s.id), 'Không xóa được'); load() }}>Xóa</button></div>)}
    </div>
  </>
}
