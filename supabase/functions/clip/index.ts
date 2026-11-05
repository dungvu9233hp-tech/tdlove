// Edge Function `clip`: nhận link TikTok, ghi vào bảng clips và báo cho người kia (ENT-02, ENT-04, ENT-05).
// Hai cách gọi:
//  1) Từ app: supabase.functions.invoke('clip', { body: { url } }), kèm JWT của người đang đăng nhập.
//  2) Từ Phím tắt iPhone: POST có header `x-share-token: <mã tạo trong app, trang Giải trí>`, không có JWT.
// Vì cách 2 không có JWT nên phải deploy bằng: supabase functions deploy clip --no-verify-jwt
// (hàm tự xác thực: hoặc mã gửi nhanh, hoặc JWT; thiếu cả hai thì trả 401).
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { canonical, clean, extractUrl, httpsUrl, resolveVideo } from './tiktok.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-share-token' }
const reply = (ok: boolean, message: string, status = 200, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok, message, ...extra }), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const sha256 = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')

// oEmbed chính thức của TikTok: lấy caption, tên tác giả, ảnh bìa. Lỗi thì vẫn lưu clip, chỉ thiếu mô tả.
async function oembed(link: string) {
  try {
    const r = await fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(link), { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return null
    const j = await r.json()
    return { title: clean(j.title, 300), author: clean(j.author_name, 80), thumb: httpsUrl(j.thumbnail_url) }
  } catch { return null }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(false, 'Chỉ nhận yêu cầu POST', 405)
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 1. Ai đang gửi?
    let uid: string | null = null
    const tok = req.headers.get('x-share-token')?.trim()
    if (tok) {
      if (!/^[0-9a-f]{64}$/.test(tok)) return reply(false, 'Mã gửi nhanh không đúng. Hãy tạo mã mới trong app (Giải trí).', 401)
      const { data } = await admin.from('share_tokens').select('user_id').eq('token_hash', await sha256(tok)).maybeSingle()
      uid = data?.user_id ?? null
    } else {
      const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
      uid = (await user.auth.getUser()).data.user?.id ?? null
    }
    if (!uid) return reply(false, 'Chưa đăng nhập, hoặc mã gửi nhanh đã bị thay. Hãy tạo mã mới trong app (Giải trí).', 401)
    const { data: me } = await admin.from('profiles').select('space_id,display_name').eq('id', uid).maybeSingle()
    if (!me?.space_id) return reply(false, 'Bạn chưa vào Space nào', 403)

    // 2. Đọc link: nhận JSON {url, note} hoặc chữ thường (Phím tắt có thể gửi thẳng đoạn văn bản được chia sẻ)
    const raw = (await req.text()).slice(0, 4000)
    let body: any; try { body = JSON.parse(raw) } catch { body = { url: raw } }
    const link = extractUrl(String(body?.url ?? ''))
    if (!link) return reply(false, 'Không thấy đường link nào trong nội dung đã gửi', 400)
    const v = await resolveVideo(link)
    if (!v) return reply(false, 'Chỉ nhận link video TikTok. Link ảnh, video riêng tư hoặc link hỏng thì chưa mở được.', 422)
    const full = canonical(v)
    const meta = await oembed(full)

    // 3. Lưu (gửi lại đúng clip cũ thì không thêm dòng)
    const { error } = await admin.from('clips').insert({
      space_id: me.space_id, sender: uid, video_id: v.id, url: full,
      title: meta?.title ?? null, author_name: meta?.author ?? null, thumb_url: meta?.thumb ?? null, note: clean(body?.note, 200),
    })
    if (error) {
      if (error.code === '23505') return reply(true, 'Clip này đã gửi rồi', 200, { duplicate: true })
      console.error('clip insert', error.message)
      return reply(false, 'Chưa lưu được clip, thử lại nhé', 500)
    }

    // 4. Báo cho người kia (lỗi thì bỏ qua, clip đã lưu rồi)
    const { data: partner } = await admin.from('profiles').select('display_name').eq('space_id', me.space_id).neq('id', uid).maybeSingle()
    try {
      webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
      const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth').eq('space_id', me.space_id).neq('user_id', uid)
      const payload = JSON.stringify({ kind: 'clip', title: me.display_name ?? 'Người ấy', body: meta?.title ? 'Gửi bạn một clip: ' + meta.title.slice(0, 80) : 'Gửi bạn một clip TikTok', url: '/fun', tag: 'clip' })
      for (const s of subs ?? []) {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 }) }
        catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          else console.error('clip push', e?.statusCode, e?.body)
        }
      }
    } catch (e) { console.error('clip push', e) }
    return reply(true, `Đã gửi cho ${partner?.display_name ?? 'người ấy'}`)
  } catch (e) { console.error(e); return reply(false, 'Lỗi máy chủ, thử lại sau nhé', 500) }
})
