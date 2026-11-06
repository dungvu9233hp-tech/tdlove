'use client'
import { useEffect, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'
import { MAX_IMG, MB, localDay, processImage, sign, uploadBlob } from '@/lib/media'

export const MOOD = ['😍', '🥰', '😊', '😴', '😢', '😡']
export const DIARY_MAX_PHOTOS = 10   // khớp trigger diary_media_limit trong phase7.sql

type Item = { id: string; file: File; url: string; status: 'ready' | 'up' | 'done' | 'err'; p: number; err?: string }
const uid = () => crypto.randomUUID()

// Viết mới hoặc sửa một bài nhật ký (DIARY-01, DIARY-03). Chỉ tác giả được sửa (RLS + quyền cột ở phase4/phase7).
export default function DiaryForm({ space, entry, moments, plans, onClose, onDone }: {
  space: any; entry?: any; moments: any[]; plans: any[]; onClose: () => void; onDone: () => void
}) {
  const edit = !!entry
  const [f, setF] = useState({
    date: entry?.entry_date ?? localDay(new Date().toISOString()), title: entry?.title ?? '', body: entry?.body ?? '',
    mood: entry?.mood ?? '🥰', moment: (entry?.moment_id ?? '') as string, plan: (entry?.plan_id ?? '') as string,
    priv: !!entry?.is_private,
  })
  const [items, setItems] = useState<Item[]>([])
  const [old, setOld] = useState<any[]>((entry?.diary_media ?? []).slice().sort((a: any, b: any) => a.sort - b.sort))
  const [oldUrl, setOldUrl] = useState<Record<string, string>>({})
  const [gone, setGone] = useState<string[]>([])
  const [notes, setNotes] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [check, setCheck] = useState(false)
  const savedId = useRef<string | null>(entry?.id ?? null)
  const itemsRef = useRef<Item[]>([]); itemsRef.current = items
  const today = localDay(new Date().toISOString())
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
    setCheck(true)
    const msg: string[] = [], add: Item[] = []
    let room = DIARY_MAX_PHOTOS - total
    for (const file of files) {
      if (room <= 0) { msg.push(`${file.name}: đã đủ ${DIARY_MAX_PHOTOS} ảnh`); continue }
      if (!file.type.startsWith('image/')) { msg.push(`${file.name}: nhật ký chỉ đính kèm được ảnh`); continue }
      if (file.size > MAX_IMG) { msg.push(`${file.name}: ảnh lớn hơn 15 MB (${MB(file.size)})`); continue }
      add.push({ id: uid(), file, url: URL.createObjectURL(file), status: 'ready', p: 0 }); room--
    }
    setItems(a => [...a, ...add]); setNotes(msg); setCheck(false)
  }

  async function uploadOne(it: Item, sort: number) {
    patch(it.id, { status: 'up', p: 0, err: undefined })
    const base = `${space.id}/${uid()}`, made: string[] = []
    try {
      const { full, thumb, width, height } = await processImage(it.file)
      await uploadBlob(`${base}.jpg`, full, 'image/jpeg', p => patch(it.id, { p: Math.round(p * 0.9) })); made.push(`${base}.jpg`)
      await uploadBlob(`${base}-t.jpg`, thumb, 'image/jpeg'); made.push(`${base}-t.jpg`)
      const { error } = await sb.from('diary_media').insert({ entry_id: savedId.current, space_id: space.id, path: `${base}.jpg`, thumb_path: `${base}-t.jpg`, size: full.size, width, height, sort })
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
    if (!f.body.trim() && !f.title.trim() && total === 0) return alert('Hãy viết gì đó hoặc thêm ảnh nhé')
    setBusy(true)
    try {
      const body = { entry_date: f.date || today, title: f.title.trim() || null, body: f.body.trim() || null, mood: f.mood, moment_id: f.moment || null, plan_id: f.plan || null, is_private: f.priv }
      if (savedId.current) {
        const { error } = await sb.from('diary_entries').update(body).eq('id', savedId.current)
        if (error) return alert('Không lưu được nhật ký: ' + error.message)
      } else {
        const { data, error } = await sb.from('diary_entries').insert({ ...body, space_id: space.id }).select('id').single()
        if (error || !data) return alert('Không lưu được nhật ký: ' + (error?.message ?? ''))
        savedId.current = data.id
      }
      // gỡ ảnh cũ đã bỏ (xóa dòng trước, tệp sau)
      if (gone.length) {
        const rm = old.filter((m: any) => gone.includes(m.id))
        const { error } = await sb.from('diary_media').delete().in('id', gone)
        if (!error) { sb.storage.from('media').remove(rm.flatMap((m: any) => [m.path, m.thumb_path].filter(Boolean))); setOld(o => o.filter((m: any) => !gone.includes(m.id))); setGone([]) }
      }
      // tải ảnh mới lên lần lượt; ảnh nào xong rồi thì bỏ qua (cho phép thử lại ảnh lỗi)
      let sort = Math.max(-1, ...old.map((m: any) => m.sort)) + 1, fail = 0
      for (const it of itemsRef.current) {
        if (it.status === 'done') continue
        if (!await uploadOne(it, sort++)) fail++
      }
      if (fail) { setNotes([`${fail} ảnh chưa tải lên được. Bài nhật ký đã được lưu; bấm lại nút bên dưới để thử lại các ảnh lỗi.`]); return }
      onDone()
    } finally { setBusy(false) }
  }

  const errCount = items.filter(i => i.status === 'err').length
  const doneN = items.filter(i => i.status === 'done').length

  return <div className="sheet" role="dialog" aria-label={edit ? 'Sửa nhật ký' : 'Viết nhật ký'}>
    <div className="row"><b style={{ flex: 1 }}>{edit ? 'Sửa nhật ký' : 'Viết nhật ký'}</b><button className="pill" style={{ flex: 'none' }} onClick={onClose} disabled={busy}>Đóng</button></div>
    <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label className="s">Ngày<input type="date" max={today} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
      <input placeholder="Tiêu đề" value={f.title} maxLength={120} onChange={e => setF({ ...f, title: e.target.value })} aria-label="Tiêu đề" />
      <textarea rows={6} placeholder="Hôm nay có gì vui…" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} aria-label="Nội dung" />
      <label className="row" style={{ flex: 'none', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" style={{ flex: 'none', width: 24, height: 24 }} checked={f.priv} onChange={e => setF({ ...f, priv: e.target.checked })} />
        <span className="s" style={{ flex: 1 }}>🔒 Chỉ mình tôi xem (người ấy không thấy bài và ảnh này)</span></label>
      <div className="row" style={{ flexWrap: 'wrap' }}>{MOOD.map(m => <button key={m} className={`pill ${f.mood === m ? 'on' : ''}`} style={{ fontSize: 22 }} onClick={() => setF({ ...f, mood: m })} aria-label={`Tâm trạng ${m}`} aria-pressed={f.mood === m}>{m}</button>)}</div>
    </div>

    <div className="k" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b>Ảnh ({total}/{DIARY_MAX_PHOTOS})</b>
      <div className="s">Ảnh ≤ 15 MB, tự nén.</div>
      <input type="file" accept="image/*" multiple disabled={busy || check || total >= DIARY_MAX_PHOTOS} onChange={e => { onFiles(e.target.files); e.target.value = '' }} aria-label="Chọn ảnh" />
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

    {(moments.length > 0 || plans.length > 0 || f.moment || f.plan) && <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b>Gắn với…</b>
      <label className="s">Khoảnh khắc
        <select style={{ maxWidth: '100%', width: '100%', marginTop: 6 }} value={f.moment} onChange={e => setF({ ...f, moment: e.target.value })}>
          <option value="">Không gắn khoảnh khắc</option>
          {f.moment && !moments.some(m => m.id === f.moment) && <option value={f.moment}>Khoảnh khắc đã gắn trước đó</option>}
          {moments.map(m => <option key={m.id} value={m.id}>{new Date(m.taken_on).toLocaleDateString('vi-VN')} · {m.title}</option>)}</select></label>
      <label className="s">Kế hoạch
        <select style={{ maxWidth: '100%', width: '100%', marginTop: 6 }} value={f.plan} onChange={e => setF({ ...f, plan: e.target.value })}>
          <option value="">Không gắn kế hoạch</option>
          {f.plan && !plans.some(p => p.id === f.plan) && <option value={f.plan}>Kế hoạch đã gắn trước đó</option>}
          {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    </div>}

    <button className="btn" onClick={save} disabled={busy || check}>{busy ? 'Đang lưu…' : errCount ? `Thử lại ${errCount} ảnh lỗi` : edit ? 'Lưu thay đổi' : 'Lưu nhật ký'}</button>
    {errCount > 0 && !busy && <button className="pill" onClick={onDone}>Để vậy, đóng lại</button>}
  </div>
}
