'use client'
import { useEffect, useRef, useState } from 'react'
import { mountCouple, type Look } from '@/lib/human3d'

// Hai nhân vật 3D nắm tay nhau. Kéo ngang để xoay. Máy không có WebGL thì báo thay vì để trống.
// lf / lm là dáng nữ / nam (đồ đang mặc). Đổi dáng thì dựng lại hai nhân vật, không dựng lại cả khung 3D.
export default function Couple3D({ height = 420, lf, lm }: { height?: number | string; lf?: Look; lm?: Look }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const h = useRef<ReturnType<typeof mountCouple> | null>(null)
  const first = useRef({ lf, lm }), shown = useRef(JSON.stringify([lf, lm]))
  const [bad, setBad] = useState(false)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    try { h.current = mountCouple(c, first.current) } catch (e) { console.error('Couple3D', e); setBad(true) }
    return () => { h.current?.dispose(); h.current = null }
  }, [])
  const key = JSON.stringify([lf, lm])
  useEffect(() => {
    if (key === shown.current) return
    shown.current = key
    h.current?.setLooks(lf, lm)
  }, [key, lf, lm])
  if (bad) return <div className="s" style={{ height, display: 'grid', placeItems: 'center', padding: 18, textAlign: 'center' }}>Máy này chưa bật được đồ họa 3D (WebGL). Thử mở bằng Safari/Chrome bản mới.</div>
  return <canvas ref={ref} role="img" aria-label="Hai nhân vật 3D đang nắm tay nhau, kéo ngang để xoay" style={{ width: '100%', height, display: 'block' }} />
}
