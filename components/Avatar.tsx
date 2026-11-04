'use client'
import { useEffect, useState } from 'react'
import { sign } from '@/lib/media'

// Ảnh đại diện (AUTH-05). p là dòng profiles (display_name, avatar_url); chưa có ảnh hoặc ảnh lỗi thì hiện chữ cái đầu của tên.
// avatar_url là đường dẫn trong bucket private `media`, nên phải đổi sang link ký có thời hạn trước khi hiện.
export default function Avatar({ p, size = 44, on = false, alt = '' }: { p: any; size?: number; on?: boolean; alt?: string }) {
  const path: string | null = p?.avatar_url ?? null
  const [url, setUrl] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  useEffect(() => {
    let dead = false
    setUrl(null); setBad(false)
    if (path) sign([path]).then(m => { if (!dead) setUrl(m[path] ?? null) }).catch(() => { })
    return () => { dead = true }
  }, [path])
  const st = { width: size, height: size, fontSize: Math.round(size * 0.45) }
  if (url && !bad) return <img src={url} alt={alt} className={`av${on ? ' on' : ''}`} style={st} onError={() => setBad(true)} />
  const first = [...(String(p?.display_name ?? '').trim() || '?')][0].toUpperCase()
  return <div className={`av${on ? ' on' : ''}`} style={st} role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>{first}</div>
}
