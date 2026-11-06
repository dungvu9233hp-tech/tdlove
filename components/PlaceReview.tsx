'use client'
import { useEffect, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'
import { MAX_IMG, MB, localDay, processImage, sign, uploadBlob } from '@/lib/media'

export const PLACE_MAX_PHOTOS = 10   // khớp trigger wishlist_media_limit trong phase9.sql

type Item = { id: string; file: File; url: string; status: 'ready' | 'up' | 'done' | 'err'; p: number; err?: string }
const uid = () => crypto.randomUUID()

// Sau khi đi ăn: chấm sao, viết đánh giá, tải ảnh cho một quán trong "Quán muốn thử" (WISH-01..02)
export default function PlaceReview({ space, place, onClose, onDone }: {
  space: any; place: any; onClose: () => void; onDone: () => void
}) {
  const today = localDay(new Date().toISOString())
  const [f, setF] = useState({ stars: (place.stars ?? 0) as number, review: (place.review ?? '') as string, date: (place.visited_on ?? today) as string })
  const [items, setItems] = useState<Item[]>([])
  const [old, setOld] = useState<any[]>((place.wishlist_media ?? []).slice().sort((a: any, b: any) => a.sort - b.sort))
  const [oldUrl, setOldUrl] = useState<Record<string, string>>({})
  const [gone, setGone] = useState<string[]>([])
  const [notes, setNotes] = useState<string[]>([]); const [busy, setBusy] = useState(false)
  const itemsRef = useRef<Item[]>([]); itemsRef.current = items
  const total = old.length - gone.length + items.length

  useEffect(() => { sign(old.map((m: any) => m.thumb_path ?? m.path)).then(setOldUrl) }, [old])
  useEffect(() => () => { itemsRef.current.forEach(i => URL.revokeObjectURL(i.url)) }, [])
  useEffect(() => {   // đang tải ảnh lên thì cảnh báo khi người dùng định rời trang
    if (!busy) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [busy])

  const patch = (id: string, p: Partial<Item>) => setItems(a => a.map(x => x.id === id ? { ...x, ...p } : x))

  function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []); if (!files.length) return
    const msg: string[] = [], add: Item[] = []
    let room = PLACE_MAX_PHOTOS - total
    for (const file of files) {
      if (room <= 0) { msg.push(`${file.name}: đã đủ ${PLACE_MAX_PHOTOS} ảnh`); continue }
      if (!file.type.startsWith('image/')) { msg.push(`${file.name}: chỉ đính kèm được ảnh`); continue }
      if (file.size > MAX_IMG) { msg.push(`${file.name}: ảnh lớn hơn 15 MB (${MB(file.size)})`); continue }
      add.push({ id: uid(), file, url: URL.createObjectURL(file), status: 'ready', p: 0 }); room--
    }
    setItems(a => [...a, ...add]); setNotes(msg)
  }

  async function uploadOne(it: Item, sort: number) {
    patch(it.id, { status: 'up', p: 0, err: undefined })
    const made: string[] = []
    try {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) throw new Error('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.')
      const base = `${space.id}/${user.id}/${uid()}`
      const { full, thumb, width, height } = await processImage(it.file)
      await uploadBlob(`${base}.jpg`, full, 'image/jpeg', p => patch(it.id, { p: Math.round(p * 0.9) })); made.push(`${base}.jpg`)
      await uploadBlob(`${base}-t.jpg`, thumb, 'image/jpeg'); made.push(`${base}-t.jpg`)
      const { error } = await sb.from('wishlist_media').insert({ place_id: place.id, space_id: space.id, path: `${base}.jpg`, thumb_path: `${base}-t.jpg`, size: full.size, width, height, sort })
      if (error) throw new Error(error.message)
      patch(it.id, { status: 'done', p: 100 })
      return true
    } catch (e: any) {
      if (made.length) sb.storage.from('media').remove(made)   // dọn tệp đã tải lên nhưng chưa gắn được
      patch(it.id, { status: 'err', err: e?.message ?? 'Lỗi không rõ' })
      return false
    }
  }

  async function save() {
    if (busy) return
    setBusy(true)
    try {
      const { error } = await sb.from('wishlist_places').update({
        visited: true, stars: f.stars || null, review: f.review.trim() || null, visited_on: f.date || today,
      }).eq('id', place.id)
      if (error) return alert('Không lưu được đánh giá: ' + error.message)
      // gỡ ảnh cũ đã bỏ (xóa dòng trước, tệp sau)
      if (gone.length) {
        const rm = old.filter((m: any) => gone.includes(m.id))
        const { error } = await sb.from('wishlist_media').delete().in('id', gone)
        if (!error) { sb.storage.from('media').remove(rm.flatMap((m: any) => [m.path, m.thumb_path].filter(Boolean))); setOld(o => o.filter((m: any) => !gone.includes(m.id))); setGone([]) }
      }
      // tải ảnh mới lên lần lượt; ảnh nào xong rồi thì bỏ qua (cho phép thử lại ảnh lỗi)
      let sort = Math.max(-1, ...old.map((m: any) => m.sort)) + 1, fail = 0
      for (const it of itemsRef.current) {
        if (it.status === 'done') continue
        if (!await uploadOne(it, sort++)) fail++
      }
      if (fail) { setNotes([`${fail} ảnh chưa tải lên được. Đánh giá đã được lưu; bấm lại nút bên dưới để thử lại các ảnh lỗi.`]); return }
      onDone()
    } finally { setBusy(false) }
  }

  const errCount = items.filter(i => i.status === 'err').length
  const doneN = items.filter(i => i.status === 'done').length

  return <div className="sheet" role="dialog" aria-label={`Đánh giá ${place.name}`}>
    <div className="row"><b style={{ flex: 1 }}>Đánh giá quán</b><button className="pill" style={{ flex: 'none' }} onClick={onClose} disabled={busy}>Đóng</button></div>
    <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <b>{place.name}</b>
      <div className="s">{[place.area, place.dish && `Món: ${place.dish}`, place.price].filter(Boolean).join(', ')}</div>
      <label className="s">Ngày đã đến<input type="date" max={today} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
      <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Chấm sao">
        {[1, 2, 3, 4, 5].map(n => <button key={n} className={`pill ${f.stars >= n ? 'on' : ''}`} onClick={() => setF({ ...f, stars: f.stars === n ? 0 : n })} aria-label={`${n} sao`} aria-pressed={f.stars >= n}>{n}★</button>)}
      </div>
      <textarea rows={5} placeholder="Món nào ngon, không gian ra sao, có quay lại không…" value={f.review} maxLength={2000} onChange={e => setF({ ...f, review: e.target.value })} aria-label="Nội dung đánh giá" />
    </div>

    <div className="k" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b>Ảnh ({total}/{PLACE_MAX_PHOTOS})</b>
      <div className="s">Ảnh ≤ 15 MB, tự nén.</div>
      <input type="file" accept="image/*" multiple disabled={busy || total >= PLACE_MAX_PHOTOS} onChange={e => { onFiles(e.target.files); e.target.value = '' }} aria-label="Chọn ảnh" />
      {(old.length > 0 || items.length > 0) && <div className="grid">
        {old.filter((m: any) => !gone.includes(m.id)).map((m: any) => <div key={m.id} className="th">
          {oldUrl[m.thumb_path ?? m.path] ? <img src={oldUrl[m.thumb_path ?? m.path]} alt="" /> : '🖼️'}
          <button className="x" disabled={busy} onClick={() => setGone(g => [...g, m.id])} aria-label="Gỡ ảnh này">×</button></div>)}
        {items.map(i => <div key={i.id} className="th">
          <img src={i.url} alt="" />
          {i.status === 'up' && <span className="st">{i.p}%</span>}
          {i.status === 'done' && <span className="st">Xong ✓</span>}
          {i.status === 'err' && <span className="st" style={{ color: '#B00020' }}>Lỗi</span>}
          {i.status !== 'done' && <button className="x" disabled={busy} onClick={() => { URL.revokeObjectURL(i.url); setItems(a => a.filter(x => x.id !== i.id)) }} aria-label="Gỡ ảnh này">×</button>}</div>)}
      </div>}
      {items.filter(i => i.status === 'err').map(i => <div key={i.id} className="s" role="alert">{i.file.name}: {i.err}</div>)}
      {notes.map((n, k) => <div key={k} className="s" role="alert">{n}</div>)}
      {busy && items.length > 0 && <><div className="bar" aria-hidden><i style={{ width: `${Math.round(items.reduce((s, i) => s + (i.status === 'done' ? 100 : i.p), 0) / items.length)}%` }} /></div><div className="s">Đã xong {doneN}/{items.length} ảnh. Mất mạng thì app tự chờ rồi tải tiếp.</div></>}
    </div>

    <button className="btn" onClick={save} disabled={busy}>{busy ? 'Đang lưu…' : errCount ? `Thử lại ${errCount} ảnh lỗi` : 'Lưu đánh giá'}</button>
    {errCount > 0 && !busy && <button className="pill" onClick={onDone}>Để vậy, đóng lại</button>}
  </div>
}
