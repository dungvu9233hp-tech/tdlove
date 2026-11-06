'use client'
// Số ngày bên nhau trên Trang chủ, vẽ như một huy hiệu rosette hồng có ruy băng, viền răng cưa và hàng ngọc trai,
// chú tim đội vương miện chui lên ở góc. Số đếm lên từ 0 khi vào trang.
// Chỉ vẽ hình; liên kết do Trang chủ bọc ngoài. Kiểu dáng và chuyển động nằm ở app/skin.css (.lf*), tự tắt khi máy bật "giảm chuyển động".
import { useEffect, useState } from 'react'

const N = 16, CX = 100, CY = 100, R = 80, r = R * Math.sin(Math.PI / N) * 1.02
const pt = (i: number) => { const a = -Math.PI / 2 + 2 * Math.PI * i / N; return `${(CX + R * Math.cos(a)).toFixed(2)} ${(CY + R * Math.sin(a)).toFixed(2)}` }
// Viền răng cưa: mỗi cung nhỏ phồng ra ngoài
const SCALLOP = `M${pt(0)}` + Array.from({ length: N }, (_, i) => ` A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${pt(i + 1)}`).join('') + ' Z'
const HEART = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
const INK = '#4A1D35'

function useCount(to: number | null) {
  const [v, setV] = useState<number | null>(to == null ? null : 0)
  useEffect(() => {
    if (to == null) { setV(null); return }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return }
    let raf = 0; const t0 = performance.now(), D = 1300
    const tick = (t: number) => { const p = Math.min(1, (t - t0) / D); setV(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return v
}

export default function LoveHeart({ days }: { days: number | null }) {
  const n = useCount(days)
  const big = (days ?? 0) >= 1000
  return (
    <div className="lf">
      <svg className="lf-svg" viewBox="0 0 200 232" aria-hidden="true" focusable="false">
        <g className="lf-tails">
          <path d="M84 146 L56 228 L76 216 L92 231 L114 150 Z" fill="#F57FAA" />
          <path d="M116 146 L144 228 L124 216 L108 231 L86 150 Z" fill="#E8648F" />
        </g>
        <g className="lf-rose">
          <path d={SCALLOP} fill="#F57FAA" />
          <circle cx={CX} cy={CY} r="70" fill="#FFE3EE" stroke="#F9B3CC" strokeWidth="1.5" />
          <circle cx={CX} cy={CY} r="63" fill="none" stroke="#F57FAA" strokeOpacity=".75" strokeWidth="4" strokeLinecap="round" strokeDasharray="0.1 9.8" />
        </g>
      </svg>
      <div className="lf-txt">
        <div className="lf-n" style={big ? { fontSize: 52 } : undefined}>{n ?? '–'}</div>
        <div className="lf-l">ngày bên nhau</div>
      </div>
      <svg className="lf-heart" viewBox="0 -7 24 31" aria-hidden="true" focusable="false">
        <path d={HEART} fill="#FF9DBF" stroke={INK} strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M8.2 3.4 L7.3 -2.4 L10 0.3 L12 -3.6 L14 0.3 L16.7 -2.4 L15.8 3.4 Z" transform="rotate(-10 12 2)" fill="#FFC857" stroke={INK} strokeWidth=".8" strokeLinejoin="round" />
        <ellipse cx="7.4" cy="12.4" rx="1.6" ry=".95" fill="#E8648F" opacity=".4" />
        <ellipse cx="16.6" cy="12.4" rx="1.6" ry=".95" fill="#E8648F" opacity=".4" />
        <ellipse className="lf-eye" cx="9.3" cy="10.5" rx=".85" ry="1.1" fill={INK} />
        <ellipse className="lf-eye" cx="14.7" cy="10.5" rx=".85" ry="1.1" fill={INK} />
        <path d="M10.7 13.3q.65.85 1.3 0q.65.85 1.3 0" fill="none" stroke={INK} strokeWidth=".55" strokeLinecap="round" />
      </svg>
    </div>
  )
}
