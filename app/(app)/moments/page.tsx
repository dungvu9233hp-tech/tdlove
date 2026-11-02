'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'

// Resize về tối đa 1600px, nén JPEG trước khi tải lên
async function shrink(f: File): Promise<Blob> {
  const bmp = await createImageBitmap(f)
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = bmp.width * k; c.height = bmp.height * k
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise(ok => c.toBlob(b => ok(b!), 'image/jpeg', 0.8))
}

const PAGE = 30
const MAX_VIDEO = 50 * 1048576   // gói Supabase miễn phí chỉ nhận tối đa 50 MB mỗi file

export default function Moments() {
  const { space } = useApp()
  const [list, setList] = useState<any[]>([])
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ title: '', desc: '', date: new Date().toISOString().slice(0, 10), place: '' })
  const [files, setFiles] = useState<File[]>([])
  const [more, setMore] = useState(true); const [loading, setLoading] = useState(false)
  const lenRef = useRef(0); const lock = useRef(false); const gen = useRef(0)
  const sentinel = useRef<HTMLDivElement>(null)

  // Lấy một trang 30 moment bắt đầu từ vị trí `from`; một lần gọi duy nhất để ký link cho cả trang
  const fetchPage = useCallback(async (from: number) => {
    const { data, error } = await sb.from('moments').select('*').is('deleted_at', null)
      .order('taken_on', { ascending: false }).order('created_at', { ascending: false }).order('id')
      .range(from, from + PAGE - 1)
    if (error) { console.error('moments', error.message); return null }
    const rows = data ?? []
    const paths = rows.flatMap((m: any) => m.photos ?? [])
    const url: Record<string, string> = {}
    if (paths.length) {
      const { data: u } = await sb.storage.from('media').createSignedUrls(paths, 3600)
      for (const x of u ?? []) if (x.path && x.signedUrl) url[x.path] = x.signedUrl
    }
    return rows.map((m: any) => ({ ...m, urls: (m.photos ?? []).map((p: string) => url[p]).filter(Boolean) }))
  }, [])

  // reset = tải lại từ đầu (lần đầu, sau khi đăng); không reset = tải thêm trang kế tiếp
  const page = useCallback(async (reset: boolean) => {
    if (!reset && lock.current) return
    const g = reset ? ++gen.current : gen.current
    lock.current = true; setLoading(true)
    try {
      const from = reset ? 0 : lenRef.current
      const rows = await fetchPage(from)
      if (g !== gen.current || !rows) return
      lenRef.current = from + rows.length
      setList(a => reset ? rows : [...a, ...rows.filter((r: any) => !a.some(x => x.id === r.id))])
      setMore(rows.length === PAGE)
    } finally { if (g === gen.current) { lock.current = false; setLoading(false) } }
  }, [fetchPage])
  const load = useCallback(() => page(true), [page])
  useEffect(() => { load() }, [load])

  // Cuộn gần cuối danh sách thì tự tải thêm
  useEffect(() => {
    const el = sentinel.current; if (!el || !more) return
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) page(false) }, { rootMargin: '300px' })
    io.observe(el); return () => io.disconnect()
  }, [more, list.length, page])

  async function save() {
    if (!f.title.trim() || busy) return
    setBusy(true)
    const paths: string[] = [], failed: string[] = []
    try {
      const chosen = files.slice(0, 20)
      for (const file of chosen) {
        try {   // nén ảnh có thể ném lỗi (ảnh hỏng, HEIC...), không để làm kẹt nút
          const vid = file.type.startsWith('video/')
          if (vid && file.size > MAX_VIDEO) { failed.push(`${file.name}: lớn hơn 50 MB (giới hạn của gói Supabase miễn phí)`); continue }
          const p = `${space.id}/${crypto.randomUUID()}.${vid ? (file.name.split('.').pop() || 'mp4').toLowerCase() : 'jpg'}`
          const { error } = await sb.storage.from('media').upload(p, vid ? file : await shrink(file), { contentType: vid ? file.type : 'image/jpeg' })
          if (error) failed.push(`${file.name}: ${error.message}`); else paths.push(p)
        } catch (e: any) { failed.push(`${file.name}: ${e?.message ?? 'không xử lý được tệp'}`) }
      }
      const undo = () => paths.length ? sb.storage.from('media').remove(paths) : null   // dọn tệp đã tải lên nếu không đăng nữa
      if (chosen.length && !paths.length) return alert('Không tải được tệp nào lên nên chưa đăng.\n' + failed.join('\n'))
      if (failed.length && !confirm(`${failed.length} tệp bị lỗi:\n${failed.join('\n')}\n\nVẫn đăng với ${paths.length} tệp còn lại?`)) { await undo(); return }
      const { error } = await sb.from('moments').insert({ space_id: space.id, title: f.title, description: f.desc, taken_on: f.date, place: f.place, photos: paths })
      if (error) { await undo(); return alert('Không lưu được khoảnh khắc: ' + error.message) }
      setF({ ...f, title: '', desc: '', place: '' }); setFiles([]); setOpen(false)
      await load()
    } finally { setBusy(false) }   // luôn nhả nút, kể cả khi có lỗi bất ngờ
  }
  const del = async (id: string) => {
    if (!confirm('Xóa khoảnh khắc này? Có thể khôi phục trong 30 ngày.')) return
    const { error } = await sb.from('moments').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) return alert('Không xóa được: ' + error.message)
    lenRef.current = Math.max(0, lenRef.current - 1)   // giữ vị trí trang kế tiếp đúng
    setList(a => a.filter(x => x.id !== id))
  }

  return <>
    <Head t="Khoảnh khắc" />
    <div className="b">
      {open && <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>Khoảnh khắc mới</b>
        <input placeholder="Tiêu đề, ví dụ: Chiều ở Hồ Tây" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
        <textarea rows={2} placeholder="Kể một chút về hôm đó…" value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} />
        <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
        <input placeholder="Địa điểm" value={f.place} onChange={e => setF({ ...f, place: e.target.value })} />
        <input type="file" accept="image/*,video/*" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))} />
        <div className="s">{files.length ? `Đã chọn ${files.length} ảnh (tối đa 20)` : 'Chọn ảnh để lưu cùng'}</div>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Đang đăng…' : 'Đăng khoảnh khắc'}</button>
      </div>}
      {!list.length && !open && <div className="k pe"><b>Chưa có khoảnh khắc nào</b><div className="s">Bấm dấu + để lưu kỷ niệm đầu tiên của hai đứa.</div></div>}
      {list.map(m => <div key={m.id}>
        <div className="s">{new Date(m.taken_on).toLocaleDateString('vi-VN')}</div>
        <div className="k">
          {m.urls.length > 0 && <div className="strip">{m.urls.map((u: string) => /\.(mp4|mov|webm|m4v)$/i.test(u.split('?')[0]) ? <video key={u} src={u} controls playsInline preload="metadata" style={{ height: 180, borderRadius: 14, border: '2px solid var(--ink)' }} /> : <img key={u} src={u} alt={m.title} />)}</div>}
          <b>{m.title}</b>
          {m.description && <div>{m.description}</div>}
          <div className="s">{[m.urls.length ? `${m.urls.length} ảnh/video` : '', m.place].filter(Boolean).join(', ')}</div>
          <button className="pill" onClick={() => del(m.id)}>Xóa</button>
        </div>
      </div>)}
      {list.length > 0 && more && <div ref={sentinel} style={{ textAlign: 'center' }}><button className="pill" onClick={() => page(false)} disabled={loading}>{loading ? 'Đang tải…' : 'Tải thêm'}</button></div>}
    </div>
    <button className="rb fab" onClick={() => setOpen(!open)} aria-label="Thêm khoảnh khắc">{open ? '×' : '+'}</button>
  </>
}
