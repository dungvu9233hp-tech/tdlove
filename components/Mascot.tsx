'use client'
// Linh vật Shiba 3D trôi nổi ở mép màn hình Trang chủ (kiểu linh vật TikTok): không có nền riêng, lơ lửng nhấp nhô.
// Kéo để đổi chỗ (thả ra tự hít vào mép trái/phải, nhớ vị trí theo từng người), bấm để xoa đầu.
// Thỉnh thoảng nói nhắc việc đang chờ hoặc hỏi han. Tên, vị trí và việc tắt/bật nhắc nhở lưu theo từng người ngay trên máy.
// Chuyển động tự tắt khi máy bật "giảm chuyển động".
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import './mascot.css'
import { casual, pick, POKE, urgent, type Chip, type Say, type TalkCtx } from '@/lib/mascotTalk'
import type { MascotHandle } from '@/lib/mascot3d'

type Props = Omit<TalkCtx, 'hour' | 'name' | 'partner' | 'hasPartner'> & { uid: string; name: string; partnerName?: string | null }
type Dock = { side: 'l' | 'r'; by: number }       // by = khoảng cách từ đáy khung app lên đến đáy linh vật (px)
const SIZE = 124, EDGE = 4, DEF: Dock = { side: 'r', by: 104 }
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { } },
}
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

