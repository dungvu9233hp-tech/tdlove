'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BGS, CATS, FONT, FRAMES, STICKERS, fit, fitText, findHoles, loadImg, loadPhoto, render, slotToItem, uid, type Frame, type Item, type Sticker } from '@/lib/photobooth'

type Pic = { id: string; url: string; iw: number; ih: number }
type Drag = { t: 'move' | 'size' | 'rot' | 'pan'; id: string; sx: number; sy: number; it: Item }
const rad = (d: number) => d * Math.PI / 180

export default function Photobooth() {
  const [frame, setFrame] = useState<Frame>(FRAMES[1])
  const [items, setItems] = useState<Item[]>(() => FRAMES[1].slots.map(slotToItem))
  const [sel, setSel] = useState<string | null>(null)
  const [bg, setBg] = useState(BGS[0]); const [bgImg, setBgImg] = useState<string | null>(null); const [overlay, setOverlay] = useState<string | null>(null)
  const [pics, setPics] = useState<Pic[]>([]); const [pan, setPan] = useState(false); const [cat, setCat] = useState(CATS[0])
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [canShare, setCanShare] = useState(false)
  const [sc, setSc] = useState(0.4)
  const wrap = useRef<HTMLDivElement>(null); const stage = useRef<HTMLDivElement>(null); const drag = useRef<Drag | null>(null)
  const slotIn = useRef<HTMLInputElement>(null); const sel0 = useRef<string | null>(null)
  const cur = items.find(i => i.id === sel) ?? null

  useEffect(() => {
    const el = wrap.current; if (!el) return
    const ro = new ResizeObserver(() => setSc(Math.min(el.clientWidth, 520) / frame.W)); ro.observe(el); return () => ro.disconnect()
  }, [frame.W])
  useEffect(() => { setCanShare(typeof navigator.canShare === 'function') }, [])
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(''), 4000); return () => clearTimeout(t) } }, [msg])

  const upd = useCallback((id: string, p: Partial<Item>) => setItems(a => a.map(i => i.id === id ? { ...i, ...p } : i)), [])
  const pt = (e: { clientX: number; clientY: number }) => { const r = stage.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / sc, y: (e.clientY - r.top) / sc } }

  // ---- chọn frame: giữ ảnh đã chọn (theo thứ tự) và vật trang trí ----
  const pickFrame = (f: Frame) => {
    const have = items.filter(i => i.k === 'photo' && i.src), kx = f.W / frame.W, ky = f.H / frame.H
    const slots = f.slots.map(slotToItem).map((s, n) => have[n] ? { ...s, src: have[n].src, iw: have[n].iw, ih: have[n].ih } : s)
    const rest = items.filter(i => i.k !== 'photo').map(i => ({ ...i, x: i.x * kx, y: i.y * ky }))
    setFrame(f); setItems([...slots, ...rest]); setSel(null); setOverlay(f.overlay ?? null); setBgImg(null)
  }
  // ---- ảnh ----
  const fill = (id: string, p: Pic) => upd(id, { src: p.url, iw: p.iw, ih: p.ih, z: 1, ox: 0, oy: 0 })
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return; setBusy(true)
    try {
      const got: Pic[] = []; for (const f of Array.from(files)) { try { got.push(await loadPhoto(f)) } catch { setMsg(`Không đọc được ${f.name}`) } }
      setPics(a => [...a, ...got])
      setItems(a => { const q = [...got]; return a.map(i => i.k === 'photo' && !i.src && q.length ? (p => ({ ...i, src: p.url, iw: p.iw, ih: p.ih }))(q.shift()!) : i) })
    } finally { setBusy(false) }
  }
  const usePic = (p: Pic) => {
    const t = cur?.k === 'photo' ? cur : items.find(i => i.k === 'photo' && !i.src)
    if (t) fill(t.id, p); else setMsg('Chưa có ô ảnh trống. Bấm "+ Ô ảnh" hoặc chọn một ô để thay ảnh.')
  }
  const addSlot = () => { const w = frame.W * 0.5, it: Item = { ...slotToItem({ x: frame.W / 2 - w / 2, y: frame.H / 2 - w / 2, w, h: w, rd: 14 }) }; setItems(a => [...a, it]); setSel(it.id) }
  // ---- vật trang trí ----
  const addSticker = async (s: Sticker, at?: { x: number; y: number }) => {
    const im = await loadImg(s.src), h = s.w * im.naturalHeight / im.naturalWidth, j = () => (Math.random() - .5) * 60
    const it: Item = { id: uid(), k: 'sticker', src: s.src, x: at?.x ?? frame.W / 2 + j(), y: at?.y ?? frame.H / 2 + j(), w: s.w, h, r: 0 }
    setItems(a => [...a, it]); setSel(it.id); setPan(false)
  }
  const addText = () => { const it = fitText({ id: uid(), k: 'text', x: frame.W / 2, y: frame.H * 0.9, w: 0, h: 0, r: 0, text: 'Yêu em', fs: 90, color: '#C93C77' }); setItems(a => [...a, it]); setSel(it.id) }
  const hitSlot = (p: { x: number; y: number }) => [...items].reverse().find(i => {
    if (i.k !== 'photo') return false; const a = -rad(i.r), dx = p.x - i.x, dy = p.y - i.y
    return Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) <= i.w / 2 && Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) <= i.h / 2
  })
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); const p = pt(e), sid = e.dataTransfer.getData('text/sticker'), pid = e.dataTransfer.getData('text/pic')
    if (sid) { const s = STICKERS.find(x => x.id === sid); if (s) addSticker(s, p) }
    else if (pid) { const pic = pics.find(x => x.id === pid), t = hitSlot(p); if (pic && t) { fill(t.id, pic); setSel(t.id) } }
  }
  // ---- kéo / đổi cỡ / xoay / dịch ảnh bằng con trỏ (chuột + cảm ứng) ----
  const down = (e: React.PointerEvent, it: Item, t: Drag['t']) => {
    e.stopPropagation(); e.preventDefault(); stage.current!.setPointerCapture(e.pointerId)
    const p = pt(e); drag.current = { t: t === 'move' && pan && it.k === 'photo' && sel === it.id ? 'pan' : t, id: it.id, sx: p.x, sy: p.y, it }; setSel(it.id)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return; const p = pt(e), it = d.it, dx = p.x - d.sx, dy = p.y - d.sy
    if (d.t === 'move') upd(d.id, { x: it.x + dx, y: it.y + dy })
    else if (d.t === 'rot') upd(d.id, { r: Math.atan2(p.y - it.y, p.x - it.x) * 180 / Math.PI + 90 })
    else {
      const a = -rad(it.r), lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a)
      if (d.t === 'pan') { const f = fit({ ...it, ox: (it.ox ?? 0) + lx, oy: (it.oy ?? 0) + ly }); upd(d.id, { ox: f.ox, oy: f.oy }) }
      else if (it.k === 'photo') upd(d.id, { w: Math.max(100, it.w + 2 * lx), h: Math.max(100, it.h + 2 * ly) })
      else { const f = Math.hypot(p.x - it.x, p.y - it.y) / Math.max(1, Math.hypot(d.sx - it.x, d.sy - it.y))
        if (it.k === 'sticker') upd(d.id, { w: Math.max(30, it.w * f), h: Math.max(30, it.h * f) })
        else { const n = fitText({ ...it, fs: Math.max(20, Math.min(400, (it.fs ?? 90) * f)) }); upd(d.id, { fs: n.fs, w: n.w, h: n.h }) } }
    }
  }
  const up = () => { drag.current = null }
  // ---- thanh công cụ cho vật đang chọn ----
  const z = (to: 'front' | 'back') => cur && setItems(a => { const o = a.find(i => i.id === cur.id)!, r = a.filter(i => i.id !== cur.id); return to === 'front' ? [...r, o] : [o, ...r] })
  const dup = () => { if (!cur) return; const n = { ...cur, id: uid(), x: cur.x + 40, y: cur.y + 40 }; setItems(a => [...a, n]); setSel(n.id) }
  const del = () => { if (cur) { setItems(a => a.filter(i => i.id !== cur.id)); setSel(null) } }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel0.current && !(e.target as HTMLElement).closest('input,textarea')) del() }
    sel0.current = sel; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  // ---- frame PNG tự tải lên ----
  const onFrameFile = async (f?: File) => {
    if (!f) return; setBusy(true)
    try {
      const url = URL.createObjectURL(f), im = await loadImg(url), W = 1000, H = Math.round(W * im.naturalHeight / im.naturalWidth)
      const holes = findHoles(im, W, H), keep = items.filter(i => i.k !== 'photo')
      setFrame({ id: 'custom', name: 'Frame của bạn', W, H, slots: holes })
      if (holes.length) { setOverlay(url); setBgImg(null); setItems([...holes.map(slotToItem), ...keep]); setMsg(`Tìm thấy ${holes.length} ô ảnh trong frame, ảnh sẽ tự phủ kín từng ô.`) }
      else { setOverlay(null); setBgImg(url); setItems(keep); setMsg('Frame không có lỗ trong suốt nên được dùng làm hình nền. Bấm "+ Ô ảnh" để tự đặt ô ảnh.') }
      setSel(null)
    } catch { setMsg('Không đọc được frame này.') } finally { setBusy(false) }
  }
  const out = async () => { setBusy(true); try { return await render(frame.W, frame.H, bg, bgImg, overlay, items) } finally { setBusy(false) } }
  const name = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, '0'); return `tdlove-photobooth-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.png` }
  const save = async () => { const b = await out(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name(); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) }
  const share = async () => { const b = await out(), f = new File([b], name(), { type: 'image/png' }); try { await navigator.share({ files: [f] }) } catch { /* người dùng huỷ */ } }

  const hs = 30 / sc  // kích thước nút kéo luôn ~30px trên màn hình
  const photos = useMemo(() => items.filter(i => i.k === 'photo'), [items]), rest = useMemo(() => items.filter(i => i.k !== 'photo'), [items])
  const node = (it: Item) => {
    const on = it.id === sel, f = it.k === 'photo' ? fit(it) : null, card = !!f && (f.bd > 0 || f.bb > 0)
    return <div key={it.id} className={`pb-it${on ? ' on' : ''}`} onPointerDown={e => down(e, it, 'move')} onDoubleClick={() => it.k === 'photo' && slotIn.current?.click()}
      style={{ left: it.x - it.w / 2, top: it.y - it.h / 2, width: it.w, height: it.h, transform: `rotate(${it.r}deg)`, outlineWidth: 3 / sc, cursor: on && pan && it.k === 'photo' ? 'grab' : 'move',
        ...(card ? { background: '#fff', boxShadow: '0 6px 18px rgba(74,29,53,.25)', borderRadius: it.rd } : {}) }}>
      {f && <div className="pb-ar" style={{ left: f.bd, top: f.bd, width: f.aw, height: f.ah, borderRadius: card ? 0 : it.rd }}>
        {it.src ? <img src={it.src} alt="" draggable={false} style={{ left: f.aw / 2 - f.dw / 2 + f.ox, top: f.ah / 2 - f.dh / 2 + f.oy, width: f.dw, height: f.dh }} />
          : <span style={{ fontSize: Math.min(f.aw, f.ah) * 0.16 }}>＋ ảnh</span>}
      </div>}
      {it.k === 'sticker' && <img src={it.src} alt="" draggable={false} style={{ width: '100%', height: '100%' }} />}
      {it.k === 'text' && <span className="pb-tx" style={{ fontSize: it.fs, color: it.color, fontFamily: FONT }}>{it.text}</span>}
      {on && <>
        <i className="pb-h pb-rot" style={{ width: hs, height: hs, top: -hs * 1.7, left: it.w / 2 - hs / 2 }} onPointerDown={e => down(e, it, 'rot')} />
        <i className="pb-h pb-sz" style={{ width: hs, height: hs, right: -hs / 2, bottom: -hs / 2 }} onPointerDown={e => down(e, it, 'size')} />
      </>}
    </div>
  }

  return <div className="pb">
    <div className="k pb-box"><b>1. Chọn frame</b>
      <div className="pb-row">{FRAMES.map(f => <button key={f.id} className={`pill${frame.id === f.id ? ' on' : ''}`} onClick={() => pickFrame(f)}>{f.name}</button>)}
        <label className="pill">Frame PNG của mình<input type="file" accept="image/*" hidden onChange={e => { onFrameFile(e.target.files?.[0]); e.target.value = '' }} /></label></div>
      <div className="pb-row">{BGS.map(c => <button key={c} aria-label={`Nền ${c}`} className={`pb-sw${bg === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setBg(c)} />)}
        <input type="color" aria-label="Chọn màu nền" value={bg} onChange={e => setBg(e.target.value)} className="pb-sw" /></div></div>

    <div className="k pb-box"><b>2. Ảnh của hai đứa</b>
      <div className="s">Chọn nhiều ảnh một lúc, app tự điền vào các ô trống. Ảnh to nhỏ, dọc hay ngang đều tự phủ kín ô; kéo ảnh bên trong ô để chọn phần muốn giữ.</div>
      <div className="pb-row"><label className="pill on">＋ Thêm ảnh<input type="file" accept="image/*" multiple hidden onChange={e => { addPhotos(e.target.files); e.target.value = '' }} /></label>
        <button className="pill" onClick={addSlot}>+ Ô ảnh</button></div>
      {pics.length > 0 && <div className="pb-row pb-tray">{pics.map(p => <img key={p.id} src={p.url} alt="" draggable onDragStart={e => e.dataTransfer.setData('text/pic', p.id)} onClick={() => usePic(p)} />)}</div>}</div>

    <div className="pb-stagewrap" ref={wrap}>
      <div className="pb-stage" ref={stage} style={{ width: frame.W * sc, height: frame.H * sc, background: bg }} onDragOver={e => e.preventDefault()} onDrop={onDrop}
        onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerDown={() => setSel(null)}>
        <div className="pb-in" style={{ width: frame.W, height: frame.H, transform: `scale(${sc})`, backgroundImage: bgImg ? `url(${bgImg})` : undefined }}>
          {photos.map(node)}
          {overlay && <img src={overlay} alt="" draggable={false} className="pb-ov" />}
          {rest.map(node)}
        </div>
      </div>
    </div>

    {cur && <div className="k pb-box pb-tool">
      <div className="pb-row">
        {cur.k === 'photo' && <>
          <button className="pill" onClick={() => slotIn.current?.click()}>Chọn ảnh</button>
          {cur.src && <button className={`pill${pan ? ' on' : ''}`} onClick={() => setPan(p => !p)}>{pan ? '✋ Đang dịch ảnh' : '✋ Dịch ảnh'}</button>}
          {cur.src && <button className="pill" onClick={() => upd(cur.id, { src: undefined })}>Gỡ ảnh</button>}
          <button className="pill" onClick={() => upd(cur.id, (cur.bd ?? 0) > 0 ? { bd: 0, bb: 0, rd: 14 } : { bd: 24, bb: 80, rd: 6 })}>Viền polaroid</button>
        </>}
        {cur.k === 'text' && <>
          <input className="pb-txt" value={cur.text} maxLength={40} aria-label="Nội dung chữ" onChange={e => { const n = fitText({ ...cur, text: e.target.value }); upd(cur.id, { text: n.text, w: n.w, h: n.h }) }} />
          <input type="color" className="pb-sw" aria-label="Màu chữ" value={cur.color} onChange={e => upd(cur.id, { color: e.target.value })} />
        </>}
        <button className="pill" onClick={dup}>Nhân đôi</button><button className="pill" onClick={() => z('front')}>Lên trên</button><button className="pill" onClick={() => z('back')}>Xuống dưới</button>
        <button className="pill" onClick={del}>Xóa</button>
      </div>
      {cur.k === 'photo' && cur.src && <label className="pb-zoom">Phóng to ảnh<input type="range" min={1} max={3} step={0.01} value={cur.z ?? 1} onChange={e => { const f = fit({ ...cur, z: +e.target.value }); upd(cur.id, { z: +e.target.value, ox: f.ox, oy: f.oy }) }} /></label>}
    </div>}
    <input ref={slotIn} type="file" accept="image/*" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (f && cur?.k === 'photo') { const p = await loadPhoto(f); setPics(a => [...a, p]); fill(cur.id, p) } }} />

    <div className="k pb-box"><b>3. Trang trí</b>
      <div className="s">Bấm hoặc kéo thả vào khung. Chọn vật rồi kéo nút tròn ở góc để đổi cỡ, nút ở trên để xoay.</div>
      <div className="pb-row">{CATS.map(k => <button key={k} className={`pill${cat === k ? ' on' : ''}`} onClick={() => setCat(k)}>{k}</button>)}</div>
      <div className="pb-stk">{STICKERS.filter(s => cat === CATS[0] || s.cat === cat).map(s => <button key={s.id} title={s.name} aria-label={s.name} draggable onDragStart={e => e.dataTransfer.setData('text/sticker', s.id)} onClick={() => addSticker(s)}><img src={s.src} alt="" loading="lazy" decoding="async" draggable={false} /></button>)}</div>
      <div className="pb-row"><button className="pill" onClick={addText}>＋ Chữ</button></div></div>

    <div className="pb-row pb-act"><button className="btn" disabled={busy} onClick={save}>{busy ? 'Đang xử lý…' : 'Lưu ảnh photobooth'}</button>
      {canShare && <button className="btn ghost" disabled={busy} onClick={share}>Chia sẻ</button>}</div>
    {msg && <div className="k pk s" role="status">{msg}</div>}
  </div>
}
