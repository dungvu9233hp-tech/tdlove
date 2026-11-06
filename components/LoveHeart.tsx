'use client'
// Số ngày bên nhau trên Trang chủ, vẽ như một tờ lịch bloc: dải mực tím ghi thứ và tháng, số ngày thật lớn,
// một nhãn dán hình tim nhỏ có mặt (giữ lại nhân vật của app) ở góc. Số đếm lên từ 0 khi vào trang.
// Liên kết do Trang chủ bọc ngoài. Kiểu dáng và chuyển động nằm ở app/skin.css (.lf*), tự tắt khi máy bật "giảm chuyển động".
import { useEffect, useState } from 'react'

const DOW = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']
const HEART = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'

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
  // Ngày giờ chỉ lấy sau khi vào trang, để HTML từ máy chủ và máy người dùng không lệch nhau
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => setNow(new Date()), [])
  return (
    <div className="lf">
      <div className="lf-leaf">
        <div className="lf-top"><span>{now ? DOW[now.getDay()] : ''}</span><span>{now ? `Tháng ${now.getMonth() + 1}, ${now.getFullYear()}` : ''}</span></div>
        <div className="lf-n">{n ?? '–'}</div>
        <div className="lf-l">ngày bên nhau</div>
        <svg className="lf-heart" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d={HEART} fill="#F4B8C8" stroke="#231F3A" strokeWidth="1.2" strokeLinejoin="round" />
          <ellipse cx="7.6" cy="12.3" rx="1.5" ry=".9" fill="#E0556B" opacity=".35" />
          <ellipse cx="16.4" cy="12.3" rx="1.5" ry=".9" fill="#E0556B" opacity=".35" />
          <ellipse className="lf-eye" cx="9.3" cy="10.4" rx=".85" ry="1.1" fill="#231F3A" />
          <ellipse className="lf-eye" cx="14.7" cy="10.4" rx=".85" ry="1.1" fill="#231F3A" />
          <path d="M10.7 13.2q.65.85 1.3 0q.65.85 1.3 0" fill="none" stroke="#231F3A" strokeWidth=".55" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}
