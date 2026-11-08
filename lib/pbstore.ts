import { sb } from '@/lib/supabase'
import { processImage } from '@/lib/media'

// Ảnh của mẫu photobooth và Góc Photobooth nằm trong bucket riêng `pbooth` (phase26.sql), thư mục <space_id>/<user_id>/...
const BUCKET = 'pbooth'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export const pbPath = (spaceId: string, uid: string, ext = 'jpg') => `${spaceId}/${uid}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`

// Link ký có thời hạn, nhớ tạm để mở lại danh sách không phải ký lại
const cache = new Map<string, { u: string; exp: number }>()
export async function signPb(paths: (string | null | undefined)[], ttl = 3600): Promise<Record<string, string>> {
  const want = Array.from(new Set(paths.filter(Boolean) as string[])), out: Record<string, string> = {}, now = Date.now(), miss: string[] = []
  for (const p of want) { const c = cache.get(p); if (c && c.exp > now + 60000) out[p] = c.u; else miss.push(p) }
  if (miss.length) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(miss, ttl)
    for (const x of data ?? []) if (x.path && x.signedUrl) { out[x.path] = x.signedUrl; cache.set(x.path, { u: x.signedUrl, exp: now + ttl * 1000 }) }
  }
  return out
}

export async function putPb(path: string, b: Blob, type: string) {
  let last = ''
  for (let i = 0; i < 3; i++) {
    const { error } = await sb.storage.from(BUCKET).upload(path, b, { contentType: type, upsert: false })
    if (!error) return
    last = error.message; await sleep(1200 * 2 ** i)
  }
  throw new Error(last || 'Tải ảnh lên thất bại')
}
export async function removePb(paths: (string | null | undefined)[]) {
  const p = Array.from(new Set(paths.filter((x): x is string => !!x && !x.startsWith('/'))))
  if (!p.length) return
  const { error } = await sb.storage.from(BUCKET).remove(p)
  if (error) console.warn('pbooth remove', error.message)
}

// Một ảnh -> bản lớn (≤1600px) + bản nhỏ (480px), đã tải lên. Trả về các cột của pb_posts / pb_templates.
export async function putPair(spaceId: string, uid: string, src: Blob) {
  const { full, thumb, width, height } = await processImage(src)
  const image_path = pbPath(spaceId, uid), thumb_path = pbPath(spaceId, uid)
  try {
    await putPb(image_path, full, 'image/jpeg'); await putPb(thumb_path, thumb, 'image/jpeg')
  } catch (e) { await removePb([image_path, thumb_path]); throw e }
  return { image_path, thumb_path, width, height }
}

// ---------- Ảnh phụ của mẫu: frame PNG / hình nền tự tải lên ----------
// Tham chiếu '/...' là tệp có sẵn trong app (frame mẫu); còn lại là đường dẫn trong bucket `pbooth`.
const blobs = new Map<string, string>()
export async function assetUrl(ref: string): Promise<string> {
  if (ref.startsWith('/')) return ref
  const hit = blobs.get(ref); if (hit) return hit
  const u = (await signPb([ref]))[ref]; if (!u) throw new Error('Không mở được ảnh frame của mẫu')
  const r = await fetch(u); if (!r.ok) throw new Error('Không tải được ảnh frame của mẫu')
  const url = URL.createObjectURL(await r.blob())      // dùng blob nội bộ để vẽ canvas không bị chặn vì khác nguồn
  blobs.set(ref, url); return url
}
// Frame có lỗ trong suốt phải giữ PNG; hình nền thì JPEG cho nhẹ. Thu nhỏ còn ≤1600px.
export async function assetRef(spaceId: string, uid: string, url: string, kind: 'overlay' | 'bg'): Promise<string> {
  if (url.startsWith('/')) return url
  const bmp = await createImageBitmap(await (await fetch(url)).blob())
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.()
  const type = kind === 'overlay' ? 'image/png' : 'image/jpeg'
  const b = await new Promise<Blob>((ok, no) => c.toBlob(x => x ? ok(x) : no(new Error('Không nén được ảnh frame')), type, 0.88))
  const path = pbPath(spaceId, uid, kind === 'overlay' ? 'png' : 'jpg')
  await putPb(path, b, type); blobs.set(path, url); return path
}
