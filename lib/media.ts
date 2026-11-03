import * as tus from 'tus-js-client'
import { Zip, ZipPassThrough } from 'fflate'
import { sb } from '@/lib/supabase'

export const MAX_FILES = 20                         // MOM-02: tối đa 20 tệp mỗi khoảnh khắc
export const MAX_IMG = 15 * 1048576                 // MOM-02: mỗi ảnh gốc ≤ 15 MB
export const MAX_VIDEO_SEC = 180                    // MOM-03: ≤ 3 phút
// MOM-03: SRS ghi ≤ 200 MB, nhưng gói Supabase miễn phí chỉ nhận ≤ 50 MB mỗi tệp.
// Lên gói Pro rồi nâng giới hạn tệp trong Storage settings thì đặt NEXT_PUBLIC_MAX_VIDEO_MB=200.
export const MAX_VIDEO = (Number(process.env.NEXT_PUBLIC_MAX_VIDEO_MB) || 50) * 1048576
export const MB = (n: number) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0).replace('.', ',') + ' MB'

export const isVideoPath = (p: string) => /\.(mp4|mov|webm|m4v)$/i.test(p.split('?')[0])
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const online = () => new Promise<void>(ok => { if (navigator.onLine) return ok(); const f = () => { window.removeEventListener('online', f); ok() }; window.addEventListener('online', f) })

// ---------- Ảnh: nén, resize, thumbnail ----------
async function decode(f: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  try {
    const b = await createImageBitmap(f)
    return { src: b, w: b.width, h: b.height, done: () => b.close?.() }
  } catch {   // trình duyệt cũ: giải mã bằng thẻ <img>
    const u = URL.createObjectURL(f), img = new Image()
    await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('Không đọc được ảnh (ảnh hỏng hoặc định dạng không hỗ trợ)')); img.src = u })
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(u) }
  }
}
function scaled(d: { src: CanvasImageSource; w: number; h: number }, max: number, q: number): Promise<Blob> {
  const k = Math.min(1, max / Math.max(d.w, d.h)), c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(d.w * k)); c.height = Math.max(1, Math.round(d.h * k))
  c.getContext('2d')!.drawImage(d.src, 0, 0, c.width, c.height)
  return new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error('Không nén được ảnh')), 'image/jpeg', q))
}
export async function processImage(f: Blob) {
  const d = await decode(f)
  try {
    const full = await scaled(d, 1600, 0.8), thumb = await scaled(d, 480, 0.72)
    const k = Math.min(1, 1600 / Math.max(d.w, d.h))
    return { full, thumb, width: Math.round(d.w * k), height: Math.round(d.h * k) }
  } finally { d.done() }
}

