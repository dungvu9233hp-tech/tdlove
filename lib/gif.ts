import { sb } from '@/lib/supabase'

// GIF cho chat và bình luận (phase25.sql). Hai nguồn:
//  - path: tệp người dùng tải lên bucket riêng `gifs` (đọc bằng link ký có thời hạn)
//  - url:  link GIPHY (chỉ nhận đúng tên miền giphy.com; cơ sở dữ liệu cũng kiểm tra lại)
export type GifRef = { path?: string | null; url?: string | null }

export const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_KEY
export const MAX_GIF = 8 * 1048576
export const GIF_TYPES = ['image/gif', 'image/webp']
const GIPHY_RE = /^https:\/\/(?:media\d*|i)\.giphy\.com\/[^\s<>"']+$/
export const giphyOk = (u: unknown): u is string => typeof u === 'string' && u.length <= 600 && GIPHY_RE.test(u)

// Hai cột gif_path / gif_url của một dòng tin nhắn hoặc bình luận
export const gifOf = (row: any): GifRef | null => row?.kind === 'gif' && (row.gif_path || row.gif_url) ? { path: row.gif_path, url: row.gif_url } : null
// Cột để ghi vào cơ sở dữ liệu
export const gifCols = (g: GifRef) => ({ kind: 'gif', gif_path: g.path ?? null, gif_url: g.url ?? null })
export const sameGif = (a: GifRef, b: GifRef) => (a.path ?? a.url) === (b.path ?? b.url)

// ---------- Link ký có nhớ tạm, gộp nhiều yêu cầu trong cùng một nhịp thành một lần gọi ----------
const TTL = 6 * 3600
const cache = new Map<string, { u: string; exp: number }>()
let pending = new Map<string, ((u: string | null) => void)[]>()
let timer: ReturnType<typeof setTimeout> | null = null

// Link ký là "chìa khóa": đăng xuất thì bỏ sạch để tài khoản khác dùng chung trình duyệt không nhận nhầm
if (typeof window !== 'undefined') sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') cache.clear() })

async function flush() {
  timer = null
  const batch = pending; pending = new Map()
  const got = new Map<string, string>()
  try {
    const { data } = await sb.storage.from('gifs').createSignedUrls(Array.from(batch.keys()), TTL)
    for (const x of data ?? []) if (x.path && x.signedUrl) { got.set(x.path, x.signedUrl); cache.set(x.path, { u: x.signedUrl, exp: Date.now() + TTL * 1000 }) }
  } catch { /* để từng nơi hiện "không tải được" */ }
  for (const [p, cbs] of batch) for (const cb of cbs) cb(got.get(p) ?? null)
}

export function signGif(path: string, fresh = false): Promise<string | null> {
  const c = cache.get(path)
  if (!fresh && c && c.exp > Date.now() + 60000) return Promise.resolve(c.u)
  return new Promise(res => {
    const list = pending.get(path) ?? []; list.push(res); pending.set(path, list)
    if (!timer) timer = setTimeout(flush, 25)
  })
}

// Địa chỉ hiển thị được của một GIF (null nếu không ký được)
export const gifSrc = (g: GifRef, fresh = false): Promise<string | null> =>
  g.url ? Promise.resolve(giphyOk(g.url) ? g.url : null) : g.path ? signGif(g.path, fresh) : Promise.resolve(null)

// ---------- Tìm trên GIPHY (chỉ khi có NEXT_PUBLIC_GIPHY_KEY) ----------
export type GiphyHit = { id: string; preview: string; url: string }
export async function giphySearch(q: string, signal?: AbortSignal): Promise<GiphyHit[]> {
  if (!GIPHY_KEY) return []
  const k = q.trim()
  const u = `https://api.giphy.com/v1/gifs/${k ? 'search' : 'trending'}?api_key=${encodeURIComponent(GIPHY_KEY)}${k ? `&q=${encodeURIComponent(k)}` : ''}&limit=24&rating=g&lang=vi`
  const r = await fetch(u, { signal })
  if (!r.ok) throw new Error(r.status === 429 ? 'GIPHY đang giới hạn lượt tìm, thử lại sau một lúc' : `GIPHY lỗi ${r.status}`)
  const j = await r.json()
  const out: GiphyHit[] = []
  for (const x of j.data ?? []) {
    const preview = x.images?.fixed_height_small?.url ?? x.images?.fixed_height?.url, url = x.images?.fixed_height?.url ?? x.images?.original?.url
    if (giphyOk(preview) && giphyOk(url)) out.push({ id: x.id, preview, url })
  }
  return out
}
