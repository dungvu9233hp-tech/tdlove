import type { Metadata, Viewport } from 'next'
import '@fontsource/baloo-2/latin-700.css'
import '@fontsource/baloo-2/latin-800.css'
import '@fontsource/baloo-2/vietnamese-700.css'
import '@fontsource/baloo-2/vietnamese-800.css'
import '@fontsource/quicksand/latin-600.css'
import '@fontsource/quicksand/latin-700.css'
import '@fontsource/quicksand/vietnamese-600.css'
import '@fontsource/quicksand/vietnamese-700.css'
import './globals.css'
import Sw from '@/components/Sw'
export const metadata: Metadata = { title: 'tdlove', description: 'Góc nhỏ của hai đứa mình', manifest: '/manifest.webmanifest', robots: { index: false, follow: false }, icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' } }
export const viewport: Viewport = { themeColor: '#FF8FB8', width: 'device-width', initialScale: 1 }
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="vi" ><body>{children}<Sw /></body></html>
}