// ---------- EXIF: ngày chụp + GPS (MOM-01) ----------
export async function readExif(f: File): Promise<{ taken_at?: string; lat?: number; lng?: number }> {
  try {
    const ex = await import('exifr')
    const r: any = await ex.parse(f, { gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'] })
    if (!r) return {}
    const d: Date | undefined = r.DateTimeOriginal ?? r.CreateDate
    return {
      taken_at: d instanceof Date && !isNaN(+d) ? d.toISOString() : undefined,
      lat: typeof r.latitude === 'number' ? r.latitude : undefined, lng: typeof r.longitude === 'number' ? r.longitude : undefined,
    }
  } catch { return {} }
}
// ngày dạng yyyy-mm-dd theo giờ máy (để điền vào ô ngày)
export const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// ---------- Video: thời lượng + ảnh bìa (MOM-03) ----------
export async function probeVideo(f: File): Promise<{ duration: number; width: number; height: number; poster: Blob | null }> {
  const u = URL.createObjectURL(f), v = document.createElement('video')
  v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = u
  const wait = (ev: string, ms: number) => new Promise<boolean>(ok => { const t = setTimeout(() => ok(false), ms); v.addEventListener(ev, () => { clearTimeout(t); ok(true) }, { once: true }) })
  try {
    if (!await wait('loadedmetadata', 10000)) throw new Error('Không đọc được video (định dạng không hỗ trợ?)')
    const duration = v.duration, width = v.videoWidth, height = v.videoHeight
    let poster: Blob | null = null
    try {   // iOS đôi khi không cho vẽ khung hình khi chưa có thao tác; lỗi thì bỏ qua, video vẫn đăng được
      v.currentTime = Math.min(1, duration / 2)
      if (await wait('seeked', 6000) && width) {
        const k = Math.min(1, 480 / Math.max(width, height)), c = document.createElement('canvas')
        c.width = Math.round(width * k); c.height = Math.round(height * k)
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
        poster = await new Promise<Blob | null>(ok => c.toBlob(ok, 'image/jpeg', 0.72))
      }
    } catch { }
    return { duration, width, height, poster }
  } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(u) }
}

// ---------- Tải lên có tiến độ và tự thử lại (MOM-03) ----------
const URLB = process.env.NEXT_PUBLIC_SUPABASE_URL!, KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
async function token() { const { data } = await sb.auth.getSession(); return data.session?.access_token ?? KEY }

// Tệp nhỏ: tải thường, thử lại 4 lần (mất mạng thì chờ có mạng lại rồi tiếp)
async function plainUpload(path: string, b: Blob, type: string, onP: (p: number) => void) {
  let last = ''
  for (let i = 0; i < 4; i++) {
    await online()
    const { error } = await sb.storage.from('media').upload(path, b, { contentType: type, upsert: true })
    if (!error) { onP(100); return }
    last = error.message; await sleep(1500 * 2 ** i)
  }
  throw new Error(last || 'Tải lên thất bại')
}
// Tệp lớn: giao thức TUS (Supabase resumable), chia khúc 6 MB, mất mạng thì chờ rồi tải tiếp
function tusUpload(path: string, f: Blob, type: string, onP: (p: number) => void) {
  return new Promise<void>((ok, no) => {
    let restarts = 0
    const up: tus.Upload = new tus.Upload(f, {
      endpoint: `${URLB}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10000, 20000],
      headers: { apikey: KEY, 'x-upsert': 'true' },
      uploadDataDuringCreation: true, removeFingerprintOnSuccess: true, storeFingerprintForResuming: false,
      chunkSize: 6 * 1048576,
      metadata: { bucketName: 'media', objectName: path, contentType: type, cacheControl: '3600' },
      onBeforeRequest: async req => { req.setHeader('Authorization', `Bearer ${await token()}`) },
      onProgress: (a, b) => onP(Math.min(99, Math.round(a / b * 100))),
      onSuccess: () => { onP(100); ok() },
      onError: async err => {
        if (!navigator.onLine && restarts++ < 20) { await online(); await sleep(1000); up.start(); return }   // mất mạng: chờ có mạng rồi tải tiếp
        no(new Error(String((err as any)?.message ?? err).slice(0, 200)))
      },
    })
    up.start()
  })
}
export const uploadBlob = (path: string, b: Blob, type: string, onP: (p: number) => void = () => { }) =>
  b.size > 5 * 1048576 ? tusUpload(path, b, type, onP) : plainUpload(path, b, type, onP)

// ---------- Link ký có thời hạn, có nhớ tạm (NFR-02) ----------
const cache = new Map<string, { u: string; exp: number }>()
export async function sign(paths: (string | null | undefined)[], ttl = 3600): Promise<Record<string, string>> {
  const want = Array.from(new Set(paths.filter(Boolean) as string[])), out: Record<string, string> = {}, now = Date.now(), miss: string[] = []
  for (const p of want) { const c = cache.get(p); if (c && c.exp > now + 60000) out[p] = c.u; else miss.push(p) }
  if (miss.length) {
    const { data } = await sb.storage.from('media').createSignedUrls(miss, ttl)
    for (const x of data ?? []) if (x.path && x.signedUrl) { out[x.path] = x.signedUrl; cache.set(x.path, { u: x.signedUrl, exp: now + ttl * 1000 }) }
  }
  return out
}

// ---------- Nén zip để tải về (MOM-09) ----------
export async function zipDownload(files: { name: string; path: string }[], zipName: string, onP: (done: number, total: number) => void) {
  const urls = await sign(files.map(f => f.path), 3600 * 2), chunks: BlobPart[] = []
  let fail: Error | null = null
  const zip = new Zip((err, chunk) => { if (err) fail = err; else chunks.push(chunk) })
  let n = 0
  for (const f of files) {
    const u = urls[f.path]; if (!u) { n++; continue }
    const r = await fetch(u); if (!r.ok) throw new Error(`Không tải được ${f.name}`)
    const e = new ZipPassThrough(f.name); zip.add(e); e.push(new Uint8Array(await r.arrayBuffer()), true)   // ảnh/video đã nén sẵn, không nén lại
    onP(++n, files.length)
  }
  zip.end()
  if (fail) throw fail
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: 'application/zip' })); a.download = zipName
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000)
}

// ---------- Tìm địa điểm bằng OpenStreetMap Nominatim (MOM-01) ----------
export type Place = { lat: number; lng: number; name: string }
export async function geocode(q: string): Promise<Place[]> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=vi&q=${encodeURIComponent(q)}`)
  if (!r.ok) throw new Error('Không tìm được địa điểm')
  return (await r.json()).map((x: any) => ({ lat: +x.lat, lng: +x.lon, name: String(x.display_name).split(',').slice(0, 3).join(',').trim() }))
}
export async function reverse(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=vi&lat=${lat}&lon=${lng}`)
    if (!r.ok) return ''
    const j = await r.json(); return String(j.name || j.display_name || '').split(',').slice(0, 3).join(',').trim()
  } catch { return '' }
}

export const TAGS = ['Vui vẻ', 'Ngọt ngào', 'Háo hức', 'Bình yên', 'Nhớ mãi', 'Cười xỉu', 'Xúc động', 'Hơi mệt']
export const TAG_EMOJI: Record<string, string> = { 'Vui vẻ': '😆', 'Ngọt ngào': '🥰', 'Háo hức': '🤩', 'Bình yên': '😌', 'Nhớ mãi': '🥹', 'Cười xỉu': '🤣', 'Xúc động': '😭', 'Hơi mệt': '😴' }
