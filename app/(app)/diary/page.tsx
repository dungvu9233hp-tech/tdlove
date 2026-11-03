'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { sign } from '@/lib/media'
import Head from '@/components/Head'
import DiaryForm, { MOOD } from '@/components/DiaryForm'
import Lightbox, { LbItem } from '@/components/Lightbox'
import { ok } from '@/lib/util'

const PAGE = 20
const SEL = '*, diary_media(id,path,thumb_path,sort)'
const pad = (n: number) => String(n).padStart(2, '0')
// tháng yyyy-mm → [đầu tháng, đầu tháng sau)
const monthRange = (m: string): [string, string] => {
  const [y, mo] = m.split('-').map(Number)
  return [`${y}-${pad(mo)}-01`, mo === 12 ? `${y + 1}-01-01` : `${y}-${pad(mo + 1)}-01`]
}
type Filter = { q: string; month: string; mood: string }
const NOF: Filter = { q: '', month: '', mood: '' }

export default function Diary() {
  const { me, space, partner } = useApp()
  const [list, setList] = useState<any[]>([]); const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [more, setMore] = useState(true); const [loading, setLoading] = useState(false); const [failed, setFailed] = useState(false)
  const [flt, setFlt] = useState<Filter>(NOF); const [qIn, setQIn] = useState('')
  const [form, setForm] = useState<null | 'new' | any>(null)
  const [lb, setLb] = useState<null | { items: LbItem[]; start: number; cap: string }>(null)
  const [moments, setMoments] = useState<any[]>([]); const [plans, setPlans] = useState<any[]>([])
  const lenRef = useRef(0), lock = useRef(false), gen = useRef(0), fRef = useRef(flt); fRef.current = flt
  const sentinel = useRef<HTMLDivElement>(null)

  const attach = useCallback(async (rows: any[]) => {   // ký link ảnh nhỏ cho cả trang bằng một lần gọi
    const t = await sign(rows.flatMap(e => (e.diary_media ?? []).map((x: any) => x.thumb_path ?? x.path)))
    setThumbs(a => ({ ...a, ...t }))
  }, [])

  const fetchPage = useCallback(async (from: number) => {
    const f = fRef.current
    let q: any = sb.from('diary_entries').select(SEL)
    if (f.month) { const [a, b] = monthRange(f.month); q = q.gte('entry_date', a).lt('entry_date', b) }
    if (f.mood) q = q.eq('mood', f.mood)
    const term = f.q.replace(/[,()%*\\"_]/g, ' ').trim()   // ký tự đặc biệt làm hỏng cú pháp bộ lọc .or()
    if (term) q = q.or(`title.ilike.%${term}%,body.ilike.%${term}%`)
    const { data, error } = await q.order('entry_date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, from + PAGE - 1)
    if (error) { console.error('diary', error.message); return null }
    const rows = data ?? []; await attach(rows); return rows
  }, [attach])

  const page = useCallback(async (reset: boolean) => {
    if (!reset && lock.current) return
    const g = reset ? ++gen.current : gen.current
    lock.current = true; setLoading(true)
    try {
      const from = reset ? 0 : lenRef.current, rows = await fetchPage(from)
      if (g !== gen.current) return
      if (!rows) { setFailed(true); setMore(false); return }
      setFailed(false); lenRef.current = from + rows.length
      setList(a => reset ? rows : [...a, ...rows.filter((r: any) => !a.some(x => x.id === r.id))]); setMore(rows.length === PAGE)
    } finally { if (g === gen.current) { lock.current = false; setLoading(false) } }
  }, [fetchPage])
  const load = useCallback(() => page(true), [page])
  useEffect(() => { load() }, [load, flt])

  // tìm kiếm: chờ người dùng ngừng gõ rồi mới gọi
  useEffect(() => { const t = setTimeout(() => setFlt(f => f.q === qIn ? f : { ...f, q: qIn }), 300); return () => clearTimeout(t) }, [qIn])
  // mở sẵn một tháng từ liên kết /diary?month=yyyy-mm (từ "Ngày này năm trước" ở Trang chủ)
  useEffect(() => {
    const m = new URLSearchParams(location.search).get('month')
    if (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) setFlt(f => ({ ...f, month: m }))
  }, [])

  useEffect(() => {
    const el = sentinel.current; if (!el || !more) return
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) page(false) }, { rootMargin: '300px' })
    io.observe(el); return () => io.disconnect()
  }, [more, list.length, page])

  // danh sách để gắn bài với Khoảnh khắc / Kế hoạch (DIARY-03)
  useEffect(() => {
    sb.from('moments').select('id,title,taken_on').is('deleted_at', null).order('taken_on', { ascending: false }).limit(200).then(r => setMoments(r.data ?? []))
    sb.from('plans').select('id,name').order('created_at', { ascending: false }).limit(100).then(r => setPlans(r.data ?? []))
  }, [])

  const del = async (e: any) => {
    if (!confirm('Xóa bài này?')) return
    if (!await ok(sb.from('diary_entries').delete().eq('id', e.id), 'Không xóa được')) return
    const paths = (e.diary_media ?? []).flatMap((m: any) => [m.path, m.thumb_path].filter(Boolean))
    if (paths.length) sb.storage.from('media').remove(paths)   // dòng đã xóa; tệp xóa sau, lỗi cũng không ảnh hưởng bài khác
    lenRef.current = Math.max(0, lenRef.current - 1); setList(a => a.filter(x => x.id !== e.id))
  }
  const openPhoto = async (e: any, i: number) => {
    const ms = (e.diary_media ?? []).slice().sort((a: any, b: any) => a.sort - b.sort)
    const urls = await sign(ms.map((m: any) => m.path))
    const items = ms.map((m: any) => urls[m.path]).filter(Boolean).map((url: string) => ({ kind: 'image' as const, url }))
    if (items.length) setLb({ items, start: Math.min(i, items.length - 1), cap: e.title || 'Nhật ký' })
  }

  const filtering = !!(flt.q || flt.month || flt.mood)
  const momentTitle = (id: string) => moments.find(m => m.id === id)?.title
  const planName = (id: string) => plans.find(p => p.id === id)?.name

  return <>
    <Head t="Nhật ký"><Link href="/" className="pill">Trang chủ</Link></Head>
    <div className="b">
      <label className="k s"><input placeholder="Tìm trong nhật ký…" value={qIn} onChange={e => setQIn(e.target.value)} aria-label="Tìm trong nhật ký" /></label>
      <div className="k" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="row">
          <label className="s">Tháng<input type="month" value={flt.month} onChange={e => setFlt({ ...flt, month: e.target.value })} aria-label="Lọc theo tháng" /></label>
          {filtering && <button className="pill" style={{ flex: 'none' }} onClick={() => { setQIn(''); setFlt(NOF) }}>Bỏ lọc</button>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-label="Lọc theo tâm trạng">
          {MOOD.map(m => <button key={m} className="chip" style={{ fontSize: 22 }} aria-pressed={flt.mood === m} onClick={() => setFlt({ ...flt, mood: flt.mood === m ? '' : m })} aria-label={`Tâm trạng ${m}`}>{m}</button>)}
        </div>
      </div>

      {!list.length && !loading && !failed && (filtering
        ? <div className="k pe"><b>Không có bài nào khớp</b><div className="s">Thử đổi tháng, tâm trạng hoặc từ khóa nhé.</div></div>
        : <div className="k pe"><b>Chưa có bài nào</b><div className="s">Bấm dấu + để viết trang đầu tiên.</div></div>)}
      {failed && <div className="k pe" role="alert"><b>Không tải được nhật ký</b><button className="pill" onClick={load}>Thử lại</button></div>}

      {list.map(e => {
        const mine = e.author === me.id, ms = (e.diary_media ?? []).slice().sort((a: any, b: any) => a.sort - b.sort)
        return <div key={e.id} className={`k ${mine ? 'pk' : 'li'}`}>
          <div className="s">{new Date(e.entry_date).toLocaleDateString('vi-VN')}, {mine ? 'bạn viết' : `${partner?.display_name ?? 'Người ấy'} viết`} {e.mood}{e.is_private ? ' · 🔒 riêng tư' : ''}{e.updated_at ? ' · đã sửa' : ''}</div>
          {e.title && <b>{e.title}</b>}
          {e.body && <div style={{ whiteSpace: 'pre-wrap' }}>{e.body}</div>}
          {ms.length > 0 && <div className="mgrid" style={{ marginTop: 8 }}>
            {ms.slice(0, 6).map((m: any, i: number) => <button key={m.id} className="th" onClick={() => openPhoto(e, i)} aria-label={`Xem ảnh ${i + 1}/${ms.length}`}>
              {thumbs[m.thumb_path ?? m.path] ? <img src={thumbs[m.thumb_path ?? m.path]} alt="" loading="lazy" /> : '🖼️'}
              {i === 5 && ms.length > 6 && <span className="more">+{ms.length - 5}</span>}</button>)}
          </div>}
          {(e.moment_id || e.plan_id) && <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {e.moment_id && <Link href={`/moments?open=${e.moment_id}`} className="pill">📷 {momentTitle(e.moment_id) ?? 'Khoảnh khắc đã gắn'}</Link>}
            {e.plan_id && <Link href={`/plan/${e.plan_id}`} className="pill">🗺️ {planName(e.plan_id) ?? 'Kế hoạch đã gắn'}</Link>}
          </div>}
          {mine && <div className="row" style={{ marginTop: 8 }}>
            <button className="pill" onClick={() => setForm(e)}>Sửa</button>
            <button className="pill" onClick={() => del(e)}>Xóa</button>
          </div>}
        </div>
      })}
      {more && <div ref={sentinel} className="s" style={{ textAlign: 'center', minHeight: 24 }}>{loading ? 'Đang tải…' : ''}</div>}
    </div>
    <button className="rb fab" onClick={() => setForm('new')} aria-label="Viết nhật ký">+</button>
    {form && <DiaryForm space={space} entry={form === 'new' ? undefined : form} moments={moments} plans={plans}
      onClose={() => setForm(null)} onDone={() => { setForm(null); load() }} />}
    {lb && <Lightbox items={lb.items} start={lb.start} caption={lb.cap} onClose={() => setLb(null)} />}
  </>
}