export default function Mascot(p: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null), h = useRef<MascotHandle | null>(null)
  const [bad, setBad] = useState(false), [ready, setReady] = useState(false)
  const [msg, setMsg] = useState<(Say & { menu?: boolean }) | null>(null)
  const [hearts, setHearts] = useState<number[]>([])
  const [pname, setPname] = useState('Shiba'), [quiet, setQuiet] = useState(false)
  const [dock, setDock] = useState<Dock>(DEF)
  const kName = `tdlove.mascot.name.${p.uid}`, kQuiet = `tdlove.mascot.quiet.${p.uid}`, kDock = `tdlove.mascot.dock.${p.uid}`
  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.p'))
    setPname(store.get(kName) || 'Shiba'); setQuiet(store.get(kQuiet) === '1')
    try { const d = JSON.parse(store.get(kDock) || 'null'); if (d && (d.side === 'l' || d.side === 'r') && Number.isFinite(d.by)) setDock(d) } catch { }
  }, [kName, kQuiet, kDock])

  // Luôn đọc dữ liệu mới nhất của Trang chủ mà không phải dựng lại bộ đếm giờ
  const ctx = useRef<TalkCtx>(null as any)
  ctx.current = { ...p, name: p.name, partner: p.partnerName || 'người ấy', hasPartner: !!p.partnerName, hour: new Date().getHours() }
  const reduced = useRef(false), last = useRef<string | undefined>(undefined), hideT = useRef<any>(undefined), quietRef = useRef(false)
  quietRef.current = quiet
  const dockRef = useRef(dock); dockRef.current = dock

  // Dựng 3D (tải three.js khi cần). Chỉ dựng khi đã có khung chứa.
  useEffect(() => {
    const c = cv.current; if (!c || !host) return
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let dead = false
    import('@/lib/mascot3d').then(m => m.mountMascot(c, { calm: reduced.current })).then(hd => {
      if (dead) { hd.dispose(); return }
      h.current = hd; hd.face(dockRef.current.side === 'r' ? -1 : 1); setReady(true)
    }).catch(e => { console.error('Mascot', e); if (!dead) setBad(true) })
    return () => { dead = true; h.current?.dispose(); h.current = null; setReady(false) }
  }, [host])
  useEffect(() => { h.current?.face(dock.side === 'r' ? -1 : 1) }, [dock.side, ready])

  const hide = useCallback(() => { clearTimeout(hideT.current); setMsg(null); h.current?.talk(false) }, [])
  const show = useCallback((s: Say & { menu?: boolean }, ms?: number) => {
    clearTimeout(hideT.current); setMsg(s); last.current = s.id
    h.current?.talk(true); setTimeout(() => h.current?.talk(false), 1800)
    hideT.current = setTimeout(hide, ms ?? (s.chips ? 16000 : s.href ? 12000 : 8000))
  }, [hide])
  useEffect(() => () => clearTimeout(hideT.current), [])

  // Nhắc nhở / hỏi han: câu đầu sau ~2 giây, sau đó 45 đến 90 giây một lần, chỉ khi đang xem trang
  useEffect(() => {
    let t: any
    const talk = (first: boolean) => {
      if (!document.hidden && !quietRef.current) {
        const c = { ...ctx.current, hour: new Date().getHours() }
        const u = urgent(c)
        const s = first && u.length ? pick(u, last.current) : pick([...u, ...casual(c)], last.current)
        if (s) { h.current?.act(Math.random() < 0.5 ? 'wag' : 'hop'); show(s) }
      }
      t = setTimeout(() => talk(false), 45000 + Math.random() * 45000)
    }
    t = setTimeout(() => talk(true), 2200)
    return () => clearTimeout(t)
  }, [show])

  // Nhìn theo ngón tay / con trỏ khi nó ở gần
  useEffect(() => {
    if (reduced.current) return
    const move = (e: PointerEvent) => {
      const c = cv.current; if (!c || !h.current || drag.current) return
      const r = c.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.4
      const dx = (e.clientX - cx) / 260, dy = (e.clientY - cy) / 260
      if (Math.abs(dx) < 1.4 && Math.abs(dy) < 1.4) h.current.look(clamp(dx, -1, 1), clamp(dy, -1, 1)); else h.current.unlook()
    }
    const out = () => h.current?.unlook()
    window.addEventListener('pointermove', move, { passive: true }); window.addEventListener('pointerleave', out)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerleave', out) }
  }, [])

  // Giữ linh vật trong khung khi cửa sổ đổi cỡ
  const place = useCallback((d: Dock) => {
    const el = box.current, hs = host; if (!el || !hs) return d
    const max = Math.max(0, hs.clientHeight - SIZE - EDGE)
    return { side: d.side, by: clamp(d.by, EDGE, max) }
  }, [host])
  useEffect(() => {
    const on = () => setDock(d => { const n = place(d); return n.by === d.by ? d : n })
    window.addEventListener('resize', on); on()
    return () => window.removeEventListener('resize', on)
  }, [place])

  // Kéo để đổi chỗ, thả ra hít vào mép gần nhất (FLIP cho mượt)
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const down = (e: React.PointerEvent) => {
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current, el = box.current; if (!d || !el) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) > 7) { d.moved = true; hide(); el.classList.add('drag') }
    if (d.moved) el.style.transform = `translate(${dx}px,${dy}px)`
  }
  const up = (e: React.PointerEvent) => {
    const d = drag.current, el = box.current, hs = host; drag.current = null
    if (!d || !el || !hs) return
    if (!d.moved) { poke(); return }
    const r = el.getBoundingClientRect(), pr = hs.getBoundingClientRect()
    const side: Dock['side'] = r.left + r.width / 2 < pr.left + pr.width / 2 ? 'l' : 'r'
    const next = place({ side, by: pr.bottom - r.bottom })
    const fromX = r.left, fromY = r.top
    el.classList.remove('drag'); el.style.transform = ''
    setDock(next); store.set(kDock, JSON.stringify(next))
    // sau khi React đặt vị trí mới, trượt từ chỗ vừa thả về vị trí hít vào
    requestAnimationFrame(() => {
      const n = el.getBoundingClientRect(); el.style.transition = 'none'
      el.style.transform = `translate(${fromX - n.left}px,${fromY - n.top}px)`; void el.offsetWidth
      el.style.transition = ''; el.style.transform = ''
    })
    void e
  }
  const cancel = () => { drag.current = null; const el = box.current; if (el) { el.classList.remove('drag'); el.style.transform = '' } }

  const poke = () => {
    h.current?.poke()
    const id = Date.now(); setHearts(a => [...a.slice(-4), id]); setTimeout(() => setHearts(a => a.filter(x => x !== id)), 1400)
    show({ id: 'poke', w: 1, menu: true, text: POKE[Math.floor(Math.random() * POKE.length)] }, 5000)
  }
  const choose = (m: Say, c: Chip) => {
    h.current?.act('wag')
    if (c.reply) show({ id: m.id + '-r', w: 1, text: c.reply, href: c.href, hrefLabel: c.href ? 'Nhắn tin' : undefined }, c.href ? 11000 : 6500); else hide()
  }
  const rename = () => {
    const v = window.prompt('Đặt tên cho linh vật của bạn nhé', pname); if (v == null) return
    const n = v.replace(/\s+/g, ' ').trim().slice(0, 20); if (!n) return
    setPname(n); store.set(kName, n)
  }
  const toggleQuiet = () => { const q = !quiet; setQuiet(q); store.set(kQuiet, q ? '1' : '0'); if (q) hide() }
  const say = (t: string) => t.replace(/Shiba/g, pname)

  if (!host) return null
  const pos = dock.side === 'r' ? { right: EDGE, bottom: dock.by } : { left: EDGE, bottom: dock.by }
  return createPortal(
    <div ref={box} className={`mc ${dock.side === 'r' ? 'r' : 'l'}`} style={{ ...pos, width: SIZE, height: SIZE }} role="group" aria-label={`Linh vật ${pname}`}>
      <div className="mc-float">
        {!bad && <button type="button" className="mc-hit" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke() } }} aria-label={`Xoa đầu ${pname}. Kéo để đổi chỗ`}>
          <canvas ref={cv} className={ready ? 'on' : ''} />
        </button>}
        {bad && <button type="button" className="mc-hit mc-emoji" onClick={poke} aria-label={`Xoa đầu ${pname}`}>🐶</button>}
        {hearts.map(id => <i key={id} className="mc-heart" aria-hidden="true" style={{ left: `${30 + (id % 5) * 10}%` }}>♥</i>)}
      </div>
      <div className="mc-talk" aria-live="polite">
        {msg && <div className="mc-bub" key={msg.id + msg.text}>
          <button type="button" className="mc-x" onClick={hide} aria-label="Đóng lời nhắn">×</button>
          <div>{say(msg.text)}</div>
          {(msg.chips || msg.href) && <div className="mc-act">
            {msg.chips?.map(c => <button key={c.label} type="button" className="pill" onClick={() => choose(msg, c)}>{c.label}</button>)}
            {msg.href && <Link href={msg.href} className="pill on" onClick={hide}>{msg.hrefLabel ?? 'Xem'}</Link>}
          </div>}
          {msg.menu && <div className="mc-menu">
            <button type="button" onClick={rename}>✎ Đổi tên</button>
            <button type="button" onClick={toggleQuiet} aria-pressed={quiet}>{quiet ? '🔔 Bật nhắc' : '🔕 Tắt nhắc'}</button>
          </div>}
        </div>}
      </div>
    </div>, host)
}
