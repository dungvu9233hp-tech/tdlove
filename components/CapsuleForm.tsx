'use client'
import { useEffect, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'
import { MAX_IMG, MB, localDay, processImage } from '@/lib/media'

export const CAPSULE_MAX_PHOTOS = 3   // khớp create_capsule trong phase12.sql
const PRESETS = [{ t: '1 tháng', m: 1 }, { t: '3 tháng', m: 3 }, { t: '6 tháng', m: 6 }, { t: '1 năm', m: 12 }]
const dayIn = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() + m); return localDay(d.toISOString()) }
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return localDay(d.toISOString()) }
// yyyy-mm-dd (lịch của máy) → 00:00 của ngày đó theo giờ máy
const midnight = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

type Item = { id: string; file: File; url: string }

// CAPSULE-01: viết thư + tối đa 3 ảnh, hẹn NGÀY mở. Ảnh tải lên trước, rồi create_capsule() ghi thư và ảnh cùng lúc.
export default function CapsuleForm({ space, onClose, onDone }: { space: any; onClose: () => void; onDone: () => void }) {
  const [body, setBody] = useState(''); const [teaser, setTeaser] = useState(''); const [date, setDate] = useState(() => dayIn(3))
  const [items, setItems] = useState<Item[]>([]); const [notes, setNotes] = useState<string[]>([])
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const itemsRef = useRef<Item[]>([]); itemsRef.current = items

  useEffect(() => () => { itemsRef.current.forEach(i => URL.revokeObjectURL(i.url)) }, [])
  useEffect(() => {   // đang lưu thì cảnh báo khi người dùng định rời trang
    if (!busy) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [busy])

  function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []); if (!files.length) return
    const msg: string[] = [], add: Item[] = []
    let room = CAPSULE_MAX_PHOTOS - items.length
    for (const file of files) {
      if (room <= 0) { msg.push(`${file.name}: đã đủ ${CAPSULE_MAX_PHOTOS} ảnh`); continue }
      if (!file.type.startsWith('image/')) { msg.push(`${file.name}: hộp thời gian chỉ nhận ảnh`); continue }
      if (file.size > MAX_IMG) { msg.push(`${file.name}: ảnh lớn hơn 15 MB (${MB(file.size)})`); continue }
      add.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }); room--
    }
    setItems(a => [...a, ...add]); setNotes(msg)
  }

  async function save() {
    setErr('')
    if (!date || date < tomorrow()) return setErr('Hãy chọn ngày mở từ ngày mai trở đi.')
    if (!body.trim() && !items.length) return setErr('Hãy viết gì đó hoặc thêm một tấm ảnh.')
    setBusy(true)
    const id = crypto.randomUUID(), paths: string[] = []
    try {
      for (let i = 0; i < items.length; i++) {
        const { full } = await processImage(items[i].file)
        const p = `${space.id}/${id}/${i}.jpg`
        const { error } = await sb.storage.from('capsules').upload(p, full, { contentType: 'image/jpeg' })
        if (error) throw error
        paths.push(p)
      }
      const { error } = await sb.rpc('create_capsule', { p_id: id, p_teaser: teaser.trim(), p_unlock: midnight(date).toISOString(), p_body: body.trim(), p_paths: paths })
      if (error) throw error
      onDone()
    } catch (e: any) {
      if (paths.length) sb.storage.from('capsules').remove(paths)   // dọn ảnh đã lỡ tải lên
      setErr(String(e?.message ?? 'Không chôn được hộp, hãy thử lại.'))
    } finally { setBusy(false) }
  }

  return <div className="sheet" role="dialog" aria-label="Chôn hộp thời gian">
    <div className="row"><b style={{ flex: 1 }}>Chôn hộp thời gian</b><button className="pill" style={{ flex: 'none' }} onClick={onClose} disabled={busy}>Đóng</button></div>

    <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <textarea rows={7} maxLength={5000} placeholder="Viết cho người ấy của ngày mở hộp…" value={body} onChange={e => setBody(e.target.value)} aria-label="Thư" />
      <input placeholder="Lời gợi ý cho người ấy thấy trước (không bắt buộc)" value={teaser} maxLength={140} onChange={e => setTeaser(e.target.value)} aria-label="Lời gợi ý" />
    </div>

    <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <b>Mở vào ngày</b>
      <div className="row" style={{ flexWrap: 'wrap' }}>{PRESETS.map(p => <button key={p.m} className="chip" aria-pressed={date === dayIn(p.m)} onClick={() => setDate(dayIn(p.m))}>{p.t}</button>)}</div>
      <input type="date" min={tomorrow()} value={date} onChange={e => setDate(e.target.value)} aria-label="Ngày mở hộp" />
      <div className="s">Trước ngày này người ấy chỉ thấy lời gợi ý và số ngày còn lại, không đọc được thư. Bạn vẫn xem lại được thư của mình.</div>
    </div>

    <div className="k" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b>Ảnh ({items.length}/{CAPSULE_MAX_PHOTOS})</b>
      <div className="s">Ảnh ≤ 15 MB, tự nén.</div>
      <input type="file" accept="image/*" multiple disabled={busy || items.length >= CAPSULE_MAX_PHOTOS} onChange={e => { onFiles(e.target.files); e.target.value = '' }} aria-label="Chọn ảnh" />
      {items.length > 0 && <div className="grid">{items.map(i => <div key={i.id} className="th">
        <img src={i.url} alt="" />
        <button className="x" disabled={busy} onClick={() => { URL.revokeObjectURL(i.url); setItems(a => a.filter(x => x.id !== i.id)) }} aria-label="Gỡ ảnh này">×</button></div>)}</div>}
      {notes.map((n, k) => <div key={k} className="s" role="alert">{n}</div>)}
    </div>

    {err && <div className="k pe s" role="alert">{err}</div>}
    <button className="btn" onClick={save} disabled={busy}>{busy ? 'Đang chôn…' : 'Chôn hộp'}</button>
  </div>
}
