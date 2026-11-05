// Phần thuần (không dùng API riêng của Deno) của Edge Function `clip`: tách link TikTok khỏi đoạn văn bản, đổi link rút gọn
// (vm.tiktok.com, vt.tiktok.com, tiktok.com/t/...) thành mã video. Chỉ đi theo chuyển hướng trong các tên miền của TikTok,
// để người ngoài không lợi dụng hàm này gọi tới địa chỉ khác (SSRF).

export type Video = { id: string; user: string | null }

const HOST = /^(?:[a-z0-9-]+\.)?tiktok\.com$/i
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

// Lấy link đầu tiên trong đoạn văn bản (TikTok hay chia sẻ kèm caption)
export function extractUrl(s: string): string | null {
  const m = s.match(/https?:\/\/[^\s<>"']+/i)
  return m ? m[0].replace(/[).,;!?]+$/, '') : null
}

export const isTikTok = (u: URL) => u.protocol === 'https:' && HOST.test(u.hostname) && !u.username && !u.password

// Nhận ra link video đầy đủ: /@tên/video/<mã>, /video/<mã>, /v/<mã>.html. Link ảnh (/photo/) không nhận.
export function parseVideo(u: URL): Video | null {
  let m = u.pathname.match(/^\/(?:@([\w.-]{1,64})\/)?video\/(\d{8,25})\/?$/)
  if (m) return { id: m[2], user: m[1] ?? null }
  m = u.pathname.match(/^\/v\/(\d{8,25})\.html$/)
  return m ? { id: m[1], user: null } : null
}

// Đi theo tối đa 4 lần chuyển hướng (từng bước đều phải là tên miền TikTok) cho tới khi ra link video đầy đủ
export async function resolveVideo(raw: string, f: typeof fetch = fetch): Promise<Video | null> {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  for (let hop = 0; hop < 5; hop++) {
    if (!isTikTok(u)) return null
    const v = parseVideo(u)
    if (v) return v
    if (hop === 4) return null
    const r = await f(u.href, { method: 'GET', redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(6000) })
    r.body?.cancel().catch(() => { })
    const loc = r.headers.get('location')
    if (!loc || r.status < 300 || r.status >= 400) return null
    try { u = new URL(loc, u) } catch { return null }
  }
  return null
}

export const canonical = (v: Video) => v.user ? `https://www.tiktok.com/@${v.user}/video/${v.id}` : `https://www.tiktok.com/video/${v.id}`

// Làm sạch chuỗi lấy từ bên ngoài trước khi lưu
export const clean = (s: unknown, max: number): string | null => {
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max)
  return t || null
}
export const httpsUrl = (s: unknown): string | null => {
  try { const u = new URL(String(s ?? '')); return u.protocol === 'https:' ? u.href.slice(0, 2000) : null } catch { return null }
}
