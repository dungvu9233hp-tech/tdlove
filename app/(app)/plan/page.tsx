'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'

const d = (s: string) => new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
const cls: Record<string, string> = { 'Ý tưởng': 'li', 'Đã chốt': 'pk', 'Đã đi': 'pe', 'Hủy': '' }

export default function Plans() {
  const { space } = useApp()
  const [list, setList] = useState<any[]>([]); const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', start: '', end: '', area: '' })
  const load = useCallback(() => { sb.from('plans').select('*').order('start_date', { ascending: false, nullsFirst: true }).then(r => setList(r.data ?? [])) }, [])
  useEffect(() => { load() }, [load])
  async function save() {
    if (!f.name.trim()) return
    await sb.from('plans').insert({ space_id: space.id, name: f.name, start_date: f.start || null, end_date: f.end || f.start || null, area: f.area })
    setF({ name: '', start: '', end: '', area: '' }); setOpen(false); load()
  }
  return <>
    <Head t="Kế hoạch"><Link href="/plan/wishlist" className="pill">Quán muốn thử</Link></Head>
    <div className="b">
      {open && <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>Kế hoạch mới</b>
        <input placeholder="Tên chuyến đi, ví dụ: Đà Lạt" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <label className="s">Từ ngày<input type="date" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /></label>
        <label className="s">Đến ngày<input type="date" value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></label>
        <input placeholder="Khu vực" value={f.area} onChange={e => setF({ ...f, area: e.target.value })} />
        <button className="btn" onClick={save}>Tạo kế hoạch</button>
      </div>}
      {!list.length && !open && <div className="k pe"><b>Chưa có kế hoạch nào</b><div className="s">Bấm dấu + để lên kế hoạch đi chơi đầu tiên.</div></div>}
      {list.map(p => <Link key={p.id} href={`/plan/${p.id}`} className={`k ${cls[p.status] ?? ''}`}>
        <b>{p.name}</b>
        <div className="s">{[p.status, p.start_date && `${d(p.start_date)}${p.end_date && p.end_date !== p.start_date ? '–' + d(p.end_date) : ''}`, p.area].filter(Boolean).join(', ')}</div>
      </Link>)}
    </div>
    <button className="rb fab" onClick={() => setOpen(!open)} aria-label="Thêm kế hoạch">{open ? '×' : '+'}</button>
  </>
}
