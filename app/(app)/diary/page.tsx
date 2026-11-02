'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'

const MOOD = ['😍', '🥰', '😊', '😴', '😢', '😡']

export default function Diary() {
  const { me, space, partner } = useApp()
  const [list, setList] = useState<any[]>([]); const [open, setOpen] = useState(false)
  const [f, setF] = useState({ title: '', body: '', mood: '🥰', date: new Date().toISOString().slice(0, 10) })
  const [q, setQ] = useState('')
  const load = useCallback(() => { sb.from('diary_entries').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(100).then(r => setList(r.data ?? [])) }, [])
  useEffect(() => { load() }, [load])
  async function save() {
    if (!f.body.trim() && !f.title.trim()) return
    await sb.from('diary_entries').insert({ space_id: space.id, entry_date: f.date, title: f.title, body: f.body, mood: f.mood })
    setF({ ...f, title: '', body: '' }); setOpen(false); load()
  }
  const shown = list.filter(e => !q || `${e.title} ${e.body} ${e.mood}`.toLowerCase().includes(q.toLowerCase()))
  return <>
    <Head t="Nhật ký"><Link href="/" className="pill">Trang chủ</Link></Head>
    <div className="b">
      {open && <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>Viết nhật ký</b>
        <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
        <input placeholder="Tiêu đề" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
        <textarea rows={5} placeholder="Hôm nay có gì vui…" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
        <div className="row" style={{ flexWrap: 'wrap' }}>{MOOD.map(m => <button key={m} className={`pill ${f.mood === m ? 'on' : ''}`} style={{ fontSize: 22 }} onClick={() => setF({ ...f, mood: m })} aria-label={`Tâm trạng ${m}`}>{m}</button>)}</div>
        <button className="btn" onClick={save}>Lưu nhật ký</button>
      </div>}
      <label className="k s"><input placeholder="Tìm trong nhật ký…" value={q} onChange={e => setQ(e.target.value)} /></label>
      {!shown.length && <div className="k pe"><b>Chưa có bài nào</b><div className="s">Bấm dấu + để viết trang đầu tiên.</div></div>}
      {shown.map(e => <div key={e.id} className={`k ${e.author === me.id ? 'pk' : 'li'}`}>
        <div className="s">{new Date(e.entry_date).toLocaleDateString('vi-VN')}, {e.author === me.id ? 'bạn viết' : `${partner?.display_name ?? 'Người ấy'} viết`} {e.mood}</div>
        {e.title && <b>{e.title}</b>}<div style={{ whiteSpace: 'pre-wrap' }}>{e.body}</div>
        {e.author === me.id && <button className="pill" style={{ marginTop: 8 }} onClick={async () => { if (confirm('Xóa bài này?')) { await sb.from('diary_entries').delete().eq('id', e.id); load() } }}>Xóa</button>}
      </div>)}
    </div>
    <button className="rb fab" onClick={() => setOpen(!open)} aria-label="Viết nhật ký">{open ? '×' : '+'}</button>
  </>
}
