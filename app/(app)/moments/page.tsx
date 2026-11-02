'use client'
import { useCallback, useEffect, useState } from 'react'
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

export default function Moments() {
  const { space } = useApp()
  const [list, setList] = useState<any[]>([])
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ title: '', desc: '', date: new Date().toISOString().slice(0, 10), place: '' })
  const [files, setFiles] = useState<File[]>([])

  const load = useCallback(async () => {
    const { data } = await sb.from('moments').select('*').is('deleted_at', null)
      .order('taken_on', { ascending: false }).order('created_at', { ascending: false }).limit(30)
    setList(await Promise.all((data ?? []).map(async m => {
      const { data: u } = m.photos.length ? await sb.storage.from('media').createSignedUrls(m.photos, 3600) : { data: [] }
      return { ...m, urls: (u ?? []).map((x: any) => x.signedUrl) }
    })))
  }, [])
  useEffect(() => { load() }, [load])

  async function save() {
    if (!f.title.trim()) return
    setBusy(true)
    const paths: string[] = []
    for (const file of files.slice(0, 20)) {
      const vid = file.type.startsWith('video/')
      if (vid && file.size > 200 * 1048576) { alert(`${file.name} lớn hơn 200 MB, đã bỏ qua`); continue }
      const p = `${space.id}/${crypto.randomUUID()}.${vid ? (file.name.split('.').pop() || 'mp4').toLowerCase() : 'jpg'}`
      const { error } = await sb.storage.from('media').upload(p, vid ? file : await shrink(file), { contentType: vid ? file.type : 'image/jpeg' })
      if (error) alert(vid ? 'Không tải được video (gói Supabase miễn phí giới hạn 50 MB mỗi file)' : error.message); else paths.push(p)
    }
    await sb.from('moments').insert({ space_id: space.id, title: f.title, description: f.desc, taken_on: f.date, place: f.place, photos: paths })
    setF({ ...f, title: '', desc: '', place: '' }); setFiles([]); setOpen(false); setBusy(false); load()
  }
  const del = async (id: string) => { if (confirm('Xóa khoảnh khắc này? Có thể khôi phục trong 30 ngày.')) { await sb.from('moments').update({ deleted_at: new Date().toISOString() }).eq('id', id); load() } }

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
    </div>
    <button className="rb fab" onClick={() => setOpen(!open)} aria-label="Thêm khoảnh khắc">{open ? '×' : '+'}</button>
  </>
}
