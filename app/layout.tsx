import type { Metadata, Viewport } from 'next'
import { Baloo_2, Quicksand } from 'next/font/google'
import './globals.css'
import Sw from '@/components/Sw'
const f1 = Baloo_2({ subsets: ['vietnamese', 'latin'], weight: ['700', '800'], variable: '--f1' })
const f2 = Quicksand({ subsets: ['vietnamese', 'latin'], weight: ['600', '700'], variable: '--f2' })
export const metadata: Metadata = { title: 'tdlove', description: 'Góc nhỏ của hai đứa mình', manifest: '/manifest.webmanifest', robots: { index: false, follow: false }, icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' } }
export const viewport: Viewport = { themeColor: '#FF8FB8', width: 'device-width', initialScale: 1 }
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="vi" className={`${f1.variable} ${f2.variable}`}><body>{children}<Sw /></body></html>
}
