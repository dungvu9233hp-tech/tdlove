import type { CSSProperties } from 'react'
import { sb } from '@/lib/supabase'

export const hhmm = (s: string) => new Date(s).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
export const dmy = (s: string) => new Date(s).toLocaleDateString('vi-VN')
export const clamp2: CSSProperties = { overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }

export const hasTikTok = (s: string) => /https?:\/\/(?:[\w-]+\.)?tiktok\.com\//i.test(s)

// Trình phát nhúng chính thức của TikTok (developers.tiktok.com/doc/embed-player); chỉ nhận mã video là số
// autoplay=0 khi xem cùng nhau: hai bên chờ nhau rồi mới phát
export const embedSrc = (id: string, autoplay = true) =>
  /^\d{8,25}$/.test(id) ? `https://www.tiktok.com/player/v1/${id}?controls=1&description=1&music_info=1&rel=0&autoplay=${autoplay ? 1 : 0}` : ''

// Địa chỉ Edge Function `clip`, dùng trong Phím tắt iPhone
export const funcUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/clip`

// Gửi một link TikTok (hoặc đoạn chữ chứa link) cho người kia qua Edge Function `clip`
export async function sendClip(url: string, note?: string): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await sb.functions.invoke('clip', { body: { url, note } })
  if (!error) return { ok: !!data?.ok, message: data?.message ?? 'Đã gửi' }
  let msg = ''
  try { msg = (await (error as any).context?.json?.())?.message ?? '' } catch { /* không đọc được nội dung lỗi */ }
  return { ok: false, message: msg || 'Chưa gửi được. Kiểm tra mạng và đã deploy hàm clip chưa nhé.' }
}

// ---- Tương tác (phase14) ----
export type Clip = {
  id: string; space_id: string; sender: string; video_id: string; url: string
  title: string | null; author_name: string | null; thumb_url: string | null; note: string | null
  seen_at: string | null; created_at: string
  reactions?: Record<string, string>   // { user id: emoji }
  starred?: boolean                    // yêu thích chung của hai người
  comments?: number                    // số bình luận
}
export type Comment = { id: string; clip_id: string; author: string; body: string; created_at: string }

export const REACTS = ['❤️', '😂', '😮', '🥺', '🔥', '🙈']
export const QUICK_NOTES = ['Xem đi nè 😂', 'Giống tụi mình quá 🥰', 'Nhớ quá nên gửi 💕', 'Cười xỉu luôn 🤣']

// Cả hai cùng thả cảm xúc thì clip được gắn 💞
export const mutual = (c: Clip) => Object.keys(c.reactions ?? {}).length >= 2
// Dòng nhỏ dưới tên clip: yêu thích, cảm xúc của hai người, số bình luận
export const badges = (c: Clip) => [
  c.starred ? '⭐' : '',
  Object.values(c.reactions ?? {}).join(' '),
  mutual(c) ? '💞' : '',
  c.comments ? `💬 ${c.comments}` : '',
].filter(Boolean).join(' ')
