import { sb } from '@/lib/supabase'

export type PushKind = 'message' | 'call' | 'clip-react' | 'clip-comment' | 'together'

// Nhờ Edge Function `push` gửi thông báo đến máy người kia (chat, cuộc gọi, tương tác ở mục Giải trí).
// `clip` chỉ dùng cho 'together': mở thẳng đúng clip khi người kia bấm vào thông báo. Lỗi thì bỏ qua, không làm hỏng việc chính.
export const notifyPartner = (kind: PushKind, text?: string, clip?: string) => {
  sb.functions.invoke('push', { body: { kind, text, clip } }).then(r => { if (r.error) console.warn('push', r.error.message) }, () => { })
}
export const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
export const b64ToBytes = (s: string) => {
  const p = '='.repeat((4 - s.length % 4) % 4), raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}
