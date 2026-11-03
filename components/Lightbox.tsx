'use client'
import { useEffect, useRef, useState } from 'react'

export type LbItem = { kind: 'image' | 'video'; url: string }
// Xem toàn màn hình, vuốt hoặc bấm mũi tên để chuyển, phím ← → Esc trên máy tính
export default function Lightbox({ items, start = 0, caption, onClose }: { items: LbItem[]; start?: number; caption?: string; onClose: () => void }) {
  const [i, setI] = useState(start); const x0 = useRef<number | null>(null)
  const go = (d: number) => setI(a => Math.min(items.length - 1, Math.max(0, a + d)))
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const it = items[i]; if (!it) return null
  return <div className="lb" role="dialog" aria-label="Xem ảnh"
    onTouchStart={e => { x0.current = e.touches[0].clientX }}
    onTouchEnd={e => { if (x0.current == null) return; const d = e.changedTouches[0].clientX - x0.current; x0.current = null; if (Math.abs(d) > 60) go(d < 0 ? 1 : -1) }}>
    {it.kind === 'video' ? <video key={it.url} src={it.url} controls autoPlay playsInline /> : <img key={it.url} src={it.url} alt={caption ?? ''} />}
    <button className="pill c" onClick={onClose}>Đóng</button>
    {i > 0 && <button className="n" style={{ left: 8 }} onClick={() => go(-1)} aria-label="Ảnh trước">‹</button>}
    {i < items.length - 1 && <button className="n" style={{ right: 8 }} onClick={() => go(1)} aria-label="Ảnh sau">›</button>}
    <div className="cap">{i + 1}/{items.length}{caption ? ` · ${caption}` : ''}</div>
  </div>
}
