'use client'
import './gif.css'
import { useEffect, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'
import { ok } from '@/lib/util'
import { GIF_TYPES, GIPHY_KEY, MAX_GIF, giphySearch, gifSrc, signGif, type GifRef, type GiphyHit } from '@/lib/gif'

// Hiển thị một GIF trong tin nhắn hoặc bình luận. Link ký hết hạn thì tự xin link mới một lần.
export function GifImg({ g, size = 'md' }: { g: GifRef; size?: 'sm' | 'md' }) {
  const key = g.path ?? g.url ?? ''
  const [src, setSrc] = useState<string | null | undefined>(undefined)   // undefined: đang tải, null: không tải được
  const retried = useRef(false)
  useEffect(() => {
    let off = false; retried.current = false; setSrc(undefined)
    gifSrc(g).then(u => { if (!off) setSrc(u) })
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (src === undefined) return <span className="gif gif-load s" role="status">Đang tải GIF…</span>
  if (!src) return <span className="gif gif-load s">Không tải được GIF</span>
  return <img className={`gif ${size}`} src={src} alt="GIF" loading="lazy" onError={() => {
    if (!g.path || retried.current) return setSrc(null)
    retried.current = true; gifSrc(g, true).then(u => setSrc(u))
  }} />
}

const MAX_BATCH = 5

// Bảng chọn GIF dùng chung cho Chat và bình luận: bộ sưu tập chung của hai người, tải GIF lên, và (nếu có khóa) tìm trên GIPHY.
export function GifPanel({ spaceId, meId, onPick, onClose }: { spaceId: string; meId: string; onPick: (g: GifRef) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'mine' | 'find'>('mine')
  const [lib, setLib] = useState<{ id: string; path: string | null; url: string | null }[] | null>(null)
  const [srcs, setSrcs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('')
  const [q, setQ] = useState(''); const [hits, setHits] = useState<GiphyHit[] | null>(null); const [finding, setFinding] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  async function loadLib() {
    const { data, error } = await sb.from('gifs').select('id,path,url').order('created_at', { ascending: false }).limit(120)
    if (error) { setErr('Chưa tải được bộ sưu tập GIF. Đã chạy supabase/phase25.sql chưa?'); return setLib([]) }
    setErr(''); setLib(data ?? [])
  }
  useEffect(() => { loadLib() }, [])
  // ký link cho các GIF tải lên (gộp thành một lần gọi); GIF giphy dùng thẳng link
  useEffect(() => {
    let off = false
    for (const x of lib ?? []) if (x.path && !srcs[x.id]) signGif(x.path).then(u => { if (u && !off) setSrcs(a => ({ ...a, [x.id]: u })) })
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib])

  // GIPHY: gõ xong 0,4 giây mới tìm; ô trống thì hiện GIF đang thịnh hành
  useEffect(() => {
    if (tab !== 'find' || !GIPHY_KEY) return
    const ac = new AbortController()
    const h = setTimeout(async () => {
      setFinding(true); setErr('')
      try { setHits(await giphySearch(q, ac.signal)) }
      catch (e: any) { if (e?.name !== 'AbortError') { setErr(e?.message ?? 'Không tìm được GIF'); setHits([]) } }
      finally { if (!ac.signal.aborted) setFinding(false) }
    }, q.trim() ? 400 : 0)
    return () => { clearTimeout(h); ac.abort() }
  }, [q, tab])

  async function upload(list: FileList | null) {
    const files = Array.from(list ?? []); if (file.current) file.current.value = ''
    if (!files.length) return
    if (files.length > MAX_BATCH) alert(`Mỗi lần chỉ tải tối đa ${MAX_BATCH} GIF, mình lấy ${MAX_BATCH} cái đầu nhé.`)
    for (const f of files.slice(0, MAX_BATCH)) {
      if (!GIF_TYPES.includes(f.type)) { alert(`${f.name}: chỉ nhận ảnh GIF hoặc WebP động`); continue }
      if (f.size > MAX_GIF) { alert(`${f.name}: lớn hơn ${MAX_GIF / 1048576} MB`); continue }
      setBusy(`Đang tải ${f.name}…`)
      const path = `${spaceId}/${meId}/${crypto.randomUUID()}.${f.type === 'image/webp' ? 'webp' : 'gif'}`
      const up = await sb.storage.from('gifs').upload(path, f, { contentType: f.type, upsert: false })
      if (up.error) { alert(`Không tải ${f.name} lên được: ${up.error.message}`); continue }
      const { data, error } = await sb.from('gifs').insert({ space_id: spaceId, path }).select('id,path,url').single()
      if (error || !data) { alert(`Không lưu được ${f.name}: ${error?.message ?? ''}`); continue }
      setLib(a => [data, ...(a ?? [])]); setTab('mine')
    }
    setBusy('')
  }

  async function remove(id: string) {
    if (!confirm('Gỡ GIF này khỏi bộ sưu tập chung? Tin nhắn và bình luận đã gửi vẫn giữ nguyên.')) return
    if (await ok(sb.from('gifs').delete().eq('id', id), 'Không gỡ được GIF')) setLib(a => (a ?? []).filter(x => x.id !== id))
  }
  async function save(h: GiphyHit) {
    const { error } = await sb.from('gifs').insert({ space_id: spaceId, url: h.url })
    if (error && error.code !== '23505') return alert('Không lưu được GIF: ' + error.message)   // 23505: đã có trong bộ sưu tập
    setBusy('Đã lưu vào bộ sưu tập'); setTimeout(() => setBusy(''), 1500); loadLib()
  }

  return <div className="k gifp" role="region" aria-label="Chọn GIF">
    <div className="row" style={{ gap: 6 }}>
      <b style={{ flex: 1 }}>GIF</b>
      <button className="pill" style={{ flex: 'none' }} onClick={onClose}>Đóng</button>
    </div>
    <div className="gifp-tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'mine'} className={`pill ${tab === 'mine' ? 'on' : ''}`} onClick={() => setTab('mine')}>💗 Của tụi mình</button>
      {GIPHY_KEY && <button role="tab" aria-selected={tab === 'find'} className={`pill ${tab === 'find' ? 'on' : ''}`} onClick={() => setTab('find')}>🔎 Tìm GIF</button>}
      <label className="pill">＋ Tải GIF lên<input ref={file} type="file" accept="image/gif,image/webp" multiple hidden onChange={e => upload(e.target.files)} /></label>
    </div>
    {tab === 'find' && <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm GIF… (ví dụ: ôm, yêu, cười)" aria-label="Tìm GIF" />}
    {busy && <div className="s" role="status">{busy}</div>}
    {err && <div className="s" role="alert">{err}</div>}

    {tab === 'mine' && (lib === null ? <div className="s" role="status">Đang tải…</div>
      : !lib.length ? <div className="s">Chưa có GIF nào. Bấm “Tải GIF lên” để thêm GIF của hai đứa{GIPHY_KEY ? ', hoặc qua “Tìm GIF” rồi bấm ★ để lưu' : ''}.</div>
      : <div className="gifg">{lib.map(x => {
        const u = x.url ?? srcs[x.id]
        return <div key={x.id} className="gif-cell">
          <button className="gif-pick" onClick={() => onPick({ path: x.path, url: x.url })} aria-label="Gửi GIF này" disabled={!u}>{u ? <img src={u} alt="" loading="lazy" /> : <span className="s">…</span>}</button>
          <button className="gif-x" onClick={() => remove(x.id)} aria-label="Gỡ khỏi bộ sưu tập">×</button>
        </div>
      })}</div>)}

    {tab === 'find' && (finding && !hits ? <div className="s" role="status">Đang tìm…</div>
      : hits && !hits.length && !err ? <div className="s">Không thấy GIF nào khớp.</div>
      : <>
        <div className="gifg">{(hits ?? []).map(h => <div key={h.id} className="gif-cell">
          <button className="gif-pick" onClick={() => onPick({ url: h.url })} aria-label="Gửi GIF này"><img src={h.preview} alt="" loading="lazy" /></button>
          <button className="gif-x" onClick={() => save(h)} aria-label="Lưu vào bộ sưu tập">★</button>
        </div>)}</div>
        <div className="s" style={{ textAlign: 'right' }}>Powered by GIPHY</div>
      </>)}
  </div>
}
