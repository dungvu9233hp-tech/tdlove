'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
const T: [string, string, string][] = [
  ['/', 'Trang chủ', '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>'],
  ['/moments', 'Khoảnh khắc', '<rect x="3" y="5" width="18" height="14" rx="4"/><circle cx="12" cy="12" r="3.5"/>'],
  ['/map', 'Bản đồ', '<path d="M12 21s-6-5.6-6-10a6 6 0 0112 0c0 4.4-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>'],
  ['/chat', 'Chat', '<path d="M4 6a3 3 0 013-3h10a3 3 0 013 3v7a3 3 0 01-3 3h-5l-5 4v-4a3 3 0 01-3-3z"/>'],
  ['/plan', 'Kế hoạch', '<rect x="3" y="5" width="18" height="16" rx="4"/><path d="M8 3v4M16 3v4M3 11h18"/>'],
]
export default function Nav() {
  const path = usePathname()
  const on = (href: string) => href === '/' ? path === '/' : path.startsWith(href)
  const idx = T.findIndex(([href]) => on(href))
  // Viên mận đậm trượt mượt tới tab đang mở; ở trang không thuộc tab nào (Cài đặt...) thì ẩn đi
  return <nav className="nav">
    <span className="nav-ind" aria-hidden="true" style={{ ['--i' as any]: Math.max(idx, 0), opacity: idx < 0 ? 0 : 1 }} />
    {T.map(([href, label, svg]) => (
      <Link key={href} href={href} className={on(href) ? 'a' : ''}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />{label}
      </Link>))}
  </nav>
}
