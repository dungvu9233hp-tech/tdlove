'use client'
import { useEffect, useState } from 'react'
import { sign } from '@/lib/media'

// Slideshow tự chạy cho "Ngày này năm trước" (MOM-10): mỗi ảnh 4 giây, chạm để dừng/tiếp
export default function Slideshow({ moments, onClose }: { moments: any[]; onClose: () => void }) {
  const slides = moments.flatMap(m => (m.media ?? []).filter((x: any) => x.kind === 'image').slice(0, 6).map((x: any) => ({ path: x.path, title: m.title, date: m.taken_on, year: m.taken_on.slice(0, 4) })))
  const [url, setUrl] = useState<Record<string, string>>({}); const [i, setI] = useState(0); const [play, setPlay] = useState(true)
  useEffect(() => { sign(slides.map(s => s.path)).then(setUrl) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  useEffect(() => {
    if (!play || slides.length < 2) return
    const t = setInterval(() => setI(a => (a + 1) % slides.length), 4000); return () => clearInterval(t)
  }, [play, slides.length])
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])
  const s = slides[i]
  return <div className="lb" role="dialog" aria-label="Slideshow kỷ niệm" onClick={() => setPlay(p => !p)}>
    {s && url[s.path] ? <img src={url[s.path]} alt={s.title} /> : <div style={{ color: '#fff' }}>{s ? 'Đang tải…' : 'Chưa có ảnh để chiếu'}</div>}
    <button className="pill c" onClick={e => { e.stopPropagation(); onClose() }}>Đóng</button>
    {s && <div className="cap"><div style={{ fontSize: 22 }}>{new Date().getFullYear() - +s.year} năm trước · {new Date(s.date).toLocaleDateString('vi-VN')}</div>{s.title}{!play && ' · đã dừng, chạm để chạy tiếp'}</div>}
  </div>
}
