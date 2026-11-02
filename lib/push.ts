import { sb } from '@/lib/supabase'

// Nhờ Edge Function `push` gửi thông báo đến máy người kia (chat, cuộc gọi). Lỗi thì bỏ qua, không làm hỏng việc chính.
export const notifyPartner = (kind: 'message' | 'call', text?: string) => {
  sb.functions.invoke('push', { body: { kind, text } }).then(r => { if (r.error) console.warn('push', r.error.message) }, () => { })
}
export const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
export const b64ToBytes = (s: string) => {
  const p = '='.repeat((4 - s.length % 4) % 4), raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}
