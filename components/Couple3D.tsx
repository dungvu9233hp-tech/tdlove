'use client'
import { useEffect, useRef, useState } from 'react'
import { mountCouple } from '@/lib/human3d'

// Hai nhân vật 3D nắm tay nhau. Kéo ngang để xoay. Máy không có WebGL thì báo thay vì để trống.
export default function Couple3D({ height = 420 }: { height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [bad, setBad] = useState(false)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    let m: ReturnType<typeof mountCouple> | null = null
    try { m = mountCouple(c) } catch (e) { console.error('Couple3D', e); setBad(true) }
    return () => m?.dispose()
  }, [])
  if (bad) return <div className="s" style={{ height, display: 'grid', placeItems: 'center', padding: 18, textAlign: 'center' }}>Máy này chưa bật được đồ họa 3D (WebGL). Thử mở bằng Safari/Chrome bản mới.</div>
  return <canvas ref={ref} role="img" aria-label="Hai nhân vật 3D đang nắm tay nhau, kéo ngang để xoay" style={{ width: '100%', height, display: 'block' }} />
}
