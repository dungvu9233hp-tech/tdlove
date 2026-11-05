import { sb } from '@/lib/supabase'

export const hasTikTok = (s: string) => /https?:\/\/(?:[\w-]+\.)?tiktok\.com\//i.test(s)

// Trình phát nhúng chính thức của TikTok (developers.tiktok.com/doc/embed-player); chỉ nhận mã video là số
export const embedSrc = (id: string) =>
  /^\d{8,25}$/.test(id) ? `https://www.tiktok.com/player/v1/${id}?controls=1&description=1&music_info=1&rel=0&autoplay=1` : ''

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
