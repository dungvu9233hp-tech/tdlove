import type { Metadata, Viewport } from 'next'
import './globals.css'
import './skin.css'
import Sw from '@/components/Sw'
export const metadata: Metadata = { title: 'tdlove', description: 'Góc nhỏ của hai đứa mình', manifest: '/manifest.webmanifest', robots: { index: false, follow: false }, icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' } }
export const viewport: Viewport = { themeColor: '#F8F7FB', width: 'device-width', initialScale: 1 }

// Be Vietnam Pro (chữ thân, thiết kế cho tiếng Việt) và Mali (nét viết tay cho tiêu đề, có đủ dấu tiếng Việt).
// Mất mạng thì tự rơi về font hệ thống, giao diện không vỡ.
const FONTS = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;800&family=Mali:wght@600;700&display=swap'

export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="vi">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS} />
    </head>
    <body>{children}<Sw /></body>
  </html>
}
