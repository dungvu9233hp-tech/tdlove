'use client'
import { useEffect } from 'react'

// Đăng ký service worker (cần để cài app, dùng offline cơ bản và nhận thông báo đẩy)
export default function Sw() {
  useEffect(() => { if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(e => console.warn('sw', e)) }, [])
  return null
}
