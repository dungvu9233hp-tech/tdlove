'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'
import { MAX_FILES, MAX_IMG, MAX_VIDEO, MAX_VIDEO_SEC, MB, TAGS, TAG_EMOJI, localDay, probeVideo, processImage, readExif, reverse, sign, uploadBlob } from '@/lib/media'
import PlacePicker from '@/components/PlacePicker'

type Item = { id: string; file: File; kind: 'image' | 'video'; url: string; status: 'ready' | 'up' | 'done' | 'err'; p: number; err?: string; meta: any }
const uid = () => crypto.randomUUID()

// Tạo mới hoặc sửa một Moment (MOM-01, MOM-02, MOM-03, MOM-05, MOM-06, MOM-11)
export default function MomentForm({ space, moment, plans, albums, onClose, onDone, onAlbumCreated }: {
  space: any; moment?: any; plans: any[]; albums: any[]; onClose: () => void; onDone: () => void; onAlbumCreated: (a: any) => void
}) {
  const edit = !!moment
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({
    title: moment?.title ?? '', desc: moment?.description ?? '', date: moment?.taken_on ?? localDay(new Date().toISOString()),
    place: moment?.place ?? '', lat: moment?.lat ?? null as number | null, lng: moment?.lng ?? null as number | null,
    tags: (moment?.tags ?? []) as string[], plan: (moment?.plan_id ?? '') as string,
  })
  const [albumIds, setAlbumIds] = useState<string[]>(moment?.albumIds ?? [])
  const [items, setItems] = useState<Item[]>([])
  const [old, setOld] = useState<any[]>((moment?.media ?? []).slice().sort((a: any, b: any) => a.sort - b.sort))
  const [oldUrl, setOldUrl] = useState<Record<string, string>>({})
  const [gone, setGone] = useState<string[]>([])
  const [notes, setNotes] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [check, setCheck] = useState(false)
  const [pick, setPick] = useState(false); const [tag, setTag] = useState(''); const [alb, setAlb] = useState('')
  const savedId = useRef<string | null>(moment?.id ?? null)
  const synced = useRef<string[]>(moment?.albumIds ?? [])   // album đã ghi vào DB (để thử lại không ghi trùng)
  const touched = useRef({ date: edit, place: edit })
  const itemsRef = useRef<Item[]>([]); itemsRef.current = items
  const total = old.length - gone.length + items.length

  useEffect(() => { sign(old.map((m: any) => m.thumb_path ?? (m.kind === 'image' ? m.path : null))).then(setOldUrl) }, [old])
  useEffect(() => () => { itemsRef.current.forEach(i => URL.revokeObjectURL(i.url)) }, [])
  useEffect(() => {   // đang tải lên thì cảnh báo khi người dùng định rời trang
    if (!busy) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [busy])

  const patch = (id: string, p: Partial<Item>) => setItems(a => a.map(x => x.id === id ? { ...x, ...p } : x))

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []); if (!files.length) return
    setCheck(true); const msg: string[] = [], add: Item[] = []
    let room = MAX_FILES - total
    for (const file of files) {
      if (room <= 0) { msg.push(`${file.name}: đã đủ ${MAX_FILES} tệp`); continue }
      const video = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name)
      if (!video && !file.type.startsWith('image/')) { msg.push(`${file.name}: không phải ảnh hoặc video`); continue }
      if (!video && file.size > MAX_IMG) { msg.push(`${file.name}: ảnh lớn hơn 15 MB (${MB(file.size)})`); continue }
      if (video && file.size > MAX_VIDEO) { msg.push(`${file.name}: video lớn hơn ${MB(MAX_VIDEO)} (${MB(file.size)})`); continue }
      try {
        let meta: any = {}
        if (video) {
          const v = await probeVideo(file)
          if (v.duration > MAX_VIDEO_SEC) { msg.push(`${file.name}: video dài ${Math.round(v.duration)} giây, tối đa ${MAX_VIDEO_SEC} giây`); continue }
          meta = v
          add.push({ id: uid(), file, kind: 'video', url: v.poster ? URL.createObjectURL(v.poster) : '', status: 'ready', p: 0, meta })
        } else {
          meta = await readExif(file)
          add.push({ id: uid(), file, kind: 'image', url: URL.createObjectURL(file), status: 'ready', p: 0, meta })
        }
        room--
      } catch (e: any) { msg.push(`${file.name}: ${e?.message ?? 'không đọc được'}`) }
    }
    setItems(a => [...a, ...add]); setNotes(msg); setCheck(false)
    // MOM-01: lấy ngày và vị trí từ EXIF của ảnh đầu tiên có thông tin, nếu người dùng chưa tự nhập
    const ex = add.find(i => i.meta.taken_at || i.meta.lat != null)
    if (ex) {
      if (!touched.current.date && ex.meta.taken_at) setF(x => ({ ...x, date: localDay(ex.meta.taken_at) }))
      if (!touched.current.place && f.lat == null && ex.meta.lat != null) {
        const { lat, lng } = ex.meta; setF(x => ({ ...x, lat, lng }))
        reverse(lat, lng).then(n => { if (n && !touched.current.place) setF(x => ({ ...x, place: x.place || n })) })
      }
    }
  }

  async function uploadOne(it: Item, sort: number) {
    patch(it.id, { status: 'up', p: 0, err: undefined })
    const base = `${space.id}/${uid()}`, made: string[] = []
    try {
      let row: any
      if (it.kind === 'image') {
        const { full, thumb, width, height } = await processImage(it.file)
        await uploadBlob(`${base}.jpg`, full, 'image/jpeg', p => patch(it.id, { p: Math.round(p * 0.9) })); made.push(`${base}.jpg`)
        await uploadBlob(`${base}-t.jpg`, thumb, 'image/jpeg'); made.push(`${base}-t.jpg`)
        row = { kind: 'image', path: `${base}.jpg`, thumb_path: `${base}-t.jpg`, size: full.size, width, height, taken_at: it.meta.taken_at ?? null, lat: it.meta.lat ?? null, lng: it.meta.lng ?? null }
      } else {
        const ext = (it.file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '')
        const ct = it.file.type || (ext === 'mov' ? 'video/quicktime' : 'video/mp4')
        let thumb: string | null = null
        if (it.meta.poster) { await uploadBlob(`${base}-t.jpg`, it.meta.poster, 'image/jpeg'); made.push(`${base}-t.jpg`); thumb = `${base}-t.jpg` }
        await uploadBlob(`${base}.${ext}`, it.file, ct, p => patch(it.id, { p })); made.push(`${base}.${ext}`)
        row = { kind: 'video', path: `${base}.${ext}`, thumb_path: thumb, size: it.file.size, width: it.meta.width || null, height: it.meta.height || null, duration: it.meta.duration || null }
      }
      const { error } = await sb.from('media').insert({ ...row, moment_id: savedId.current, space_id: space.id, sort })
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
    if (!f.title.trim()) return alert('Hãy đặt tiêu đề cho khoảnh khắc nhé')
    setBusy(true)
    try {
      const body = { title: f.title.trim(), description: f.desc.trim() || null, taken_on: f.date || today, place: f.place.trim() || null, lat: f.lat, lng: f.lng, tags: f.tags, plan_id: f.plan || null }
      if (savedId.current) {
        const { error } = await sb.from('moments').update(body).eq('id', savedId.current)
        if (error) return alert('Không lưu được khoảnh khắc: ' + error.message)
      } else {
        const { data, error } = await sb.from('moments').insert({ ...body, space_id: space.id }).select('id').single()
        if (error || !data) return alert('Không lưu được khoảnh khắc: ' + (error?.message ?? ''))
        savedId.current = data.id
      }
      const id = savedId.current!
      // album
      const prevSync = synced.current
      const del = prevSync.filter((a: string) => !albumIds.includes(a)), add = albumIds.filter(a => !prevSync.includes(a))
      if (del.length) await sb.from('album_moments').delete().eq('moment_id', id).in('album_id', del)
      if (add.length) await sb.from('album_moments').insert(add.map(a => ({ album_id: a, moment_id: id, space_id: space.id })))
      synced.current = albumIds
      // xóa tệp cũ đã bỏ
      if (gone.length) {
        const rm = old.filter((m: any) => gone.includes(m.id))
        const { error } = await sb.from('media').delete().in('id', gone)
        if (!error) { sb.storage.from('media').remove(rm.flatMap((m: any) => [m.path, m.thumb_path].filter(Boolean))); setOld(o => o.filter((m: any) => !gone.includes(m.id))); setGone([]) }
      }
      // tải tệp mới lên, lần lượt từng tệp, tệp nào xong rồi thì bỏ qua (cho phép thử lại tệp lỗi)
      let sort = Math.max(-1, ...old.map((m: any) => m.sort)) + 1, fail = 0
      for (const it of itemsRef.current) {
        if (it.status === 'done') continue
        if (!await uploadOne(it, sort++)) fail++
      }
      if (fail) { setNotes([`${fail} tệp chưa tải lên được. Khoảnh khắc đã được lưu; bấm lại nút bên dưới để thử lại các tệp lỗi.`]); return }
      onDone()
    } finally { setBusy(false) }
  }

  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]
  const addTag = () => { const t = tag.trim().slice(0, 20); if (t && !f.tags.includes(t) && f.tags.length < 6) setF({ ...f, tags: [...f.tags, t] }); setTag('') }
  const addAlbum = async () => {
    const n = alb.trim(); if (!n) return
    const { data, error } = await sb.from('albums').insert({ name: n, space_id: space.id }).select('*').single()
    if (error || !data) return alert('Không tạo được album: ' + (error?.message ?? ''))
    onAlbumCreated(data); setAlbumIds(a => [...a, data.id]); setAlb('')
  }
  const allTags = useMemo(() => Array.from(new Set([...TAGS, ...f.tags])), [f.tags])
  const errCount = items.filter(i => i.status === 'err').length
  const doneN = items.filter(i => i.status === 'done').length

  return <div className="sheet" role="dialog" aria-label={edit ? 'Sửa khoảnh khắc' : 'Khoảnh khắc mới'}>
    <div className="row"><b style={{ flex: 1 }}>{edit ? 'Sửa khoảnh khắc' : 'Khoảnh khắc mới'}</b><button className="pill" style={{ flex: 'none' }} onClick={onClose} disabled={busy}>Đóng</button></div>
    <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input placeholder="Tiêu đề, ví dụ: Chiều ở Hồ Tây" value={f.title} maxLength={120} onChange={e => setF({ ...f, title: e.target.value })} aria-label="Tiêu đề" />
      <textarea rows={3} placeholder="Kể một chút về hôm đó…" value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} aria-label="Mô tả" />
      <label className="s">Ngày<input type="date" max={today} value={f.date} onChange={e => { touched.current.date = true; setF({ ...f, date: e.target.value }) }} /></label>
    </div>

    <div className="k" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b>Địa điểm</b>
      <input placeholder="Tên địa điểm" value={f.place} onChange={e => { touched.current.place = true; setF({ ...f, place: e.target.value }) }} aria-label="Tên địa điểm" />
      <div className="row"><button className="pill" onClick={() => setPick(true)}>{f.lat != null ? 'Đổi trên bản đồ' : 'Chọn trên bản đồ'}</button>
        {f.lat != null && <button className="pill" onClick={() => setF({ ...f, lat: null, lng: null })}>Bỏ ghim</button>}</div>
      {f.lat != null && <div className="s">Đã ghim: {f.lat.toFixed(4)}, {f.lng!.toFixed(4)}</div>}
    </div>

    <div className="k" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b>Cảm xúc</b>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{allTags.map(t => <button key={t} className="chip" aria-pressed={f.tags.includes(t)} onClick={() => setF({ ...f, tags: f.tags.length >= 6 && !f.tags.includes(t) ? f.tags : toggle(f.tags, t) })}>{TAG_EMOJI[t] ?? '🏷️'} {t}</button>)}</div>
      <div className="row"><input placeholder="Thẻ riêng…" value={tag} maxLength={20} onChange={e => setTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} aria-label="Thẻ riêng" /><button className="pill" style={{ flex: 'none' }} onClick={addTag}>Thêm</button></div>
    </div>

    <div className="k" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b>Ảnh và video ({total}/{MAX_FILES})</b>
      <div className="s">Ảnh ≤ 15 MB, tự nén. Video ≤ {MB(MAX_VIDEO)} và ≤ 3 phút.</div>
      <input type="file" accept="image/*,video/*" multiple disabled={busy || check || total >= MAX_FILES} onChange={e => { onFiles(e.target.files); e.target.value = '' }} aria-label="Chọn ảnh hoặc video" />
      {check && <div className="s">Đang kiểm tra tệp…</div>}
      {(old.length > 0 || items.length > 0) && <div className="grid">
        {old.filter((m: any) => !gone.includes(m.id)).map((m: any) => <div key={m.id} className="th">
          {oldUrl[m.thumb_path ?? m.path] ? <img src={oldUrl[m.thumb_path ?? m.path]} alt="" /> : m.kind === 'video' ? '🎬' : '🖼️'}
          {m.kind === 'video' && oldUrl[m.thumb_path] && <span className="st">🎬 video</span>}
          <button className="x" disabled={busy} onClick={() => setGone(g => [...g, m.id])} aria-label="Gỡ tệp này">×</button></div>)}
        {items.map(i => <div key={i.id} className="th">
          {i.url ? <img src={i.url} alt="" /> : '🎬'}
          {i.status === 'up' && <span className="st">{i.p}%</span>}
          {i.status === 'done' && <span className="st">Xong ✓</span>}
          {i.status === 'err' && <span className="st" style={{ color: '#B00020' }}>Lỗi</span>}
          {i.status !== 'done' && <button className="x" disabled={busy} onClick={() => { URL.revokeObjectURL(i.url); setItems(a => a.filter(x => x.id !== i.id)) }} aria-label="Gỡ tệp này">×</button>}</div>)}
      </div>}
      {items.filter(i => i.status === 'err').map(i => <div key={i.id} className="s" role="alert">{i.file.name}: {i.err}</div>)}
      {notes.map((n, k) => <div key={k} className="s" role="alert">{n}</div>)}
      {busy && items.length > 0 && <><div className="bar" aria-hidden><i style={{ width: `${Math.round(items.reduce((s, i) => s + (i.status === 'done' ? 100 : i.p), 0) / items.length)}%` }} /></div><div className="s">Đã xong {doneN}/{items.length} tệp. Mất mạng thì app tự chờ rồi tải tiếp.</div></>}
    </div>

    {plans.length > 0 && <label className="k li s" style={{ display: 'block' }}>Đã đi cùng kế hoạch nào?
      <select style={{ maxWidth: '100%', width: '100%', marginTop: 6 }} value={f.plan} onChange={e => setF({ ...f, plan: e.target.value })}>
        <option value="">Không gắn kế hoạch</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}

    <div className="k" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b>Album</b>
      {albums.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{albums.map(a => <button key={a.id} className="chip" aria-pressed={albumIds.includes(a.id)} onClick={() => setAlbumIds(toggle(albumIds, a.id))}>📁 {a.name}</button>)}</div>}
      <div className="row"><input placeholder="Album mới…" value={alb} maxLength={80} onChange={e => setAlb(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAlbum()} aria-label="Tên album mới" /><button className="pill" style={{ flex: 'none' }} onClick={addAlbum}>Tạo</button></div>
    </div>

    <button className="btn" onClick={save} disabled={busy || check}>{busy ? 'Đang lưu…' : errCount ? `Thử lại ${errCount} tệp lỗi` : edit ? 'Lưu thay đổi' : 'Đăng khoảnh khắc'}</button>
    {errCount > 0 && !busy && <button className="pill" onClick={onDone}>Để vậy, đóng lại</button>}
    {pick && <PlacePicker value={f.lat != null ? { lat: f.lat, lng: f.lng! } : null} onClose={() => setPick(false)} onPick={p => { touched.current.place = true; setF({ ...f, lat: p.lat, lng: p.lng, place: p.name || f.place }); setPick(false) }} />}
  </div>
}
